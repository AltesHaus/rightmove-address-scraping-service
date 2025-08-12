#!/usr/bin/env node

/**
 * Test the enhanced pipeline API
 * Tests both single and batch property resolution
 */

const https = require('https');

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PipelineTest/1.0',
        ...options.headers
      },
      timeout: 180000 // 3 minutes
    };
    
    const protocol = urlObj.protocol === 'https:' ? https : require('http');
    
    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            success: true,
            status: res.statusCode,
            data: json
          });
        } catch (error) {
          resolve({
            success: false,
            status: res.statusCode,
            data: data,
            error: 'Invalid JSON response'
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function testAPI(baseUrl = 'http://localhost:3000') {
  console.log('🚀 Testing Enhanced Address Resolver Pipeline API');
  console.log(`Base URL: ${baseUrl}`);
  console.log('=' * 60 + '\n');
  
  // Test 1: Health check
  console.log('1️⃣ Testing health endpoint...');
  try {
    const healthResult = await makeRequest(`${baseUrl}/health`);
    if (healthResult.success && healthResult.status === 200) {
      console.log('✅ Health check passed');
      console.log('Pipeline steps:', healthResult.data.pipeline?.map(s => s.name).join(' → '));
    } else {
      console.log('❌ Health check failed:', healthResult.status);
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    console.log('💡 Make sure the server is running: npm run build && npm start');
    return;
  }
  
  console.log('\n' + '-'.repeat(60) + '\n');
  
  // Test 2: Single property resolution
  console.log('2️⃣ Testing single property resolution...');
  const testPropertyId = '159860288';
  
  try {
    console.log(`Resolving property ${testPropertyId}...`);
    const singleResult = await makeRequest(`${baseUrl}/api/resolve/${testPropertyId}`);
    
    if (singleResult.success) {
      const data = singleResult.data;
      console.log(`✅ Status: ${singleResult.status}`);
      console.log(`📍 Found: ${data.found}`);
      console.log(`🏠 Address: ${data.fullAddress || 'Not found'}`);
      console.log(`🎯 Source: ${data.source}`);
      console.log(`📊 Confidence: ${data.confidence}`);
      console.log(`⏱️ Processing time: ${data.processingTime}ms`);
      
      if (data.metadata?.stepUsed) {
        console.log(`🔄 Step used: ${data.metadata.stepUsed}`);
      }
      
      if (data.metadata?.strategy) {
        console.log(`🎯 Strategy: ${data.metadata.strategy}`);
      }
      
      if (data.error) {
        console.log(`⚠️ Error: ${data.error}`);
      }
    } else {
      console.log('❌ Single resolution failed:', singleResult.error || singleResult.data);
    }
  } catch (error) {
    console.log('❌ Single resolution error:', error.message);
  }
  
  console.log('\n' + '-'.repeat(60) + '\n');
  
  // Test 3: Batch resolution
  console.log('3️⃣ Testing batch property resolution...');
  const testPropertyIds = ['159860288', '152205953', '116095696'];
  
  try {
    console.log(`Resolving batch: ${testPropertyIds.join(', ')}...`);
    const batchResult = await makeRequest(`${baseUrl}/api/resolve-batch`, {
      method: 'POST',
      body: { propertyIds: testPropertyIds }
    });
    
    if (batchResult.success) {
      const data = batchResult.data;
      console.log(`✅ Status: ${batchResult.status}`);
      console.log(`📊 Total processed: ${data.totalProcessed}`);
      console.log(`✅ Successful: ${data.successful}`);
      console.log(`❌ Failed: ${data.failed}`);
      console.log(`⏱️ Total time: ${data.totalProcessingTime}ms`);
      
      console.log('\n📋 Individual results:');
      data.results.forEach((result, index) => {
        console.log(`\n${index + 1}. Property ${result.propertyId}:`);
        console.log(`   Found: ${result.found}`);
        console.log(`   Address: ${result.fullAddress || 'Not found'}`);
        console.log(`   Source: ${result.source}`);
        console.log(`   Confidence: ${result.confidence}`);
        console.log(`   Time: ${result.processingTime}ms`);
        
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });
    } else {
      console.log('❌ Batch resolution failed:', batchResult.error || batchResult.data);
    }
  } catch (error) {
    console.log('❌ Batch resolution error:', error.message);
  }
  
  console.log('\n' + '-'.repeat(60) + '\n');
  
  // Test 4: Simple address endpoint
  console.log('4️⃣ Testing simple address endpoint...');
  
  try {
    const simpleResult = await makeRequest(`${baseUrl}/api/address/${testPropertyId}`);
    
    if (simpleResult.success) {
      const data = simpleResult.data;
      console.log(`✅ Status: ${simpleResult.status}`);
      console.log(`📍 Found: ${data.found}`);
      console.log(`🏠 Full Address: ${data.fullAddress || 'Not found'}`);
      
      if (data.error) {
        console.log(`⚠️ Error: ${data.error}`);
      }
    } else {
      console.log('❌ Simple address failed:', simpleResult.error || simpleResult.data);
    }
  } catch (error) {
    console.log('❌ Simple address error:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ API Testing Complete!');
  console.log('\n💡 Pipeline Flow:');
  console.log('   1. Friend API (if configured)');
  console.log('   2. Rightmove → Land Registry (with SPARQL)');
  console.log('   3. Robust fallback and logging');
  
  console.log('\n🚀 Ready for deployment:');
  console.log('   • Docker: npm run docker:build && npm run docker:run');
  console.log('   • Railway: Push to Railway with railway.toml');
  console.log('   • Local: npm run build && npm start');
}

// Check if URL provided as argument
const baseUrl = process.argv[2] || 'http://localhost:3000';

testAPI(baseUrl).catch(console.error);