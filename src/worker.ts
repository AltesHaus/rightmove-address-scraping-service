import { parentPort } from 'worker_threads';
import { Step1FriendAPI } from './steps/Step1FriendAPI';
import { Step2RightmoveLandRegistry } from './steps/Step2RightmoveLandRegistry';
import { PropertyInput, AddressResult } from './utils/types';

async function processProperty(id: number, outcode?: string, incode?: string): Promise<AddressResult> {
  const propertyId = id.toString();
  
  const input: PropertyInput = { 
    propertyId, 
    outcode,
    incode
  };
  
  console.log(`[Worker] Processing property ID: ${propertyId}`);
  
  try {
    // Step 1: Try Friend API first (highest confidence)
    const step1 = new Step1FriendAPI();
    const result1 = await step1.execute(input);
    
    if (result1.success && result1.address) {
      console.log(`[Worker] Step1 succeeded for ${propertyId}: ${result1.address}`);
      return {
        success: true,
        address: result1.address,
        confidence: result1.confidence,
        source: 'friend_api',
        metadata: {
          stepUsed: 1,
          apiResponseTime: result1.metadata?.responseTime || 0,
          Weeks_OTM: result1.metadata?.Weeks_OTM,
          rawResponse: result1.metadata?.rawResponse
        }
      };
    }
    
    console.log(`[Worker] Step1 failed for ${propertyId}, trying Step2...`);
    
    // Step 2: Fallback to Rightmove + Land Registry
    const step2 = new Step2RightmoveLandRegistry();
    const result2 = await step2.execute(input);
    
    if (result2.success && result2.address) {
      console.log(`[Worker] Step2 succeeded for ${propertyId}: ${result2.address}`);
      return {
        success: true,
        address: result2.address,
        confidence: result2.confidence,
        source: 'rightmove_land_registry',
        metadata: {
          stepUsed: 2,
          apiResponseTime: result2.metadata?.responseTime || 0,
          strategy: result2.metadata?.strategy,
          verifiedData: result2.metadata?.verifiedData,
          rawResponse: result2.metadata?.rawResponse
        }
      };
    }
    
    // Both steps failed
    const allErrors = [result1.error, result2.error].filter((error): error is string => Boolean(error));
    console.log(`[Worker] Both steps failed for ${propertyId}. Errors:`, allErrors);
    
    return {
      success: false,
      confidence: 0,
      source: 'error',
      metadata: {
        stepUsed: 2,
        apiResponseTime: (result1.metadata?.responseTime || 0) + (result2.metadata?.responseTime || 0),
        allErrors,
        fallbackReason: 'Both Friend API and Rightmove+LandRegistry failed'
      },
      error: `All steps failed: ${allErrors.join('; ')}`
    };
    
  } catch (error: any) {
    console.error(`[Worker] Unexpected error processing ${propertyId}:`, error.message);
    return {
      success: false,
      confidence: 0,
      source: 'error',
      metadata: {
        stepUsed: 0,
        apiResponseTime: 0
      },
      error: `Unexpected error: ${error.message}`
    };
  }
}

parentPort?.postMessage({ type: 'ready' });

parentPort?.on('message', async (msg) => {
  if (msg.type === 'job') {
    const result = await processProperty(msg.id, msg.outcode, msg.incode);
    parentPort?.postMessage({ type: 'result', id: msg.id, result });
  }
  if (msg.type === 'no_more_jobs') {
    parentPort?.postMessage({ type: 'done' });
  }
});
