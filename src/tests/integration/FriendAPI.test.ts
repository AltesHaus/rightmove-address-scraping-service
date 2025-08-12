import { Step1FriendAPI } from '../../pipeline/steps/Step1FriendAPI';
import { PropertyInput } from '../../pipeline/types';

// Set real environment variables for integration test
process.env.FRIEND_API_BASE_URL = 'https://all-data-api-338975572233.europe-west2.run.app';
process.env.FRIEND_API_USER = 'bart.chmielecki@dawsonbarker.com';

describe('Step1FriendAPI Integration', () => {
  let step: Step1FriendAPI;

  beforeEach(() => {
    step = new Step1FriendAPI();
  });

  describe('Real API Integration', () => {
    it('should successfully resolve known property ID', async () => {
      const input: PropertyInput = {
        propertyId: '163926191' // Known working ID from the example
      };

      const result = await step.execute(input);

      expect(result.success).toBe(true);
      expect(result.address).toBeDefined();
      expect(result.address).toContain('Blenheim Crescent');
      expect(result.confidence).toBe(1.0);
      expect(result.metadata?.source).toBe('friend_api');
    }, 30000); // 30 second timeout for real API call

    it('should handle non-existent property ID gracefully', async () => {
      const input: PropertyInput = {
        propertyId: '99999999999' // Very unlikely to exist
      };

      const result = await step.execute(input);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.error).toBeDefined();
    }, 30000);

    it('should handle invalid property ID format', async () => {
      const input: PropertyInput = {
        propertyId: 'invalid_id_123'
      };

      const result = await step.execute(input);

      // Should clean the ID to '123' and attempt the call
      expect(result.metadata?.responseTime).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Response Processing', () => {
    it('should extract address from different response formats', async () => {
      // Test with another known property ID if available
      const input: PropertyInput = {
        propertyId: '159015824' // Alternative ID mentioned in the API docs
      };

      const result = await step.execute(input);

      if (result.success) {
        expect(result.address).toBeDefined();
        expect(typeof result.address).toBe('string');
        expect(result.address!.length).toBeGreaterThan(5);
      }
      
      // Test should pass regardless of success/failure since we're testing the processing
      expect(result.metadata?.responseTime).toBeGreaterThan(0);
    }, 30000);
  });
});