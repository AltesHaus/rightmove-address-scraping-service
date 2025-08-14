"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("./errors");
class HttpClient {
    defaultTimeout = 30000; // 30 seconds
    async get(url, config = {}) {
        try {
            const response = await axios_1.default.get(url, {
                timeout: this.defaultTimeout,
                ...config,
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, 'GET', url);
            throw error; // TypeScript requires this, but it's unreachable
        }
    }
    async post(url, data, config = {}) {
        try {
            const response = await axios_1.default.post(url, data, {
                timeout: this.defaultTimeout,
                ...config,
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, 'POST', url);
            throw error; // TypeScript requires this, but it's unreachable
        }
    }
    handleError(error, method, url) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            throw new errors_1.TimeoutError(`${method} request to ${url} timed out after ${this.defaultTimeout}ms`, this.defaultTimeout);
        }
        if (error.response) {
            // API returned an error response
            throw new errors_1.APIError(`${method} request failed: ${error.response.statusText}`, error.response.status, url, error);
        }
        else if (error.request) {
            // Network error
            throw new errors_1.APIError(`Network error during ${method} request to ${url}`, undefined, url, error);
        }
        else {
            // Other error
            throw new errors_1.APIError(`Unexpected error during ${method} request to ${url}: ${error.message}`, undefined, url, error);
        }
    }
    setTimeout(timeoutMs) {
        this.defaultTimeout = timeoutMs;
    }
}
exports.HttpClient = HttpClient;
//# sourceMappingURL=http.js.map