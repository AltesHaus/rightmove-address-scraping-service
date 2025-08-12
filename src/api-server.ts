import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { AddressResolver } from './pipeline/AddressResolver';
import { PropertyInput } from './pipeline/types';

interface APIResponse {
  success: boolean;
  propertyId: string;
  found: boolean;
  fullAddress: string | null;
  confidence: number;
  source: string;
  processingTime: number;
  weeks_OTM?: string;
  metadata: {
    stepUsed: number;
    strategy?: string | null;
    verifiedData?: any | null;
  };
  error?: string;
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize the address resolver
const resolver = new AddressResolver({
  timeoutMs: 180000, // 3 minutes for complex operations
  retryAttempts: 1
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    pipeline: resolver.getSteps()
  });
});

// Single property address resolution
app.get('/api/resolve/:propertyId', async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  
  if (!propertyId || !/^\d+$/.test(propertyId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid property ID - must be numeric',
      propertyId: propertyId || null
    });
  }

  console.log(`[API] Resolving address for property ${propertyId}`);
  
  try {
    const input: PropertyInput = { propertyId };
    const result = await resolver.resolve(input);
    
    // Format response according to requirements
    const response: APIResponse = {
      success: result.success,
      propertyId,
      found: result.success,
      fullAddress: result.success ? result.address || null : null,
      confidence: result.confidence,
      source: result.source,
      processingTime: result.metadata.apiResponseTime,
      metadata: {
        stepUsed: result.metadata.stepUsed,
        strategy: result.metadata.strategy || null,
        verifiedData: result.metadata.verifiedData || null
      }
    };

    // Add weeks_OTM if available (from Friend API)
    if (result.metadata.Weeks_OTM !== undefined) {
      response.weeks_OTM = result.metadata.Weeks_OTM;
    }

    if (!result.success) {
      response.error = result.error || 'Address not found';
      console.log(`[API] Failed to resolve ${propertyId}: ${response.error}`);
    } else {
      console.log(`[API] Successfully resolved ${propertyId}: ${result.address}`);
    }
    
    res.json(response);
    
  } catch (error: any) {
    console.error(`[API] Error resolving ${propertyId}:`, error.message);
    res.status(500).json({
      success: false,
      propertyId,
      found: false,
      fullAddress: null,
      error: error.message,
      confidence: 0
    });
  }
});

// Batch property resolution
app.post('/api/resolve-batch', async (req: Request, res: Response) => {
  const { propertyIds } = req.body;
  
  if (!Array.isArray(propertyIds)) {
    return res.status(400).json({
      success: false,
      error: 'propertyIds must be an array'
    });
  }
  
  if (propertyIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'propertyIds array cannot be empty'
    });
  }
  
  if (propertyIds.length > 10) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 10 properties per batch request'
    });
  }
  
  // Validate all property IDs
  for (const id of propertyIds) {
    if (!id || !/^\d+$/.test(id.toString())) {
      return res.status(400).json({
        success: false,
        error: `Invalid property ID: ${id} - must be numeric`
      });
    }
  }

  console.log(`[API] Processing batch of ${propertyIds.length} properties: ${propertyIds.join(', ')}`);
  
  const results = [];
  const startTime = Date.now();
  
  try {
    for (const propertyId of propertyIds) {
      console.log(`[API] Processing ${propertyId} (${results.length + 1}/${propertyIds.length})`);
      
      try {
        const input: PropertyInput = { propertyId: propertyId.toString() };
        const result = await resolver.resolve(input);
        
        const response: APIResponse = {
          success: result.success,
          propertyId: propertyId.toString(),
          found: result.success,
          fullAddress: result.success ? result.address || null : null,
          confidence: result.confidence,
          source: result.source,
          processingTime: result.metadata.apiResponseTime,
          metadata: {
            stepUsed: result.metadata.stepUsed,
            strategy: result.metadata.strategy || null,
            verifiedData: result.metadata.verifiedData || null
          }
        };

        // Add weeks_OTM if available (from Friend API)
        if (result.metadata.Weeks_OTM !== undefined) {
          response.weeks_OTM = result.metadata.Weeks_OTM;
        }

        if (!result.success) {
          response.error = result.error || 'Address not found';
        }
        
        results.push(response);
        
      } catch (error: any) {
        console.error(`[API] Error processing ${propertyId}:`, error.message);
        results.push({
          success: false,
          propertyId: propertyId.toString(),
          found: false,
          fullAddress: null,
          error: error.message,
          confidence: 0,
          processingTime: 0
        });
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    
    console.log(`[API] Batch completed: ${successful}/${results.length} successful in ${totalTime}ms`);
    
    res.json({
      success: true,
      totalProcessed: results.length,
      successful,
      failed: results.length - successful,
      totalProcessingTime: totalTime,
      results
    });
    
  } catch (error: any) {
    console.error(`[API] Batch processing error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      partialResults: results
    });
  }
});

// Simple endpoint that returns just the address (for backwards compatibility)
app.get('/api/address/:propertyId', async (req: Request, res: Response) => {
  const { propertyId } = req.params;
  
  if (!propertyId || !/^\d+$/.test(propertyId)) {
    return res.status(400).json({
      error: 'Invalid property ID - must be numeric'
    });
  }

  try {
    const input: PropertyInput = { propertyId };
    const result = await resolver.resolve(input);
    
    if (result.success) {
      res.json({
        fullAddress: result.address,
        found: true
      });
    } else {
      res.json({
        fullAddress: null,
        found: false,
        error: result.error || 'Address not found'
      });
    }
    
  } catch (error: any) {
    res.status(500).json({
      fullAddress: null,
      found: false,
      error: error.message
    });
  }
});

// Pipeline status endpoint
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    status: 'running',
    pipeline: {
      steps: resolver.getSteps(),
      config: resolver.getConfig()
    },
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API] Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/resolve/:propertyId',
      'POST /api/resolve-batch',
      'GET /api/address/:propertyId',
      'GET /api/status'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Address Resolver API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🏠 Single property: GET http://localhost:${PORT}/api/resolve/:propertyId`);
  console.log(`📦 Batch resolve: POST http://localhost:${PORT}/api/resolve-batch`);
  console.log(`📄 Simple address: GET http://localhost:${PORT}/api/address/:propertyId`);
  console.log(`📊 Pipeline status: GET http://localhost:${PORT}/api/status`);
  console.log(`\n💡 Pipeline: Friend API → Rightmove + Land Registry`);
  console.log(`💡 Example: curl http://localhost:${PORT}/api/resolve/159860288`);
});