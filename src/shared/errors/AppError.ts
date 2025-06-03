/**
 * Base application error class
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON
   */
  toJSON(): ErrorResponse {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      details: this.details
    };
  }
}

/**
 * Error response interface
 */
export interface ErrorResponse {
  name: string;
  message: string;
  code: string;
  statusCode: number;
  timestamp: Date;
  details?: any;
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string, code: string = 'AUTHENTICATION_ERROR', details?: any) {
    super(message, code, 401, true, details);
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHORIZATION_ERROR', 403, true, details);
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true);
  }
}

/**
 * Conflict error
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, true, details);
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfter });
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, originalError?: any) {
    super(
      `External service error (${service}): ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      true,
      { service, originalError }
    );
  }
}

/**
 * Network error
 */
export class NetworkError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', 503, true, details);
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeout: number) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT',
      504,
      true,
      { operation, timeout }
    );
  }
}

/**
 * Internal server error
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
  }
}

/**
 * Business logic error
 */
export class BusinessError extends AppError {
  constructor(message: string, code: string, details?: any) {
    super(message, code, 422, true, details);
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 500, false, details);
  }
}

/**
 * Platform-specific error
 */
export class PlatformError extends AppError {
  constructor(platform: string, message: string, details?: any) {
    super(
      `Platform error (${platform}): ${message}`,
      'PLATFORM_ERROR',
      503,
      true,
      { platform, ...details }
    );
  }
}