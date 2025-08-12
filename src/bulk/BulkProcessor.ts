import Bull from 'bull';
import { Redis } from 'ioredis';
import { AddressResolver } from '../pipeline/AddressResolver';
import { PropertyInput, AddressResult } from '../pipeline/types';

export interface BulkJobData {
  propertyIds: string[];
  batchIndex: number;
  totalBatches: number;
  priority: number;
  jobId: string;
}

export interface BulkJobProgress {
  jobId: string;
  totalProperties: number;
  processedProperties: number;
  successfulProperties: number;
  failedProperties: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  estimatedTimeRemaining?: number;
  errors: string[];
}

export class BulkProcessor {
  private queue: Bull.Queue;
  private redis: Redis;
  private concurrency: number;
  private resolver: AddressResolver;

  constructor(redisUrl = 'redis://localhost:6379', concurrency = 3) {
    this.redis = new Redis(redisUrl);
    this.queue = new Bull('address-resolution', {
      redis: redisUrl,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 }
      }
    });

    this.concurrency = concurrency;
    this.resolver = new AddressResolver({
      timeoutMs: 60000, // 1 minute per property for bulk
      retryAttempts: 1
    });

    this.setupQueueProcessors();
  }

  private setupQueueProcessors() {
    // Process bulk batches
    this.queue.process('bulk-batch', 2, async (job) => {
      return this.processBatch(job.data);
    });

    // Process real-time jobs with higher priority
    this.queue.process('realtime', 5, async (job) => {
      return this.processRealtime(job.data);
    });

    // Queue event listeners
    this.queue.on('completed', (job, result) => {
      console.log(`[BulkProcessor] Job ${job.id} completed:`, {
        type: job.name,
        processed: result.processed,
        successful: result.successful,
        failed: result.failed
      });
    });

    this.queue.on('failed', (job, err) => {
      console.error(`[BulkProcessor] Job ${job.id} failed:`, err.message);
    });

    this.queue.on('progress', (job, progress) => {
      console.log(`[BulkProcessor] Job ${job.id} progress: ${progress}%`);
    });
  }

  async enqueueBulkJob(propertyIds: string[], batchSize = 50): Promise<string> {
    const jobId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chunks = this.chunkArray(propertyIds, batchSize);
    
    console.log(`[BulkProcessor] Enqueueing bulk job ${jobId} with ${chunks.length} batches`);

    // Initialize job progress
    await this.initializeBulkJobProgress(jobId, propertyIds.length);

    // Enqueue all batches
    for (let i = 0; i < chunks.length; i++) {
      await this.queue.add('bulk-batch', {
        propertyIds: chunks[i],
        batchIndex: i,
        totalBatches: chunks.length,
        priority: 1,
        jobId
      }, {
        priority: 1,
        delay: i * 1000 // Stagger batches by 1 second
      });
    }

    return jobId;
  }

  async enqueueRealTimeJob(propertyIds: string[]): Promise<string> {
    const jobId = `realtime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = await this.queue.add('realtime', {
      propertyIds,
      jobId,
      priority: 10
    }, {
      priority: 10 // Higher priority than bulk
    });

    return jobId;
  }

  private async processBatch(data: BulkJobData): Promise<any> {
    const { propertyIds, batchIndex, totalBatches, jobId } = data;
    const startTime = Date.now();
    
    console.log(`[BulkProcessor] Processing batch ${batchIndex + 1}/${totalBatches} with ${propertyIds.length} properties`);

    // Process properties in batches based on concurrency
    const results = [];
    for (let i = 0; i < propertyIds.length; i += this.concurrency) {
      const batch = propertyIds.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(propertyId => this.processProperty(propertyId))
      );
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    const processingTime = Date.now() - startTime;

    // Update job progress
    await this.updateBulkJobProgress(jobId, propertyIds.length, successful, failed);
    
    // Debug logging
    console.log(`[BulkProcessor] Batch ${batchIndex + 1}/${totalBatches} progress updated: +${propertyIds.length} processed, +${successful} successful, +${failed} failed`);

    // Store detailed results for statistics
    const detailedResults = results.map((result, index) => ({
      propertyId: propertyIds[index],
      success: result.status === 'fulfilled' && result.value?.success,
      source: result.status === 'fulfilled' ? result.value?.source : 'error',
      confidence: result.status === 'fulfilled' ? result.value?.confidence : 0,
      address: result.status === 'fulfilled' ? result.value?.address : null,
      error: result.status === 'rejected' ? result.reason?.message : null
    }));
    
    // Append to stored results
    const existingResults = await this.redis.get(`results:${jobId}`);
    const allResults = existingResults ? JSON.parse(existingResults) : [];
    allResults.push(...detailedResults);
    await this.redis.set(`results:${jobId}`, JSON.stringify(allResults), 'EX', 3600); // 1 hour expiry
    
    console.log(`[BulkProcessor] Batch ${batchIndex + 1}/${totalBatches} completed: ${successful}/${propertyIds.length} successful in ${processingTime}ms`);

    return {
      batchIndex,
      totalBatches,
      processed: propertyIds.length,
      successful,
      failed,
      processingTime,
      results: results.map((result, index) => ({
        propertyId: propertyIds[index],
        success: result.status === 'fulfilled' ? result.value.success : false,
        error: result.status === 'rejected' ? result.reason.message : 
               (result.status === 'fulfilled' && !result.value.success ? result.value.error : undefined)
      }))
    };
  }

  private async processRealtime(data: { propertyIds: string[], jobId: string }): Promise<any> {
    const { propertyIds, jobId } = data;
    const startTime = Date.now();
    
    console.log(`[BulkProcessor] Processing realtime job ${jobId} with ${propertyIds.length} properties`);

    const results = await Promise.allSettled(
      propertyIds.map(propertyId => this.processProperty(propertyId))
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    const processingTime = Date.now() - startTime;

    return {
      jobId,
      processed: propertyIds.length,
      successful,
      failed,
      processingTime,
      results: results.map((result, index) => ({
        propertyId: propertyIds[index],
        success: result.status === 'fulfilled' ? result.value.success : false,
        address: result.status === 'fulfilled' ? result.value.address : null,
        confidence: result.status === 'fulfilled' ? result.value.confidence : 0,
        source: result.status === 'fulfilled' ? result.value.source : 'error',
        error: result.status === 'rejected' ? result.reason.message : 
               (result.status === 'fulfilled' && !result.value.success ? result.value.error : undefined)
      }))
    };
  }

  private async processProperty(propertyId: string): Promise<AddressResult> {
    try {
      const input: PropertyInput = { propertyId };
      const result = await this.resolver.resolve(input);
      
      // Optional: Store result in database/cache here
      // await this.storeResult(propertyId, result);
      
      return result;
    } catch (error: any) {
      console.error(`[BulkProcessor] Error processing ${propertyId}:`, error.message);
      return {
        success: false,
        confidence: 0,
        source: 'error',
        metadata: {
          stepUsed: 0,
          apiResponseTime: 0,
          fallbackReason: error.message
        },
        error: error.message
      };
    }
  }

  private async initializeBulkJobProgress(jobId: string, totalProperties: number) {
    const progress: BulkJobProgress = {
      jobId,
      totalProperties,
      processedProperties: 0,
      successfulProperties: 0,
      failedProperties: 0,
      status: 'pending',
      startedAt: new Date(),
      errors: []
    };

    await this.redis.set(`progress:${jobId}`, JSON.stringify(progress), 'EX', 86400); // 24 hours expiry
  }

  private async updateBulkJobProgress(jobId: string, processed: number, successful: number, failed: number) {
    const existingProgressStr = await this.redis.get(`progress:${jobId}`);
    if (!existingProgressStr) {
      console.log(`[BulkProcessor] No progress found for job ${jobId}`);
      return;
    }

    const progress: BulkJobProgress = JSON.parse(existingProgressStr);
    
    console.log(`[BulkProcessor] Updating progress for ${jobId}: current ${progress.processedProperties}/${progress.totalProperties}, adding +${processed} processed, +${successful} successful, +${failed} failed`);
    
    // Convert string dates back to Date objects
    if (typeof progress.startedAt === 'string') {
      progress.startedAt = new Date(progress.startedAt);
    }
    if (progress.completedAt && typeof progress.completedAt === 'string') {
      progress.completedAt = new Date(progress.completedAt);
    }
    
    progress.processedProperties += processed;
    progress.successfulProperties += successful;
    progress.failedProperties += failed;
    progress.status = progress.processedProperties >= progress.totalProperties ? 'completed' : 'processing';
    
    console.log(`[BulkProcessor] New progress for ${jobId}: ${progress.processedProperties}/${progress.totalProperties} (${progress.successfulProperties} successful, ${progress.failedProperties} failed) - Status: ${progress.status}`);
    
    if (progress.status === 'completed') {
      progress.completedAt = new Date();
      console.log(`[BulkProcessor] Job ${jobId} marked as completed!`);
    }

    // Calculate estimated time remaining
    if (progress.processedProperties > 0) {
      const elapsedTime = Date.now() - progress.startedAt.getTime();
      const rate = progress.processedProperties / elapsedTime;
      const remaining = progress.totalProperties - progress.processedProperties;
      progress.estimatedTimeRemaining = remaining / rate;
    }

    await this.redis.set(`progress:${jobId}`, JSON.stringify(progress), 'EX', 86400);
  }

  async getBulkJobProgress(jobId: string): Promise<BulkJobProgress | null> {
    const progressStr = await this.redis.get(`progress:${jobId}`);
    if (!progressStr) return null;
    
    const progress: BulkJobProgress = JSON.parse(progressStr);
    
    // Convert string dates back to Date objects
    if (typeof progress.startedAt === 'string') {
      progress.startedAt = new Date(progress.startedAt);
    }
    if (progress.completedAt && typeof progress.completedAt === 'string') {
      progress.completedAt = new Date(progress.completedAt);
    }
    
    return progress;
  }

  async getJobResults(jobId: string): Promise<any[] | null> {
    const resultsStr = await this.redis.get(`results:${jobId}`);
    return resultsStr ? JSON.parse(resultsStr) : null;
  }

  async cleanup(): Promise<void> {
    try {
      await this.queue.close();
      await this.redis.disconnect();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async getQueueStats() {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }

  async shutdown() {
    await this.queue.close();
    await this.redis.quit();
  }
}