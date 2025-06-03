import { DownloadedFile } from '../entities/DownloadResult';

/**
 * Core interface for file storage operations
 */
export interface IFileStorage {
  /**
   * Save data to storage
   */
  save(path: string, data: Buffer | NodeJS.ReadableStream, options?: SaveOptions): Promise<DownloadedFile>;

  /**
   * Read file from storage
   */
  read(path: string): Promise<Buffer>;

  /**
   * Stream file from storage
   */
  stream(path: string): NodeJS.ReadableStream;

  /**
   * Check if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Delete file from storage
   */
  delete(path: string): Promise<void>;

  /**
   * Get file metadata
   */
  getMetadata(path: string): Promise<FileMetadata>;

  /**
   * Create directory
   */
  createDirectory(path: string): Promise<void>;

  /**
   * List files in directory
   */
  list(directory: string, options?: ListOptions): Promise<FileInfo[]>;

  /**
   * Get available space in bytes
   */
  getAvailableSpace?(): Promise<number>;
}

/**
 * Options for saving files
 */
export interface SaveOptions {
  overwrite?: boolean;
  createDirectories?: boolean;
  permissions?: string;
  metadata?: Record<string, any>;
  progressCallback?: (progress: SaveProgress) => void;
}

/**
 * Save progress information
 */
export interface SaveProgress {
  totalBytes: number;
  savedBytes: number;
  percentage: number;
}

/**
 * File metadata
 */
export interface FileMetadata {
  size: number; // in bytes
  createdAt: Date;
  modifiedAt: Date;
  mimeType?: string;
  checksum?: string;
  permissions?: string;
  customMetadata?: Record<string, any>;
}

/**
 * Options for listing files
 */
export interface ListOptions {
  recursive?: boolean;
  pattern?: string; // glob pattern
  includeDirectories?: boolean;
  sortBy?: 'name' | 'size' | 'date';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

/**
 * File information
 */
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  createdAt: Date;
  modifiedAt: Date;
}