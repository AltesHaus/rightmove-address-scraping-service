import { AddressResolver } from '../../pipeline/AddressResolver';
import { PropertyInput } from '../../pipeline/types';

// Mock environment variables
process.env.FRIEND_API_BASE_URL = 'https://test-api.example.com';
process.env.FRIEND_API_USER = 'test@example.com';

describe('AddressResolver', () => {
  let resolver: AddressResolver;

  beforeEach(() => {
    resolver = new AddressResolver();
  });

  describe('Input Validation', () => {
    it('should reject empty property ID', async () => {
      const input: PropertyInput = { propertyId: '' };
      const result = await resolver.resolve(input);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Property ID');
    });

    it('should reject invalid property ID', async () => {
      const input: PropertyInput = { propertyId: 'abc' };
      const result = await resolver.resolve(input);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('digit');
    });

    it('should accept valid property ID', async () => {
      const input: PropertyInput = { propertyId: '12345' };
      const result = await resolver.resolve(input);
      
      // Even if the API call fails, input validation should pass
      expect(result.error).not.toContain('Property ID');
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = resolver.getConfig();
      
      expect(config.timeoutMs).toBe(120000);
      expect(config.retryAttempts).toBe(1);
      expect(config.cacheEnabled).toBe(false);
    });

    it('should allow configuration updates', () => {
      resolver.updateConfig({ timeoutMs: 60000 });
      const config = resolver.getConfig();
      
      expect(config.timeoutMs).toBe(60000);
    });
  });

  describe('Pipeline Steps', () => {
    it('should have correct number of steps', () => {
      const steps = resolver.getSteps();
      
      expect(steps).toHaveLength(2);
      expect(steps[0].name).toBe('Friend API');
      expect(steps[1].name).toBe('Land Registry');
    });

    it('should allow adding custom steps', () => {
      const customStep = {
        name: 'Custom Step',
        execute: jest.fn().mockResolvedValue({
          success: false,
          confidence: 0,
          error: 'Mock step'
        })
      };

      resolver.addStep(customStep);
      const steps = resolver.getSteps();
      
      expect(steps).toHaveLength(3);
      expect(steps[2].name).toBe('Custom Step');
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      // Create resolver with very short timeout
      const fastResolver = new AddressResolver({ timeoutMs: 1 });
      const input: PropertyInput = { propertyId: '12345' };
      
      const result = await fastResolver.resolve(input);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10000);

    it('should return error metadata when all steps fail', async () => {
      const input: PropertyInput = { propertyId: '99999999' }; // Likely to fail
      
      const result = await resolver.resolve(input);
      
      expect(result.success).toBe(false);
      expect(result.metadata.allErrors).toBeDefined();
      expect(Array.isArray(result.metadata.allErrors)).toBe(true);
    });
  });
});