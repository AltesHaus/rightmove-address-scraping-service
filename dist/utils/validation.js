"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePropertyInput = validatePropertyInput;
exports.isValidRightmoveUrl = isValidRightmoveUrl;
exports.sanitizePropertyId = sanitizePropertyId;
const errors_1 = require("./errors");
function validatePropertyInput(input) {
    if (!input.propertyId) {
        throw new errors_1.ValidationError('Property ID is required', 'propertyId');
    }
    if (typeof input.propertyId !== 'string' || input.propertyId.trim().length === 0) {
        throw new errors_1.ValidationError('Property ID must be a non-empty string', 'propertyId');
    }
    // URL validation (optional but if provided, should be valid)
    if (input.url && !isValidRightmoveUrl(input.url)) {
        throw new errors_1.ValidationError('Invalid Rightmove URL format', 'url');
    }
}
function isValidRightmoveUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === 'www.rightmove.co.uk' &&
            urlObj.pathname.includes('/properties/');
    }
    catch {
        return false;
    }
}
function sanitizePropertyId(propertyId) {
    // Remove any non-numeric characters and ensure it's a valid ID
    const cleaned = propertyId.replace(/\D/g, '');
    if (cleaned.length === 0) {
        throw new errors_1.ValidationError('Property ID must contain at least one digit');
    }
    return cleaned;
}
//# sourceMappingURL=validation.js.map