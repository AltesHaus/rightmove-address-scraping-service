export declare class AddressResolverError extends Error {
    code: string;
    step?: string | undefined;
    originalError?: Error | undefined;
    constructor(message: string, code: string, step?: string | undefined, originalError?: Error | undefined);
}
export declare class APIError extends AddressResolverError {
    statusCode?: number | undefined;
    apiName?: string | undefined;
    constructor(message: string, statusCode?: number | undefined, apiName?: string | undefined, originalError?: Error);
}
export declare class TimeoutError extends AddressResolverError {
    timeoutMs: number;
    constructor(message: string, timeoutMs: number, step?: string);
}
export declare class ValidationError extends AddressResolverError {
    field?: string | undefined;
    constructor(message: string, field?: string | undefined);
}
export declare class ParseError extends AddressResolverError {
    data?: any | undefined;
    constructor(message: string, data?: any | undefined, step?: string);
}
//# sourceMappingURL=errors.d.ts.map