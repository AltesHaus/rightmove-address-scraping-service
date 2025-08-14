import { PropertyInput } from './types';
import { ValidationError } from './errors';

export function validatePropertyInput(input: PropertyInput): void {
  if (!input.propertyId) {
    throw new ValidationError('Property ID is required', 'propertyId');
  }

  if (typeof input.propertyId !== 'string' || input.propertyId.trim().length === 0) {
    throw new ValidationError('Property ID must be a non-empty string', 'propertyId');
  }

  // URL validation (optional but if provided, should be valid)
  if (input.url && !isValidRightmoveUrl(input.url)) {
    throw new ValidationError('Invalid Rightmove URL format', 'url');
  }
}

export function isValidRightmoveUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'www.rightmove.co.uk' && 
           urlObj.pathname.includes('/properties/');
  } catch {
    return false;
  }
}

export function sanitizePropertyId(propertyId: string): string {
  // Remove any non-numeric characters and ensure it's a valid ID
  const cleaned = propertyId.replace(/\D/g, '');
  if (cleaned.length === 0) {
    throw new ValidationError('Property ID must contain at least one digit');
  }
  return cleaned;
}