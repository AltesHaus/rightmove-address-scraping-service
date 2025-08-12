// Main entry point for the Address Resolver
import dotenv from 'dotenv';
import { AddressResolver } from './pipeline/AddressResolver';
import { PropertyInput } from './pipeline/types';

// Load environment variables
dotenv.config();

// Export main classes for library usage
export { AddressResolver } from './pipeline/AddressResolver';
export { Step1FriendAPI } from './pipeline/steps/Step1FriendAPI';
export { Step2LandRegistry } from './pipeline/steps/Step2LandRegistry';
export * from './pipeline/types';
export * from './utils/errors';

// Example usage function
export async function resolveAddress(input: PropertyInput) {
  const resolver = new AddressResolver();
  return await resolver.resolve(input);
}

// CLI usage when run directly
async function main() {
  if (require.main === module) {
    // Example usage - you can replace this with command line argument parsing
    const testInput: PropertyInput = {
      propertyId: '163926191',
      url: 'https://www.rightmove.co.uk/properties/163926191'
    };

    console.log('🏠 Starting Address Resolution Pipeline...\n');
    console.log('Input:', testInput);
    console.log('\n' + '='.repeat(50) + '\n');

    try {
      const resolver = new AddressResolver();
      const result = await resolver.resolve(testInput);
      
      console.log('\n' + '='.repeat(50) + '\n');
      console.log('📍 Final Result:');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log(`\n✅ SUCCESS: Found address "${result.address}" using ${result.source}`);
        console.log(`📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`⏱️  Response Time: ${result.metadata.apiResponseTime}ms`);
      } else {
        console.log(`\n❌ FAILED: ${result.error}`);
      }
      
    } catch (error: any) {
      console.error('\n💥 Unexpected Error:', error.message);
      process.exit(1);
    }
  }
}

// Run main function if this file is executed directly
main().catch(console.error);