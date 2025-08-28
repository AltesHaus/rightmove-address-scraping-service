const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TABLE_NAME = 'rightmove_properties_v2';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function monitorProgress() {
  console.log('🔍 Monitoring bulk address resolution progress...\n');
  
  // Get overall statistics
  const { data: totalStats, error: totalError } = await supabase
    .from(TABLE_NAME)
    .select('id, fullAddress, outcode, incode')
    .not('outcode', 'is', null)  // Only count properties with postcodes
    .not('outcode', 'eq', '');

  if (totalError) {
    console.error('Error fetching total stats:', totalError);
    return;
  }

  const totalProperties = totalStats.length;
  const withFullAddress = totalStats.filter(row => row.fullAddress && row.fullAddress.trim()).length;
  const withoutFullAddress = totalProperties - withFullAddress;
  
  const completionRate = ((withFullAddress / totalProperties) * 100).toFixed(2);

  console.log('📊 BULK PROCESSING STATISTICS');
  console.log('═'.repeat(50));
  console.log(`🏠 Total properties (with postcodes): ${totalProperties.toLocaleString()}`);
  console.log(`✅ With fullAddress: ${withFullAddress.toLocaleString()} (${completionRate}%)`);
  console.log(`⏳ Missing fullAddress: ${withoutFullAddress.toLocaleString()}`);
  console.log(`📊 Completion rate: ${completionRate}%`);

  // Show a few sample addresses that need processing
  const { data: sampleMissing, error: missingError } = await supabase
    .from(TABLE_NAME)
    .select('id, outcode, incode')
    .is('fullAddress', null)
    .not('outcode', 'is', null)
    .limit(5);

  if (!missingError && sampleMissing && sampleMissing.length > 0) {
    console.log('\n📋 SAMPLE PROPERTIES NEEDING PROCESSING');
    console.log('═'.repeat(50));
    sampleMissing.forEach(prop => {
      console.log(`• ID: ${prop.id}, Postcode: ${prop.outcode} ${prop.incode || ''}`);
    });
  }

  // Show sample of existing successful addresses
  const { data: sampleAddresses, error: sampleError } = await supabase
    .from(TABLE_NAME)
    .select('id, fullAddress')
    .not('fullAddress', 'is', null)
    .limit(5);

  if (!sampleError && sampleAddresses && sampleAddresses.length > 0) {
    console.log('\n🏡 SAMPLE EXISTING ADDRESSES');
    console.log('═'.repeat(50));
    sampleAddresses.forEach(addr => {
      console.log(`• ${addr.fullAddress}`);
    });
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📅 Last updated: ${new Date().toLocaleString()}`);
}

monitorProgress().catch(console.error);