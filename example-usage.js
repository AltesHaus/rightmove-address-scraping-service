/**
 * Example: How to use the parallel address fetching system
 * 
 * This shows how to process a list of property IDs in parallel
 * without the Supabase dependency (for testing/standalone usage)
 */

const { Worker } = require('worker_threads');
const path = require('path');

async function fetchAddressesInParallel(properties, options = {}) {
  const {
    workerCount = 4,
    onProgress = null,
    onComplete = null
  } = options;
  
  console.log(`🚀 Starting parallel address fetching for ${properties.length} properties using ${workerCount} workers`);
  
  return new Promise((resolve, reject) => {
    const queue = [...properties]; // Copy array
    let finishedWorkers = 0;
    let completedJobs = 0;
    const results = [];
    
    function spawnWorker() {
      const workerPath = path.join(__dirname, 'dist', 'worker.js');
      const worker = new Worker(workerPath);
      
      worker.on('message', async (msg) => {
        if (msg.type === 'ready') {
          sendNextJob(worker);
        }
        
        if (msg.type === 'result') {
          const { id, result } = msg;
          completedJobs++;
          results.push({ propertyId: id, ...result });
          
          // Progress callback
          if (onProgress) {
            onProgress({
              completed: completedJobs,
              total: properties.length,
              propertyId: id,
              result: result
            });
          }
          
          console.log(`✅ [${completedJobs}/${properties.length}] Property ${id}: ${
            result.success ? `${result.address} (${result.source})` : `Failed - ${result.error}`
          }`);
          
          sendNextJob(worker);
        }
        
        if (msg.type === 'done') {
          finishedWorkers++;
          if (finishedWorkers === workerCount) {
            // All workers finished
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            
            const summary = {
              total: results.length,
              successful: successful.length,
              failed: failed.length,
              results: results
            };
            
            console.log(`\n🎉 All workers completed!`);
            console.log(`📊 Results: ${successful.length} successful, ${failed.length} failed`);
            
            if (onComplete) {
              onComplete(summary);
            }
            
            resolve(summary);
          }
        }
      });
      
      worker.on('error', (error) => {
        console.error('❌ Worker error:', error);
        reject(error);
      });
    }
    
    function sendNextJob(worker) {
      const property = queue.shift();
      if (property === undefined) {
        worker.postMessage({ type: 'no_more_jobs' });
      } else {
        // Support both {id, outcode, incode} object and simple number formats
        const propertyId = typeof property === 'object' ? property.id : property;
        const outcode = typeof property === 'object' ? property.outcode : undefined;
        const incode = typeof property === 'object' ? property.incode : undefined;
        worker.postMessage({ type: 'job', id: propertyId, outcode, incode });
      }
    }
    
    // Spawn workers
    for (let i = 0; i < workerCount; i++) {
      spawnWorker();
    }
  });
}

// Example usage:
async function exampleUsage() {
  // Example with property data including outcode/incode parts
  const properties = [
    { id: 123456789, outcode: 'SW1W', incode: '8DB' },  // Full postcode parts
    { id: 987654321, outcode: 'NW3', incode: '7RT' },   // Full postcode parts
    { id: 456789123, outcode: 'SW1W' }                  // Only outcode - fallback strategy
  ];
  
  try {
    const results = await fetchAddressesInParallel(properties, {
      workerCount: 2,
      onProgress: (progress) => {
        console.log(`Progress: ${progress.completed}/${progress.total} completed`);
      },
      onComplete: (summary) => {
        console.log('Final summary:', {
          totalProcessed: summary.total,
          successRate: `${((summary.successful / summary.total) * 100).toFixed(1)}%`
        });
      }
    });
    
    // Process results
    console.log('\n📋 Detailed Results:');
    results.results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.propertyId}: ${result.address}`);
        console.log(`   Source: ${result.source}, Confidence: ${result.confidence}`);
        if (result.metadata?.Weeks_OTM) {
          console.log(`   Weeks on Market: ${result.metadata.Weeks_OTM}`);
        }
      } else {
        console.log(`❌ ${result.propertyId}: ${result.error}`);
      }
    });
    
  } catch (error) {
    console.error('Failed to fetch addresses:', error);
  }
}

// Export for use in other modules
module.exports = {
  fetchAddressesInParallel
};

// Run example if this file is executed directly
if (require.main === module) {
  exampleUsage();
}