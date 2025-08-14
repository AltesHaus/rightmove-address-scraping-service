"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step1FriendAPI = void 0;
const http_1 = require("../utils/http");
const validation_1 = require("../utils/validation");
class Step1FriendAPI {
    name = 'Friend API';
    httpClient;
    baseUrl;
    userEmail;
    constructor() {
        this.httpClient = new http_1.HttpClient();
        this.baseUrl = process.env.FRIEND_API_BASE_URL ||
            'https://all-data-api-338975572233.europe-west2.run.app';
        this.userEmail = process.env.FRIEND_API_USER ||
            'bart.chmielecki@dawsonbarker.com';
    }
    async execute(input) {
        const startTime = Date.now();
        try {
            const propertyId = (0, validation_1.sanitizePropertyId)(input.propertyId);
            const url = this.buildApiUrl(propertyId);
            console.log(`[Step1FriendAPI] Calling: ${url}`);
            const response = await this.httpClient.get(url);
            const responseTime = Date.now() - startTime;
            return this.processResponse(response, responseTime);
        }
        catch (error) {
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
    buildApiUrl(propertyId) {
        const encodedUser = encodeURIComponent(this.userEmail);
        return `${this.baseUrl}/api/property/${propertyId}?user=${encodedUser}&spectatorFilter=${encodedUser}`;
    }
    processResponse(response, responseTime) {
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
        return {
            success: true,
            address: fullAddress.trim(),
            confidence: 1.0, // Friend's API is our highest confidence source
            metadata: {
                responseTime,
                source: 'friend_api',
                propertyId: data.id,
                Weeks_OTM: Weeks_OTM,
                galleryInteracted: true,
                rawResponse: response
            }
        };
    }
    extractAddress(data) {
        // Priority order for address extraction
        const addressFields = [
            'fullAddress', // Primary field
            'displayAddress', // Fallback 1
            'title' // Fallback 2 (might contain address)
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
    looksLikeAddress(text) {
        const trimmed = text.trim();
        // Should be reasonably long and contain some typical address components
        if (trimmed.length < 5)
            return false;
        // Should contain either a number or common address words
        const hasNumber = /\d/.test(trimmed);
        const hasAddressWords = /\b(street|road|avenue|lane|crescent|drive|close|court|way|place|square|gardens|park|hill|manor|house|flat|apartment)\b/i.test(trimmed);
        const hasCommonAddressPattern = /^\d+\s+[A-Za-z]/.test(trimmed); // Starts with number + street name
        return hasNumber || hasAddressWords || hasCommonAddressPattern;
    }
}
exports.Step1FriendAPI = Step1FriendAPI;
//# sourceMappingURL=Step1FriendAPI.js.map