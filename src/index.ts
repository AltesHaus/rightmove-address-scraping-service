import { Worker } from 'worker_threads';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const TABLE_NAME = 'rightmove_properties_v2';
const WORKER_COUNT = 4;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('id');

  if (error) {
    console.error('Error fetching IDs:', error);
    return;
  }

  const queue = data?.map(row => row.id) ?? [];
  console.log(`Fetched ${queue.length} IDs`);

  let finishedWorkers = 0;

  function spawnWorker() {
    const worker = new Worker('./worker.ts');

    worker.on('message', async (msg) => {
      if (msg.type === 'ready') {
        // Send first job
        sendNextJob(worker);
      }
      if (msg.type === 'result') {
        const { id, result } = msg;
        const { error: updateError } = await supabase
          .from(TABLE_NAME)
          .update({ processed_value: result })
          .eq('id', id);

        if (updateError) {
          console.error(`Error updating ID ${id}:`, updateError);
        } else {
          console.log(`Updated ID ${id} with result ${result}`);
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
    const id = queue.shift();
    if (id === undefined) {
      worker.postMessage({ type: 'no_more_jobs' });
    } else {
      worker.postMessage({ type: 'job', id });
    }
  }

  for (let i = 0; i < WORKER_COUNT; i++) {
    spawnWorker();
  }
}

main();
