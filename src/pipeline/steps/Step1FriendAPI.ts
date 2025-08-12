import { PipelineStep, PropertyInput, StepResult, FriendAPIResponse, PropertyImage, PropertyCoordinates } from '../types';
import { HttpClient } from '../../utils/http';
import { APIError, ParseError } from '../../utils/errors';
import { sanitizePropertyId } from '../../utils/validation';

export class Step1FriendAPI implements PipelineStep {
  name = 'Friend API';
  private httpClient: HttpClient;
  private baseUrl: string;
  private userEmail: string;

  constructor() {
    this.httpClient = new HttpClient();
    this.baseUrl = process.env.FRIEND_API_BASE_URL || 
      'https://all-data-api-338975572233.europe-west2.run.app';
    this.userEmail = process.env.FRIEND_API_USER || 
      'bart.chmielecki@dawsonbarker.com';
  }

  async execute(input: PropertyInput): Promise<StepResult> {
    const startTime = Date.now();
    
    try {
      const propertyId = sanitizePropertyId(input.propertyId);
      const url = this.buildApiUrl(propertyId);
      
      console.log(`[Step1FriendAPI] Calling: ${url}`);
      
      const response = await this.httpClient.get<FriendAPIResponse>(url);
      const responseTime = Date.now() - startTime;
      
      return this.processResponse(response, responseTime);
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error(`[Step1FriendAPI] Error after ${responseTime}ms:`, error.message);
      
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

  private buildApiUrl(propertyId: string): string {
    const encodedUser = encodeURIComponent(this.userEmail);
    return `${this.baseUrl}/api/property/${propertyId}?user=${encodedUser}&spectatorFilter=${encodedUser}`;
  }

  private processResponse(response: FriendAPIResponse, responseTime: number): StepResult {
    // Check if response indicates success
    if (!response.success) {
      return {
        success: false,
        confidence: 0,
        error: response.error || 'API returned success=false',
        metadata: { responseTime, rawResponse: response }
      };
    }

    // Check if data exists
    if (!response.data) {
      return {
        success: false,
        confidence: 0,
        error: 'No data in API response',
        metadata: { responseTime, rawResponse: response }
      };
    }

    const { data } = response;
    
    // Try to extract full address from various fields
    const fullAddress = this.extractAddress(data);
    
    if (!fullAddress) {
      return {
        success: false,
        confidence: 0,
        error: 'No valid address found in response',
        metadata: { 
          responseTime, 
          rawResponse: response,
          availableFields: Object.keys(data)
        }
      };
    }

    console.log(`[Step1FriendAPI] Success: Found address "${fullAddress}" in ${responseTime}ms`);
    
    // Extract Weeks_OTM if available
    const Weeks_OTM = data.Weeks_OTM;
    console.log(`[Step1FriendAPI] Weeks_OTM extracted: ${Weeks_OTM}`);
    
    // Extract images from gallery
    const images = this.extractImages(data);
    console.log(`[Step1FriendAPI] Images extracted: ${images.length}`);
    
    // Extract coordinates if available
    const coordinates = this.extractCoordinates(data);
    console.log(`[Step1FriendAPI] Coordinates extracted:`, coordinates);
    
    return {
      success: true,
      address: fullAddress.trim(),
      confidence: 1.0, // Friend's API is our highest confidence source
      images,
      coordinates,
      metadata: {
        responseTime,
        source: 'friend_api',
        propertyId: data.id,
        Weeks_OTM: Weeks_OTM,
        imagesExtracted: images.length,
        galleryInteracted: true,
        rawResponse: response
      }
    };
  }

  private extractAddress(data: any): string | null {
    // Priority order for address extraction
    const addressFields = [
      'fullAddress',     // Primary field
      'displayAddress',  // Fallback 1
      'title'           // Fallback 2 (might contain address)
    ];

    for (const field of addressFields) {
      const value = data[field];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        // Basic validation - should contain some address-like components
        if (this.looksLikeAddress(value)) {
          return value.trim();
        }
      }
    }

    return null;
  }

  private looksLikeAddress(text: string): boolean {
    const trimmed = text.trim();
    
    // Should be reasonably long and contain some typical address components
    if (trimmed.length < 5) return false;
    
    // Should contain either a number or common address words
    const hasNumber = /\d/.test(trimmed);
    const hasAddressWords = /\b(street|road|avenue|lane|crescent|drive|close|court|way|place|square|gardens|park|hill|manor|house|flat|apartment)\b/i.test(trimmed);
    const hasCommonAddressPattern = /^\d+\s+[A-Za-z]/.test(trimmed); // Starts with number + street name
    
    return hasNumber || hasAddressWords || hasCommonAddressPattern;
  }

  private extractImages(data: any): PropertyImage[] {
    const images: PropertyImage[] = [];
    
    // Extract from gallery field (comma-separated URLs)
    if (data.gallery && typeof data.gallery === 'string') {
      const imageUrls = data.gallery.split(',').map((url: string) => url.trim()).filter((url: string) => url.length > 0);
      
      imageUrls.forEach((url: string, index: number) => {
        images.push({
          url,
          type: index === 0 ? 'main' : 'gallery',
          caption: index === 0 ? 'Main photo' : `Gallery image ${index}`,
          order: index
        });
      });
    }
    
    // Check for floorplan_gallery
    if (data.floorplan_gallery && Array.isArray(data.floorplan_gallery)) {
      data.floorplan_gallery.forEach((floorplan: any, index: number) => {
        if (floorplan && typeof floorplan === 'object' && floorplan.url) {
          images.push({
            url: floorplan.url,
            type: 'floorplan',
            caption: floorplan.caption || `Floorplan ${index + 1}`,
            order: images.length
          });
        }
      });
    }
    
    return images;
  }

  private extractCoordinates(data: any): PropertyCoordinates | undefined {
    // Check common coordinate field names
    const coordinateFields = [
      ['latitude', 'longitude'],
      ['lat', 'lng'],
      ['lat', 'lon'],
      ['y', 'x'], // Sometimes coordinates are stored as x,y
    ];
    
    for (const [latField, lngField] of coordinateFields) {
      const lat = data[latField];
      const lng = data[lngField];
      
      if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
        return {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          accuracy: 'APPROXIMATE',
          source: 'rightmove' // Friend API gets data from Rightmove originally
        };
      }
    }
    
    // Check if coordinates are nested in location object
    if (data.location && typeof data.location === 'object') {
      const location = data.location;
      if (location.latitude && location.longitude) {
        return {
          latitude: parseFloat(location.latitude),
          longitude: parseFloat(location.longitude),
          accuracy: location.accuracy || 'APPROXIMATE',
          source: 'rightmove'
        };
      }
    }
    
    // Check UPRN field for potential coordinate data (less likely but possible)
    if (data.UPRN && typeof data.UPRN === 'string') {
      // UPRNs sometimes contain encoded location data, but this would need specific decoding
      // For now, we'll skip this unless you have a specific format
    }
    
    console.log(`[Step1FriendAPI] No coordinates found in data keys: ${Object.keys(data).join(', ')}`);
    return undefined;
  }
}