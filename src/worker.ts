import { parentPort } from 'worker_threads';

async function processId(id: number) {
  await new Promise(res => setTimeout(res, Math.random() * 1000));
  return `value_for_${id}`;
}

parentPort?.postMessage({ type: 'ready' });

parentPort?.on('message', async (msg) => {
  if (msg.type === 'job') {
    const result = await processId(msg.id);
    parentPort?.postMessage({ type: 'result', id: msg.id, result });
  }
  if (msg.type === 'no_more_jobs') {
    parentPort?.postMessage({ type: 'done' });
  }
});
