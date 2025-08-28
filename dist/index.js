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
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TABLE_NAME = 'rightmove_properties_v2';
const WORKER_COUNT = process.env.WORKER_COUNT ? parseInt(process.env.WORKER_COUNT) : 8; // Increased for bulk processing
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
async function main() {
    // Only fetch properties that haven't been processed yet (no fullAddress)
    // This uses the idx_rp_ready_for_resolution index for optimal performance
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id, outcode, incode')
        .is('fullAddress', null);
    if (error) {
        console.error('Error fetching IDs:', error);
        return;
    }
    const queue = data?.map(row => ({
        id: row.id,
        outcode: row.outcode,
        incode: row.incode
    })) ?? [];
    console.log(`Fetched ${queue.length} property records for fullAddress processing`);
    let processedCount = 0;
    let successCount = 0;
    const totalCount = queue.length;
    const startTime = Date.now();
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
                // Update database with only the fullAddress
                const updateData = {
                    fullAddress: result.address || null // Only populate the fullAddress column
                };
                const { error: updateError } = await supabase
                    .from(TABLE_NAME)
                    .update(updateData)
                    .eq('id', id);
                processedCount++;
                if (result.success && result.address)
                    successCount++;
                if (updateError) {
                    console.error(`Error updating ID ${id}:`, updateError);
                }
                else {
                    const status = (result.success && result.address) ? `SUCCESS: ${result.address}` : `FAILED: ${result.error || 'No address found'}`;
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    const rate = processedCount / elapsed * 60; // per minute
                    const progress = ((processedCount / totalCount) * 100).toFixed(1);
                    console.log(`[${progress}%] ${processedCount}/${totalCount} - ID ${id} - ${status} (${rate.toFixed(0)}/min, ${successCount} successful)`);
                }
                sendNextJob(worker);
            }
            if (msg.type === 'done') {
                finishedWorkers++;
                if (finishedWorkers === WORKER_COUNT) {
                    const totalElapsed = Math.round((Date.now() - startTime) / 1000);
                    const successRate = ((successCount / processedCount) * 100).toFixed(1);
                    console.log('\n=== BULK PROCESSING COMPLETE ===');
                    console.log(`✅ Processed: ${processedCount} properties`);
                    console.log(`✅ Successful: ${successCount} (${successRate}%)`);
                    console.log(`⏱️ Total time: ${Math.floor(totalElapsed / 60)}m ${totalElapsed % 60}s`);
                    console.log(`📊 Average rate: ${(processedCount / totalElapsed * 60).toFixed(0)} properties/minute`);
                    console.log('✅ fullAddress column populated for successful entries');
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