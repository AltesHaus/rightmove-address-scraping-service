export interface PropertyInput {
    propertyId: string;
    outcode?: string;
    incode?: string;
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
    images?: PropertyImage[];
}
export interface PropertyImage {
    url: string;
    type: 'main' | 'gallery' | 'floorplan' | 'streetview' | 'other';
    caption?: string;
    order?: number;
}
export interface PropertyCoordinates {
    latitude: number;
    longitude: number;
    accuracy?: 'ACCURATE_POINT' | 'APPROXIMATE' | 'POSTCODE';
    source?: 'rightmove' | 'google_maps' | 'ordnance_survey';
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
    images?: PropertyImage[];
    coordinates?: PropertyCoordinates;
    metadata: {
        stepUsed: number;
        apiResponseTime: number;
        fallbackReason?: string;
        rawResponse?: any;
        allErrors?: string[];
        strategy?: string;
        verifiedData?: any;
        Weeks_OTM?: string;
        imagesExtracted?: number;
        galleryInteracted?: boolean;
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
    images?: PropertyImage[];
    coordinates?: PropertyCoordinates;
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
//# sourceMappingURL=index.d.ts.map