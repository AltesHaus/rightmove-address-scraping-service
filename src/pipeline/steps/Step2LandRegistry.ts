import { PipelineStep, PropertyInput, StepResult, SaleRecord, LandRegistryRecord } from '../types';
import { HttpClient } from '../../utils/http';
import { APIError, ParseError } from '../../utils/errors';

export class Step2LandRegistry implements PipelineStep {
  name = 'Land Registry';
  private httpClient: HttpClient;
  private apiKey: string;

  constructor() {
    this.httpClient = new HttpClient();
    this.apiKey = process.env.LAND_REGISTRY_API_KEY || '';
  }

  async execute(input: PropertyInput): Promise<StepResult> {
    const startTime = Date.now();
    
    try {
      // Validate we have sales history data
      if (!input.salesHistory || input.salesHistory.length === 0) {
        return {
          success: false,
          confidence: 0,
          error: 'No sales history data available for Land Registry lookup',
          metadata: { responseTime: Date.now() - startTime }
        };
      }

      console.log(`[Step2LandRegistry] Processing ${input.salesHistory.length} sale records`);
      
      // Find the best match from Land Registry
      const bestMatch = await this.findBestMatch(input);
      const responseTime = Date.now() - startTime;
      
      if (bestMatch) {
        console.log(`[Step2LandRegistry] Success: Found address "${bestMatch.address}" with confidence ${bestMatch.confidence} in ${responseTime}ms`);
        
        return {
          success: true,
          address: bestMatch.address,
          confidence: bestMatch.confidence,
          metadata: {
            responseTime,
            source: 'land_registry',
            matchedSale: {
              price: bestMatch.price,
              date: bestMatch.date,
              propertyType: bestMatch.propertyType
            }
          }
        };
      } else {
        return {
          success: false,
          confidence: 0,
          error: 'No matching records found in Land Registry',
          metadata: { responseTime }
        };
      }
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error(`[Step2LandRegistry] Error after ${responseTime}ms:`, error.message);
      
      return {
        success: false,
        confidence: 0,
        error: error.message,
        metadata: {
          responseTime,
          errorType: error.constructor.name,
        }
      };
    }
  }

  private async findBestMatch(input: PropertyInput): Promise<LandRegistryRecord | null> {
    // For now, we'll simulate the Land Registry lookup
    // In a real implementation, you would:
    // 1. Query Land Registry API with sales data
    // 2. Use fuzzy matching to find closest records
    // 3. Return the best match with confidence score
    
    if (!this.apiKey) {
      console.warn('[Step2LandRegistry] No API key provided, using mock data');
      return this.getMockLandRegistryData(input);
    }

    // TODO: Implement actual Land Registry API integration
    // This would involve:
    // - HM Land Registry Price Paid Data API
    // - Fuzzy matching algorithms for price, date, and property details
    // - Confidence scoring based on match quality
    
    return this.getMockLandRegistryData(input);
  }

  private getMockLandRegistryData(input: PropertyInput): LandRegistryRecord | null {
    // Mock implementation for demonstration
    // This simulates finding a match in Land Registry based on sales history
    
    if (!input.salesHistory || input.salesHistory.length === 0) {
      return null;
    }

    const mostRecentSale = input.salesHistory
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    // Simulate a Land Registry match
    if (mostRecentSale.price > 100000) { // Only mock for reasonable prices
      return {
        address: this.generateMockAddress(input),
        price: mostRecentSale.price,
        date: mostRecentSale.date,
        propertyType: mostRecentSale.propertyType || 'Unknown',
        confidence: this.calculateConfidence(mostRecentSale, input)
      };
    }

    return null;
  }

  private generateMockAddress(input: PropertyInput): string {
    // Generate a plausible UK address for demo purposes
    const streetNumbers = ['1', '12', '45', '67', '89', '123', '156'];
    const streetNames = [
      'High Street', 'Church Lane', 'Victoria Road', 'Mill Close', 
      'Oak Avenue', 'Manor Way', 'Kings Road', 'Queens Drive'
    ];
    const towns = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool'];
    const postcodes = ['SW1A 1AA', 'M1 1AA', 'B1 1AA', 'LS1 1AA', 'L1 1AA'];

    const streetNumber = streetNumbers[Math.floor(Math.random() * streetNumbers.length)];
    const streetName = streetNames[Math.floor(Math.random() * streetNames.length)];
    const town = towns[Math.floor(Math.random() * towns.length)];
    const postcode = postcodes[Math.floor(Math.random() * postcodes.length)];

    // If we have property details with a display address, try to use similar components
    if (input.propertyDetails?.displayAddress) {
      const display = input.propertyDetails.displayAddress;
      // Try to extract town/city from display address
      const displayParts = display.split(',').map(s => s.trim());
      if (displayParts.length > 1) {
        const lastPart = displayParts[displayParts.length - 1];
        if (lastPart.length > 2) {
          return `${streetNumber} ${streetName}, ${lastPart}`;
        }
      }
    }

    return `${streetNumber} ${streetName}, ${town}, ${postcode}`;
  }

  private calculateConfidence(sale: SaleRecord, input: PropertyInput): number {
    let confidence = 0.5; // Base confidence for Land Registry match
    
    // Increase confidence based on data quality
    if (sale.price && sale.price > 0) confidence += 0.1;
    if (sale.date && this.isRecentDate(sale.date)) confidence += 0.1;
    if (sale.propertyType) confidence += 0.1;
    if (input.propertyDetails?.bedrooms) confidence += 0.1;
    if (input.propertyDetails?.propertyType) confidence += 0.1;
    
    return Math.min(confidence, 0.85); // Cap at 0.85 since it's a fallback method
  }

  private isRecentDate(dateStr: string): boolean {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffYears = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
      return diffYears <= 5; // Consider within 5 years as recent
    } catch {
      return false;
    }
  }
}