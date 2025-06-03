import { AppError, ErrorResponse } from './AppError';

/**
 * Global error handler
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorListeners: ErrorListener[] = [];

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle error
   */
  handle(error: Error | AppError): ErrorResponse {
    // Log error
    this.logError(error);

    // Notify listeners
    this.notifyListeners(error);

    // Convert to AppError if needed
    const appError = this.normalizeError(error);

    // Return error response
    return appError.toJSON();
  }

  /**
   * Handle async error
   */
  async handleAsync(error: Error | AppError): Promise<ErrorResponse> {
    return this.handle(error);
  }

  /**
   * Add error listener
   */
  addListener(listener: ErrorListener): void {
    this.errorListeners.push(listener);
  }

  /**
   * Remove error listener
   */
  removeListener(listener: ErrorListener): void {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * Normalize error to AppError
   */
  private normalizeError(error: Error | AppError): AppError {
    if (error instanceof AppError) {
      return error;
    }

    // Handle specific error types
    if (error.name === 'ValidationError') {
      return new ValidationError(error.message);
    }

    if (error.name === 'TypeError') {
      return new InternalError(`Type error: ${error.message}`, { stack: error.stack });
    }

    if (error.message.includes('ECONNREFUSED')) {
      return new NetworkError('Connection refused', { originalError: error.message });
    }

    if (error.message.includes('ETIMEDOUT')) {
      return new TimeoutError('Network request', 30000);
    }

    // Default to internal error
    return new InternalError(error.message, { 
      originalError: error.name,
      stack: error.stack 
    });
  }

  /**
   * Log error
   */
  private logError(error: Error | AppError): void {
    if (error instanceof AppError) {
      if (error.isOperational) {
        console.error(`[${error.code}] ${error.message}`);
        if (error.details) {
          console.error('Details:', error.details);
        }
      } else {
        console.error('Non-operational error:', error);
        console.error(error.stack);
      }
    } else {
      console.error('Unexpected error:', error);
      console.error(error.stack);
    }
  }

  /**
   * Notify error listeners
   */
  private notifyListeners(error: Error | AppError): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError);
      }
    });
  }
}

/**
 * Error listener type
 */
export type ErrorListener = (error: Error | AppError) => void;

/**
 * Error handler middleware for async functions
 */
export function asyncErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      const errorResponse = handler.handle(error as Error);
      throw new AppError(
        errorResponse.message,
        errorResponse.code,
        errorResponse.statusCode,
        true,
        errorResponse.details
      );
    }
  }) as T;
}

/**
 * Try-catch wrapper with error handling
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: Error) => T | Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (errorHandler) {
      return await errorHandler(error as Error);
    }
    
    const handler = ErrorHandler.getInstance();
    handler.handle(error as Error);
    throw error;
  }
}

/**
 * Create error handler with context
 */
export function createContextualErrorHandler(context: string) {
  return (error: Error | AppError) => {
    const contextualError = error instanceof AppError
      ? error
      : new InternalError(error.message);
    
    contextualError.details = {
      ...contextualError.details,
      context
    };
    
    return ErrorHandler.getInstance().handle(contextualError);
  };
}

// Re-export error classes for convenience
export { ValidationError, InternalError, NetworkError, TimeoutError } from './AppError';