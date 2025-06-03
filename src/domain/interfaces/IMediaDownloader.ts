import { Media, MediaCollection } from '../entities/Media';
import { DownloadResult } from '../entities/DownloadResult';
import { User } from '../entities/User';

/**
 * Core interface for media downloaders
 */
export interface IMediaDownloader {
  /**
   * Extract media information from URL
   */
  extractMedia(url: string, options?: ExtractOptions): Promise<Media | MediaCollection>;

  /**
   * Download media to storage
   */
  download(media: Media | MediaCollection, options?: DownloadOptions): Promise<DownloadResult>;

  /**
   * Check if downloader can handle the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Get supported platforms
   */
  getSupportedPlatforms(): string[];

  /**
   * Authenticate if required
   */
  authenticate?(user: User): Promise<boolean>;

  /**
   * Check if authenticated
   */
  isAuthenticated?(): boolean;
}

/**
 * Options for media extraction
 */
export interface ExtractOptions {
  quality?: 'high' | 'medium' | 'low' | 'best';
  preferredFormat?: string;
  includeMetadata?: boolean;
  timeout?: number;
  retryCount?: number;
}

/**
 * Options for downloading
 */
export interface DownloadOptions {
  outputDir?: string;
  filenamePattern?: string;
  overwrite?: boolean;
  concurrent?: number;
  progressCallback?: (progress: DownloadProgress) => void;
  headers?: Record<string, string>;
  proxy?: ProxyConfig;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  remainingTime: number; // seconds
  currentFile?: string;
  totalFiles?: number;
  completedFiles?: number;
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}