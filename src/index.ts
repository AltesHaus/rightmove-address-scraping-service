import { Worker } from 'worker_threads';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const TABLE_NAME = 'rightmove_properties_v2';
const WORKER_COUNT = 4;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('id, outcode, incode');

  if (error) {
    console.error('Error fetching IDs:', error);
    return;
  }

  const queue = data?.map(row => ({ 
    id: row.id, 
    outcode: row.outcode,
    incode: row.incode
  })) ?? [];
  console.log(`Fetched ${queue.length} property records`);

  let finishedWorkers = 0;

  function spawnWorker() {
    const worker = new Worker(path.join(__dirname, 'worker.js'));

    worker.on('message', async (msg) => {
      if (msg.type === 'ready') {
        // Send first job
        sendNextJob(worker);
      }
      if (msg.type === 'result') {
        const { id, result } = msg;
        
        // Update database with the address result (no images/coordinates)
        const updateData = {
          processed_value: result.address || null,
          success: result.success,
          confidence: result.confidence,
          source: result.source,
          error: result.error || null,
          metadata: JSON.stringify(result.metadata),
          processed_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabase
          .from(TABLE_NAME)
          .update(updateData)
          .eq('id', id);

        if (updateError) {
          console.error(`Error updating ID ${id}:`, updateError);
        } else {
          const status = result.success ? `SUCCESS: ${result.address}` : `FAILED: ${result.error}`;
          console.log(`Updated ID ${id} - ${status} (confidence: ${result.confidence})`);
        }

        sendNextJob(worker);
      }
      if (msg.type === 'done') {
        finishedWorkers++;
        if (finishedWorkers === WORKER_COUNT) {
          console.log('All workers done.');
          process.exit(0);
        }
      }
    });
  }

  function sendNextJob(worker: Worker) {
    const property = queue.shift();
    if (property === undefined) {
      worker.postMessage({ type: 'no_more_jobs' });
    } else {
      worker.postMessage({ 
        type: 'job', 
        id: property.id, 
        outcode: property.outcode,
        incode: property.incode
      });
    }
  }

  for (let i = 0; i < WORKER_COUNT; i++) {
    spawnWorker();
  }
}

main();
