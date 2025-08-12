import { PropertyInput, AddressResult, PipelineStep, PipelineConfig } from './types';
import { Step1FriendAPI } from './steps/Step1FriendAPI';
import { Step2RightmoveLandRegistry } from './steps/Step2RightmoveLandRegistry';
import { validatePropertyInput } from '../utils/validation';
import { AddressResolverError, TimeoutError } from '../utils/errors';

export class AddressResolver {
  private steps: PipelineStep[];
  private config: PipelineConfig;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = {
      timeoutMs: 120000, // 2 minutes total timeout
      retryAttempts: 1,
      cacheEnabled: false, // TODO: Implement caching
      cacheTtlMs: 3600000, // 1 hour
      ...config
    };

    // Initialize pipeline steps
    this.steps = [
      new Step1FriendAPI(),
      new Step2RightmoveLandRegistry()
      // Future steps can be added here
    ];
  }

  async resolve(input: PropertyInput): Promise<AddressResult> {
    const startTime = Date.now();
    
    try {
      // Validate input
      validatePropertyInput(input);
      
      console.log(`[AddressResolver] Starting resolution for property ${input.propertyId}`);
      
      // Execute pipeline with timeout
      const result = await this.executeWithTimeout(input);
      const totalTime = Date.now() - startTime;
      
      console.log(`[AddressResolver] Completed in ${totalTime}ms with result:`, {
        success: result.success,
        source: result.source,
        confidence: result.confidence
      });
      
      return result;
      
    } catch (error: any) {
      const totalTime = Date.now() - startTime;
      console.error(`[AddressResolver] Failed after ${totalTime}ms:`, error.message);
      
      return {
        success: false,
        confidence: 0,
        source: 'error',
        metadata: {
          stepUsed: 0,
          apiResponseTime: totalTime,
          fallbackReason: error.message
        },
        error: error.message
      };
    }
  }

  private async executeWithTimeout(input: PropertyInput): Promise<AddressResult> {
    return new Promise(async (resolve, reject) => {
      // Set overall timeout
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(
          `Pipeline execution timed out after ${this.config.timeoutMs}ms`,
          this.config.timeoutMs
        ));
      }, this.config.timeoutMs);

      try {
        const result = await this.executePipeline(input);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private async executePipeline(input: PropertyInput): Promise<AddressResult> {
    const errors: string[] = [];
    
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      const stepNumber = i + 1;
      
      console.log(`[AddressResolver] Executing Step ${stepNumber}: ${step.name}`);
      
      try {
        const stepResult = await step.execute(input);
        
        if (stepResult.success && stepResult.address) {
          // Success! Return the result
          return {
            success: true,
            address: stepResult.address,
            confidence: stepResult.confidence,
            source: this.getSourceName(stepNumber),
            metadata: {
              stepUsed: stepNumber,
              apiResponseTime: stepResult.metadata?.responseTime || 0,
              ...stepResult.metadata
            }
          };
        } else {
          // Step failed, record error and continue to next step
          const errorMsg = stepResult.error || `Step ${stepNumber} failed without specific error`;
          errors.push(`Step ${stepNumber} (${step.name}): ${errorMsg}`);
          console.log(`[AddressResolver] Step ${stepNumber} failed: ${errorMsg}`);
        }
        
      } catch (error: any) {
        // Unexpected error in step execution
        const errorMsg = `Unexpected error in step ${stepNumber}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[AddressResolver] ${errorMsg}`, error);
      }
    }

    // All steps failed
    return {
      success: false,
      confidence: 0,
      source: 'error',
      metadata: {
        stepUsed: 0,
        apiResponseTime: 0,
        fallbackReason: `All ${this.steps.length} steps failed`,
        allErrors: errors
      },
      error: `All pipeline steps failed. Errors: ${errors.join('; ')}`
    };
  }

  private getSourceName(stepNumber: number): AddressResult['source'] {
    switch (stepNumber) {
      case 1: return 'friend_api';
      case 2: return 'rightmove_land_registry';
      default: return 'error';
    }
  }

  // Method to add custom steps to the pipeline
  addStep(step: PipelineStep, position?: number): void {
    if (position !== undefined && position >= 0 && position <= this.steps.length) {
      this.steps.splice(position, 0, step);
    } else {
      this.steps.push(step);
    }
  }

  // Method to get pipeline configuration
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  // Method to update pipeline configuration
  updateConfig(newConfig: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Method to get information about available steps
  getSteps(): Array<{name: string, position: number}> {
    return this.steps.map((step, index) => ({
      name: step.name,
      position: index + 1
    }));
  }
}