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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const worker_threads_1 = require("worker_threads");
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const MAX_CONCURRENT_WORKERS = parseInt(process.env.MAX_WORKERS || '4');
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
// Parallel address fetching function
async function fetchAddressesInParallel(properties) {
    const startTime = Date.now();
    console.log(`🚀 Processing ${properties.length} properties with ${MAX_CONCURRENT_WORKERS} workers`);
    return new Promise((resolve, reject) => {
        const queue = [...properties];
        let finishedWorkers = 0;
        let completedJobs = 0;
        const results = [];
        function spawnWorker(workerId) {
            const workerPath = path.join(__dirname, 'worker.js');
            const worker = new worker_threads_1.Worker(workerPath);
            console.log(`👷 Worker ${workerId} started`);
            worker.on('message', async (msg) => {
                if (msg.type === 'ready') {
                    sendNextJob(worker, workerId);
                }
                if (msg.type === 'result') {
                    const { id, result } = msg;
                    completedJobs++;
                    const response = {
                        id,
                        address: result.address || null,
                        success: result.success,
                        confidence: result.confidence,
                        source: result.source,
                        error: result.error,
                        metadata: result.metadata
                    };
                    results.push(response);
                    console.log(`✅ [${completedJobs}/${properties.length}] Property ${id}: ${result.success ? `"${result.address}" (${result.source})` : `Failed - ${result.error}`}`);
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
        function sendNextJob(worker, workerId) {
            const property = queue.shift();
            if (property === undefined) {
                worker.postMessage({ type: 'no_more_jobs' });
            }
            else {
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
            'POST /bulk-process': 'Bulk process properties from database with cursor pagination',
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
        const { properties } = req.body;
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
    }
    catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});
// Bulk processing endpoint with cursor pagination
app.post('/bulk-process', async (req, res) => {
    try {
        const { batchSize = 100, cursor = null, updateDatabase = true } = req.body;
        console.log(`🚀 Starting bulk processing: ${batchSize} properties from cursor ${cursor || 'beginning'}`);
        // Validation
        if (batchSize < 1 || batchSize > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Batch size must be between 1 and 10000'
            });
        }
        // Import Supabase dynamically to avoid startup dependency
        const { createClient } = await Promise.resolve().then(() => __importStar(require('@supabase/supabase-js')));
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_KEY environment variables.'
            });
        }
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        // Fetch properties from database using cursor pagination
        let query = supabase
            .from('rightmove_properties_v2')
            .select('id, outcode, incode')
            .is('fullAddress', null)
            .order('id', { ascending: true })
            .limit(batchSize + 1); // +1 to check if more exist
        if (cursor) {
            query = query.gt('id', cursor);
        }
        console.log(`📋 Fetching properties with cursor: ${cursor || 'none'}, batchSize: ${batchSize}`);
        const { data: dbProperties, error: fetchError } = await query;
        if (fetchError) {
            console.error('❌ Database fetch error:', fetchError);
            return res.status(500).json({
                success: false,
                error: `Database fetch error: ${fetchError.message}`
            });
        }
        if (!dbProperties || dbProperties.length === 0) {
            return res.json({
                success: true,
                processed: 0,
                successful: 0,
                failed: 0,
                hasMore: false,
                summary: {
                    totalTime: 0,
                    averageTime: 0,
                    successRate: 0
                },
                message: 'No more properties to process - all done! 🎉'
            });
        }
        // Determine if more data exists and prepare batch for processing
        const hasMore = dbProperties.length > batchSize;
        const processingBatch = hasMore ? dbProperties.slice(0, -1) : dbProperties;
        const nextCursor = hasMore ? processingBatch[processingBatch.length - 1].id : null;
        console.log(`📦 Processing batch: ${processingBatch.length} properties (IDs ${processingBatch[0]?.id} to ${processingBatch[processingBatch.length - 1]?.id})`);
        // Process addresses using existing batch logic
        const batchStartTime = Date.now();
        const result = await fetchAddressesInParallel(processingBatch);
        const batchEndTime = Date.now();
        const successful = result.results.filter(r => r.success).length;
        const failed = result.results.length - successful;
        // Update database if requested
        if (updateDatabase) {
            console.log(`💾 Updating database with ${result.results.length} results`);
            let updateCount = 0;
            for (const property of result.results) {
                if (property.success && property.address) {
                    const { error: updateError } = await supabase
                        .from('rightmove_properties_v2')
                        .update({ fullAddress: property.address })
                        .eq('id', property.id);
                    if (updateError) {
                        console.error(`❌ Error updating ID ${property.id}:`, updateError);
                    }
                    else {
                        updateCount++;
                    }
                }
            }
            console.log(`✅ Updated ${updateCount} records in database`);
        }
        const totalTime = batchEndTime - batchStartTime;
        const averageTime = processingBatch.length > 0 ? totalTime / processingBatch.length : 0;
        const successRate = processingBatch.length > 0 ? (successful / processingBatch.length) * 100 : 0;
        const response = {
            success: true,
            processed: processingBatch.length,
            successful,
            failed,
            nextCursor,
            hasMore,
            summary: {
                totalTime,
                averageTime,
                successRate
            },
            nextCommand: hasMore ? {
                cursor: nextCursor,
                batchSize
            } : undefined
        };
        // Log completion
        console.log(`✅ Batch complete: ${successful}/${processingBatch.length} successful (${successRate.toFixed(1)}%)`);
        if (hasMore) {
            console.log(`📋 Next batch available: cursor=${nextCursor}, command: POST /bulk-process {"cursor": ${nextCursor}, "batchSize": ${batchSize}}`);
        }
        else {
            console.log(`🎉 All properties processed! No more batches needed.`);
        }
        res.json(response);
    }
    catch (error) {
        console.error('❌ Bulk processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error during bulk processing'
        });
    }
});
// Error handling middleware
app.use((error, req, res, next) => {
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
        availableEndpoints: ['GET /', 'GET /health', 'POST /addresses', 'POST /bulk-process']
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`🌐 Address Resolver API listening on port ${PORT}`);
    console.log(`🔧 Max concurrent workers: ${MAX_CONCURRENT_WORKERS}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API docs: http://localhost:${PORT}/`);
});
exports.default = app;
//# sourceMappingURL=api.js.map