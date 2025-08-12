#!/usr/bin/env node

/**
 * Test coordinates extraction
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
        'User-Agent': 'CoordinatesTest/1.0',
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

async function testCoordinates(baseUrl = 'http://localhost:3000') {
  console.log('🧭 Testing Coordinates Extraction');
  console.log(`Base URL: ${baseUrl}`);
  console.log('=' * 60 + '\n');
  
  // Test property with known coordinates
  const testPropertyId = '159860288'; // The one we found coordinates for
  
  try {
    console.log(`Testing property ${testPropertyId}...`);
    const result = await makeRequest(`${baseUrl}/api/resolve/${testPropertyId}`);
    
    if (result.success && result.status === 200) {
      const data = result.data;
      console.log(`✅ Status: ${result.status}`);
      console.log(`📍 Found: ${data.found}`);
      console.log(`🏠 Address: ${data.fullAddress || 'Not found'}`);
      console.log(`📊 Confidence: ${data.confidence}`);
      console.log(`🗺️ Coordinates:`, data.coordinates || 'Not found');
      console.log(`🖼️ Images:`, data.images?.length || 0, 'images');
      console.log(`⏱️ Processing time: ${data.processingTime}ms`);
      console.log(`🔧 Source: ${data.source}`);
      
      if (data.coordinates) {
        console.log('\n🎯 Coordinates Details:');
        console.log(`   Latitude: ${data.coordinates.latitude}`);
        console.log(`   Longitude: ${data.coordinates.longitude}`);
        console.log(`   Accuracy: ${data.coordinates.accuracy}`);
        console.log(`   Source: ${data.coordinates.source}`);
      }
      
      if (data.error) {
        console.log(`⚠️ Error: ${data.error}`);
      }
    } else {
      console.log('❌ Request failed:', result.error || result.data);
    }
  } catch (error) {
    console.log('❌ Test error:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Coordinates Testing Complete!');
}

// Check if URL provided as argument
const baseUrl = process.argv[2] || 'http://localhost:3000';
testCoordinates(baseUrl).catch(console.error);