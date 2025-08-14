"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const Step2RightmoveLandRegistry_1 = require("./steps/Step2RightmoveLandRegistry");
/**
 * Worker that ONLY tests Step2 (Rightmove + Land Registry)
 * Bypasses Step1 (Friend API) to specifically test Land Registry verification
 */
async function processPropertyStep2Only(id, outcode, incode) {
    const propertyId = id.toString();
    const input = { propertyId, outcode, incode };
    const fullPostcode = outcode && incode ? `${outcode} ${incode}` : outcode;
    console.log(`[Step2-Only Worker] Processing property ID: ${propertyId} with postcode parts: ${outcode} ${incode || '(outcode only)'}`);
    if (!outcode) {
        return {
            success: false,
            confidence: 0,
            source: 'error',
            metadata: {
                stepUsed: 2,
                apiResponseTime: 0
            },
            error: 'No outcode provided for Land Registry verification'
        };
    }
    try {
        // Skip Step1 - go directly to Step2 (Rightmove + Land Registry)
        console.log(`[Step2-Only Worker] Testing Rightmove + Land Registry for ${propertyId}...`);
        const step2 = new Step2RightmoveLandRegistry_1.Step2RightmoveLandRegistry();
        const result2 = await step2.execute(input);
        if (result2.success && result2.address) {
            console.log(`[Step2-Only Worker] Step2 succeeded for ${propertyId}: ${result2.address}`);
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
        // Step2 failed
        console.log(`[Step2-Only Worker] Step2 failed for ${propertyId}: ${result2.error}`);
        return {
            success: false,
            confidence: 0,
            source: 'rightmove_land_registry',
            metadata: {
                stepUsed: 2,
                apiResponseTime: result2.metadata?.responseTime || 0
            },
            error: result2.error || 'Rightmove + Land Registry verification failed'
        };
    }
    catch (error) {
        console.error(`[Step2-Only Worker] Unexpected error processing ${propertyId}:`, error.message);
        return {
            success: false,
            confidence: 0,
            source: 'error',
            metadata: {
                stepUsed: 2,
                apiResponseTime: 0
            },
            error: `Unexpected error: ${error.message}`
        };
    }
}
worker_threads_1.parentPort?.postMessage({ type: 'ready' });
worker_threads_1.parentPort?.on('message', async (msg) => {
    if (msg.type === 'job') {
        const result = await processPropertyStep2Only(msg.id, msg.outcode, msg.incode);
        worker_threads_1.parentPort?.postMessage({ type: 'result', id: msg.id, result });
    }
    if (msg.type === 'no_more_jobs') {
        worker_threads_1.parentPort?.postMessage({ type: 'done' });
    }
});
//# sourceMappingURL=worker-step2-only.js.map