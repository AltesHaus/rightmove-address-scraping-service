// Custom error types for the address resolution pipeline

export class AddressResolverError extends Error {
  constructor(
    message: string,
    public code: string,
    public step?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AddressResolverError';
  }
}

export class APIError extends AddressResolverError {
  constructor(
    message: string,
    public statusCode?: number,
    public apiName?: string,
    originalError?: Error
  ) {
    super(message, 'API_ERROR', undefined, originalError);
    this.name = 'APIError';
  }
}

export class TimeoutError extends AddressResolverError {
  constructor(message: string, public timeoutMs: number, step?: string) {
    super(message, 'TIMEOUT_ERROR', step);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends AddressResolverError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ParseError extends AddressResolverError {
  constructor(message: string, public data?: any, step?: string) {
    super(message, 'PARSE_ERROR', step);
    this.name = 'ParseError';
  }
}