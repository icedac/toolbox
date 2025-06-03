/**
 * Download result entity representing the outcome of a download operation
 */
export class DownloadResult {
  private constructor(
    public readonly success: boolean,
    public readonly files: DownloadedFile[],
    public readonly errors: DownloadError[],
    public readonly metadata: DownloadMetadata
  ) {}

  /**
   * Create a successful download result
   */
  static success(files: DownloadedFile[], metadata?: Partial<DownloadMetadata>): DownloadResult {
    return new DownloadResult(
      true,
      files,
      [],
      {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        duration: 0,
        ...metadata
      }
    );
  }

  /**
   * Create a failed download result
   */
  static failure(errors: DownloadError[], metadata?: Partial<DownloadMetadata>): DownloadResult {
    return new DownloadResult(
      false,
      [],
      errors,
      {
        totalFiles: 0,
        totalSize: 0,
        duration: 0,
        ...metadata
      }
    );
  }

  /**
   * Create a partial success result
   */
  static partial(
    files: DownloadedFile[], 
    errors: DownloadError[], 
    metadata?: Partial<DownloadMetadata>
  ): DownloadResult {
    return new DownloadResult(
      files.length > 0,
      files,
      errors,
      {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        duration: 0,
        ...metadata
      }
    );
  }

  /**
   * Check if download was partially successful
   */
  isPartialSuccess(): boolean {
    return this.files.length > 0 && this.errors.length > 0;
  }

  /**
   * Get success rate as percentage
   */
  getSuccessRate(): number {
    const total = this.files.length + this.errors.length;
    return total > 0 ? (this.files.length / total) * 100 : 0;
  }
}

/**
 * Downloaded file information
 */
export interface DownloadedFile {
  id: string;
  originalUrl: string;
  localPath: string;
  filename: string;
  size: number; // in bytes
  mimeType: string;
  checksum?: string;
  metadata?: Record<string, any>;
}

/**
 * Download error information
 */
export interface DownloadError {
  code: DownloadErrorCode;
  message: string;
  url?: string;
  details?: any;
  timestamp: Date;
}

/**
 * Download error codes
 */
export enum DownloadErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  
  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  
  // Content errors
  NOT_FOUND = 'NOT_FOUND',
  CONTENT_UNAVAILABLE = 'CONTENT_UNAVAILABLE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  
  // Processing errors
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Storage errors
  STORAGE_ERROR = 'STORAGE_ERROR',
  INSUFFICIENT_SPACE = 'INSUFFICIENT_SPACE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  PLATFORM_ERROR = 'PLATFORM_ERROR'
}

/**
 * Download metadata
 */
export interface DownloadMetadata {
  totalFiles: number;
  totalSize: number; // in bytes
  duration: number; // in milliseconds
  startedAt?: Date;
  completedAt?: Date;
  retryCount?: number;
  source?: string;
  platform?: string;
}