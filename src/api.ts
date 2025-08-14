import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Worker } from 'worker_threads';
import * as path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_CONCURRENT_WORKERS = parseInt(process.env.MAX_WORKERS || '4');

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Types
interface PropertyRequest {
  id: number;
  outcode?: string;
  incode?: string;
}

interface PropertyResponse {
  id: number;
  address: string | null;
  success: boolean;
  confidence: number;
  source?: string;
  error?: string;
  metadata?: any;
}

interface BatchRequest {
  properties: PropertyRequest[];
}

interface BatchResponse {
  success: boolean;
  processed: number;
  results: PropertyResponse[];
  summary: {
    successful: number;
    failed: number;
    totalTime: number;
    averageTime: number;
  };
}

// Parallel address fetching function
async function fetchAddressesInParallel(properties: PropertyRequest[]): Promise<BatchResponse> {
  const startTime = Date.now();
  
  console.log(`🚀 Processing ${properties.length} properties with ${MAX_CONCURRENT_WORKERS} workers`);
  
  return new Promise((resolve, reject) => {
    const queue = [...properties];
    let finishedWorkers = 0;
    let completedJobs = 0;
    const results: PropertyResponse[] = [];
    
    function spawnWorker(workerId: number) {
      const workerPath = path.join(__dirname, 'worker.js');
      const worker = new Worker(workerPath);
      
      console.log(`👷 Worker ${workerId} started`);
      
      worker.on('message', async (msg) => {
        if (msg.type === 'ready') {
          sendNextJob(worker, workerId);
        }
        
        if (msg.type === 'result') {
          const { id, result } = msg;
          completedJobs++;
          
          const response: PropertyResponse = {
            id,
            address: result.address || null,
            success: result.success,
            confidence: result.confidence,
            source: result.source,
            error: result.error,
            metadata: result.metadata
          };
          
          results.push(response);
          
          console.log(`✅ [${completedJobs}/${properties.length}] Property ${id}: ${
            result.success ? `"${result.address}" (${result.source})` : `Failed - ${result.error}`
          }`);
          
          sendNextJob(worker, workerId);
        }
        
        if (msg.type === 'done') {
          finishedWorkers++;
          console.log(`🏁 Worker ${workerId} finished (${finishedWorkers}/${MAX_CONCURRENT_WORKERS})`);
          
          if (finishedWorkers === MAX_CONCURRENT_WORKERS) {
            const totalTime = Date.now() - startTime;
            const successful = results.filter(r => r.success).length;
            const failed = results.length - successful;
            
            console.log(`🎉 All workers completed in ${totalTime}ms`);
            
            resolve({
              success: true,
              processed: results.length,
              results: results.sort((a, b) => a.id - b.id), // Sort by ID
              summary: {
                successful,
                failed,
                totalTime,
                averageTime: Math.round(totalTime / results.length)
              }
            });
          }
        }
      });
      
      worker.on('error', (error) => {
        console.error(`❌ Worker ${workerId} error:`, error);
        reject(new Error(`Worker ${workerId} failed: ${error.message}`));
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`⚠️ Worker ${workerId} exited with code ${code}`);
        }
      });
    }
    
    function sendNextJob(worker: Worker, workerId: number) {
      const property = queue.shift();
      if (property === undefined) {
        worker.postMessage({ type: 'no_more_jobs' });
      } else {
        console.log(`📤 Worker ${workerId}: Processing property ${property.id}`);
        worker.postMessage({ 
          type: 'job', 
          id: property.id,
          outcode: property.outcode,
          incode: property.incode
        });
      }
    }
    
    // Spawn workers
    const workerCount = Math.min(MAX_CONCURRENT_WORKERS, properties.length);
    for (let i = 0; i < workerCount; i++) {
      spawnWorker(i + 1);
    }
  });
}

// API Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    maxWorkers: MAX_CONCURRENT_WORKERS
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Address Resolver API',
    version: '1.0.0',
    description: 'Parallel address fetching for Rightmove properties',
    endpoints: {
      'POST /addresses': 'Fetch addresses for multiple properties',
      'GET /health': 'Health check'
    },
    example: {
      method: 'POST',
      url: '/addresses',
      body: {
        properties: [
          { id: 152205953, outcode: 'SW1W', incode: '8BT' },
          { id: 159015824, outcode: 'SW1W', incode: '9JA' },
          { id: 164304233, outcode: 'SW1W' }
        ]
      }
    }
  });
});

app.post('/addresses', async (req, res) => {
  try {
    const { properties }: BatchRequest = req.body;
    
    // Validation
    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: properties array is required and must not be empty',
        example: {
          properties: [
            { id: 152205953, outcode: 'SW1W', incode: '8BT' },
            { id: 159015824, outcode: 'SW1W', incode: '9JA' }
          ]
        }
      });
    }
    
    // Validate individual properties
    for (const property of properties) {
      if (!property.id || typeof property.id !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Invalid property: id must be a number',
          invalidProperty: property
        });
      }
    }
    
    // Limit batch size
    const MAX_BATCH_SIZE = 100;
    if (properties.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Batch size too large: maximum ${MAX_BATCH_SIZE} properties allowed`,
        received: properties.length
      });
    }
    
    console.log(`📥 Received batch request for ${properties.length} properties`);
    
    // Process addresses
    const result = await fetchAddressesInParallel(properties);
    
    res.json(result);
    
  } catch (error: any) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: ['GET /', 'GET /health', 'POST /addresses']
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Address Resolver API listening on port ${PORT}`);
  console.log(`🔧 Max concurrent workers: ${MAX_CONCURRENT_WORKERS}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/`);
});

export default app;