// Debug the outcode SPARQL query issue
const https = require('https');

async function testOutcodeQuery() {
  console.log('🔍 Testing outcode SPARQL query for SW1W...\n');
  
  // This is the exact query our system uses for outcode + year + price
  const sparql = `PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
SELECT ?transx ?pricePaid ?date ?paon ?street ?postcode ?propType ?estateType ?newBuild
WHERE {
  ?transx lrppi:pricePaid ?pricePaid ;
           lrppi:transactionDate ?date ;
           lrppi:propertyAddress ?addr .
  ?addr lrcommon:paon ?paon ;
        lrcommon:street ?street ;
        lrcommon:postcode ?postcode .
  OPTIONAL { ?transx lrppi:propertyType ?propType }
  OPTIONAL { ?transx lrppi:estateType ?estateType }
  OPTIONAL { ?transx lrppi:newBuild ?newBuild }
  FILTER(STRSTARTS(?postcode, "SW1W"))
  FILTER(YEAR(?date) = 2022)
  FILTER(?pricePaid = 45000000)
}
LIMIT 10`;

  console.log('📋 SPARQL Query:');
  console.log(sparql);
  console.log('\n🚀 Executing query...');
  
  return new Promise((resolve) => {
    const data = sparql;
    
    const options = {
      hostname: 'landregistry.data.gov.uk',
      path: '/landregistry/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/json',
        'User-Agent': 'AddressResolver-Pipeline/1.0',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000 // 30 second timeout
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          console.log('✅ Query successful!');
          console.log('📊 Results:');
          console.log(JSON.stringify(json, null, 2));
          
          if (json.results && json.results.bindings && json.results.bindings.length > 0) {
            console.log('\n🎉 Found matches! The outcode query SHOULD work.');
            console.log('🔍 This means there is a bug in our implementation.');
          } else {
            console.log('\n❌ No matches found with outcode query.');
            console.log('🤔 This explains why our outcode fallback fails.');
          }
          
          resolve(json);
        } catch (error) {
          console.log('❌ JSON parse error:', error.message);
          console.log('📄 Raw response:', body);
          resolve({ error: 'Invalid JSON response' });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('❌ Request error:', error.message);
      resolve({ error: error.message });
    });
    
    req.on('timeout', () => {
      console.log('⏰ Request timeout (30s)');
      req.abort();
      resolve({ error: 'Request timeout' });
    });
    
    req.write(data);
    req.end();
  });
}

testOutcodeQuery().then(() => {
  console.log('\n✅ Test completed.');
  process.exit(0);
}).catch(console.error);