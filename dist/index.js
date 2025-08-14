"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const supabase_js_1 = require("@supabase/supabase-js");
const path = __importStar(require("path"));
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TABLE_NAME = 'rightmove_properties_v2';
const WORKER_COUNT = 4;
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
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
        const worker = new worker_threads_1.Worker(path.join(__dirname, 'worker.js'));
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
                }
                else {
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
    function sendNextJob(worker) {
        const property = queue.shift();
        if (property === undefined) {
            worker.postMessage({ type: 'no_more_jobs' });
        }
        else {
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
//# sourceMappingURL=index.js.map