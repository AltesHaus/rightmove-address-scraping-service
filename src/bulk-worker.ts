#!/usr/bin/env node

/**
 * Bulk Processing Worker
 * Runs the queue worker for bulk address resolution
 */

import dotenv from 'dotenv';
import { BulkProcessor } from './bulk/BulkProcessor';

// Load environment variables
dotenv.config();

async function startWorker() {
  console.log('🚀 Starting Bulk Processing Worker...');
  
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '3');
  
  console.log(`📡 Redis URL: ${redisUrl}`);
  console.log(`⚡ Concurrency: ${concurrency}`);
  
  const processor = new BulkProcessor(redisUrl, concurrency);
  
  console.log('✅ Worker started and listening for jobs...');
  console.log('📊 Queue stats will be logged every 30 seconds');
  
  // Log queue stats periodically
  setInterval(async () => {
    try {
      const stats = await processor.getQueueStats();
      console.log(`[Worker Stats] Waiting: ${stats.waiting}, Active: ${stats.active}, Completed: ${stats.completed}, Failed: ${stats.failed}`);
    } catch (error: any) {
      console.error('[Worker] Error getting queue stats:', error.message);
    }
  }, 30000);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Gracefully shutting down worker...');
    await processor.shutdown();
    console.log('✅ Worker shutdown complete');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Gracefully shutting down worker...');
    await processor.shutdown();
    console.log('✅ Worker shutdown complete');
    process.exit(0);
  });
}

startWorker().catch((error) => {
  console.error('💥 Worker startup failed:', error);
  process.exit(1);
});