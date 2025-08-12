import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { AddressResolver } from './pipeline/AddressResolver';
import { PropertyInput, PropertyImage, PropertyCoordinates } from './pipeline/types';
import { BulkProcessor } from './bulk/BulkProcessor';

// Production API Server with Bulk Processing Support
// Supports both single property resolution and bulk processing via Redis queue

interface SingleAPIResponse {
  success: boolean;
  propertyId: string;
  found: boolean;
  fullAddress: string | null;
  confidence: number;
  source: string;
  processingTime: number;
  weeks_OTM?: string;
  images?: PropertyImage[];
  coordinates?: PropertyCoordinates;
  metadata: {
    stepUsed: number;
    strategy?: string | null;
    verifiedData?: any | null;
    imagesExtracted?: number;
    galleryInteracted?: boolean;
  };
  error?: string;
}

interface BulkAPIResponse {
  success: boolean;
  jobId: string;
  message: string;
  totalProperties: number;
  estimatedTimeMinutes: number;
  progressUrl: string;
}

interface ProgressAPIResponse {
  success: boolean;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
    percentage: number;
  };
  estimatedTimeRemainingMinutes?: number;
  startedAt: string;
  completedAt?: string;
  results?: any[];
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize services
const resolver = new AddressResolver({
  timeoutMs: 60000, // 1 minute for single requests
  retryAttempts: 1
});

const bulkProcessor = new BulkProcessor(
  process.env.REDIS_URL || 'redis://localhost:6379',
  parseInt(process.env.WORKER_CONCURRENCY || '3', 10)
);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Single property resolution endpoint
app.post('/resolve', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { propertyId } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        error: 'Property ID is required'
      });
    }

    console.log(`[API] Resolving single property: ${propertyId}`);
    
    const input: PropertyInput = { propertyId: propertyId.toString() };
    const result = await resolver.resolve(input);
    const processingTime = Date.now() - startTime;

    const response: SingleAPIResponse = {
      success: result.success,
      propertyId: propertyId.toString(),
      found: result.success,
      fullAddress: result.address || null,
      confidence: result.confidence,
      source: result.source,
      processingTime,
      metadata: {
        stepUsed: result.source === 'friend_api' ? 1 : 2,
        strategy: result.metadata?.strategy || null,
        verifiedData: result.metadata?.verifiedData || null,
        imagesExtracted: result.images?.length || 0,
        galleryInteracted: result.metadata?.galleryInteracted || false,
      }
    };

    // Add optional fields if available
    if (result.metadata?.Weeks_OTM) {
      response.weeks_OTM = result.metadata.Weeks_OTM;
    }
    if (result.images) {
      response.images = result.images;
    }
    if (result.coordinates) {
      response.coordinates = result.coordinates;
    }
    if (result.error) {
      response.error = result.error;
    }

    res.json(response);

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[API] Single resolution error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      processingTime
    });
  }
});

// Bulk processing endpoint
app.post('/resolve/bulk', async (req: Request, res: Response) => {
  try {
    const { propertyIds, priority = 'normal' } = req.body;
    
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Property IDs array is required and must not be empty'
      });
    }

    if (propertyIds.length > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10,000 properties per bulk request'
      });
    }

    console.log(`[API] Starting bulk processing for ${propertyIds.length} properties`);
    
    // Convert all IDs to strings
    const stringIds = propertyIds.map(id => id.toString());
    
    // Enqueue the bulk job
    const jobId = await bulkProcessor.enqueueBulkJob(stringIds);
    
    // Estimate processing time (assuming 30 seconds average per property)
    const estimatedTimeMinutes = Math.ceil((propertyIds.length * 30) / 60);
    
    const response: BulkAPIResponse = {
      success: true,
      jobId,
      message: `Bulk job queued successfully with ${propertyIds.length} properties`,
      totalProperties: propertyIds.length,
      estimatedTimeMinutes,
      progressUrl: `/resolve/bulk/${jobId}/progress`
    };

    res.json(response);

  } catch (error: any) {
    console.error('[API] Bulk processing error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk job progress endpoint
app.get('/resolve/bulk/:jobId/progress', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const progress = await bulkProcessor.getBulkJobProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const response: ProgressAPIResponse = {
      success: true,
      jobId,
      status: progress.status,
      progress: {
        total: progress.totalProperties,
        processed: progress.processedProperties,
        successful: progress.successfulProperties,
        failed: progress.failedProperties,
        percentage: Math.round((progress.processedProperties / progress.totalProperties) * 100)
      },
      startedAt: progress.startedAt.toISOString(),
    };

    if (progress.estimatedTimeRemaining) {
      response.estimatedTimeRemainingMinutes = Math.ceil(progress.estimatedTimeRemaining / 1000 / 60);
    }

    if (progress.completedAt) {
      response.completedAt = progress.completedAt.toISOString();
    }

    // Include results if job is completed
    if (progress.status === 'completed') {
      const results = await bulkProcessor.getJobResults(jobId);
      if (results) {
        response.results = results;
      }
    }

    res.json(response);

  } catch (error: any) {
    console.error('[API] Progress check error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk job results endpoint
app.get('/resolve/bulk/:jobId/results', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const results = await bulkProcessor.getJobResults(jobId);
    
    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Job results not found'
      });
    }

    res.json({
      success: true,
      jobId,
      totalResults: results.length,
      results
    });

  } catch (error: any) {
    console.error('[API] Results fetch error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Queue statistics endpoint
app.get('/queue/stats', async (req: Request, res: Response) => {
  try {
    const stats = await bulkProcessor.getQueueStats();
    
    res.json({
      success: true,
      stats
    });

  } catch (error: any) {
    console.error('[API] Queue stats error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API] Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await bulkProcessor.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await bulkProcessor.cleanup();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Production Address Resolver API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Redis URL: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  console.log(`⚡ Worker Concurrency: ${process.env.WORKER_CONCURRENCY || '3'}`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log('  POST /resolve           - Single property resolution');
  console.log('  POST /resolve/bulk      - Bulk property processing');
  console.log('  GET  /resolve/bulk/:id/progress - Job progress');
  console.log('  GET  /resolve/bulk/:id/results  - Job results');
  console.log('  GET  /queue/stats       - Queue statistics');
  console.log('  GET  /health            - Health check');
});

export default app;