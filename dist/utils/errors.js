"use strict";
// Custom error types for the address resolution pipeline
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParseError = exports.ValidationError = exports.TimeoutError = exports.APIError = exports.AddressResolverError = void 0;
class AddressResolverError extends Error {
    code;
    step;
    originalError;
    constructor(message, code, step, originalError) {
        super(message);
        this.code = code;
        this.step = step;
        this.originalError = originalError;
        this.name = 'AddressResolverError';
    }
}
exports.AddressResolverError = AddressResolverError;
class APIError extends AddressResolverError {
    statusCode;
    apiName;
    constructor(message, statusCode, apiName, originalError) {
        super(message, 'API_ERROR', undefined, originalError);
        this.statusCode = statusCode;
        this.apiName = apiName;
        this.name = 'APIError';
    }
}
exports.APIError = APIError;
class TimeoutError extends AddressResolverError {
    timeoutMs;
    constructor(message, timeoutMs, step) {
        super(message, 'TIMEOUT_ERROR', step);
        this.timeoutMs = timeoutMs;
        this.name = 'TimeoutError';
    }
}
exports.TimeoutError = TimeoutError;
class ValidationError extends AddressResolverError {
    field;
    constructor(message, field) {
        super(message, 'VALIDATION_ERROR');
        this.field = field;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class ParseError extends AddressResolverError {
    data;
    constructor(message, data, step) {
        super(message, 'PARSE_ERROR', step);
        this.data = data;
        this.name = 'ParseError';
    }
}
exports.ParseError = ParseError;
//# sourceMappingURL=errors.js.map