// Core interfaces for the address resolution pipeline

export interface PropertyInput {
  propertyId: string;
  url?: string;
  salesHistory?: SaleRecord[];
  propertyDetails?: PropertyDetails;
}

export interface PropertyDetails {
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  price?: number;
  displayAddress?: string;
  postcode?: string;
  tenure?: string;
  sizeSqFeet?: number;
}

export interface SaleRecord {
  date: string;
  price: number;
  address?: string;
  propertyType?: string;
}

export interface AddressResult {
  success: boolean;
  address?: string;
  confidence: number;
  source: 'friend_api' | 'rightmove_land_registry' | 'land_registry' | 'error';
  metadata: {
    stepUsed: number;
    apiResponseTime: number;
    fallbackReason?: string;
    rawResponse?: any;
    allErrors?: string[];
    strategy?: string;
    verifiedData?: any;
    Weeks_OTM?: string;
  };
  error?: string;
}

export interface PipelineStep {
  name: string;
  execute(input: PropertyInput): Promise<StepResult>;
}

export interface StepResult {
  success: boolean;
  address?: string;
  confidence: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface FriendAPIResponse {
  success: boolean;
  data?: {
    id: number;
    fullAddress?: string;
    displayAddress?: string;
    postal_code?: string;
    price?: string;
    bedrooms?: number;
    bathrooms?: number;
    propertyType?: string;
    Weeks_OTM?: string;
    [key: string]: any;
  };
  error?: string;
}

export interface LandRegistryRecord {
  address: string;
  price: number;
  date: string;
  propertyType: string;
  confidence: number;
}

export interface PipelineConfig {
  timeoutMs: number;
  retryAttempts: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}