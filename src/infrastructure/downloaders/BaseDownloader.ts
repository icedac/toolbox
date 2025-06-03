import {
  IMediaDownloader,
  Media,
  MediaCollection,
  DownloadResult,
  ExtractOptions,
  DownloadOptions,
  DownloadProgress,
  DownloadedFile,
  DownloadError,
  DownloadErrorCode
} from '../../domain';
import { ILogger, NetworkError, TimeoutError } from '../../shared';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Base downloader with common functionality
 */
export abstract class BaseDownloader implements IMediaDownloader {
  protected logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Extract media information from URL
   */
  abstract extractMedia(url: string, options?: ExtractOptions): Promise<Media | MediaCollection>;

  /**
   * Check if downloader can handle URL
   */
  abstract canHandle(url: string): boolean;

  /**
   * Get supported platforms
   */
  abstract getSupportedPlatforms(): string[];

  /**
   * Download media to storage
   */
  async download(
    media: Media | MediaCollection, 
    options?: DownloadOptions
  ): Promise<DownloadResult> {
    const startTime = Date.now();
    const errors: DownloadError[] = [];
    const files: DownloadedFile[] = [];

    try {
      // Ensure output directory exists
      const outputDir = options?.outputDir || 'output';
      await this.ensureDirectory(outputDir);

      // Handle collection or single media
      if (media instanceof MediaCollection) {
        await this.downloadCollection(media, outputDir, options, files, errors);
      } else {
        await this.downloadSingle(media, outputDir, options, files, errors);
      }

      // Calculate duration
      const duration = Date.now() - startTime;

      // Return result based on success
      if (files.length > 0 && errors.length === 0) {
        return DownloadResult.success(files, { duration });
      } else if (files.length > 0 && errors.length > 0) {
        return DownloadResult.partial(files, errors, { duration });
      } else {
        return DownloadResult.failure(errors, { duration });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const downloadError: DownloadError = {
        code: DownloadErrorCode.UNKNOWN_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        details: error
      };
      return DownloadResult.failure([downloadError], { duration });
    }
  }

  /**
   * Download collection of media
   */
  protected async downloadCollection(
    collection: MediaCollection,
    outputDir: string,
    options: DownloadOptions | undefined,
    files: DownloadedFile[],
    errors: DownloadError[]
  ): Promise<void> {
    const concurrent = options?.concurrent || 3;
    const items = collection.items;

    // Process in batches
    for (let i = 0; i < items.length; i += concurrent) {
      const batch = items.slice(i, i + concurrent);
      const promises = batch.map((item, index) => 
        this.downloadSingleSafe(
          item, 
          outputDir, 
          options, 
          files, 
          errors,
          i + index + 1
        )
      );
      await Promise.all(promises);
    }
  }

  /**
   * Download single media safely (with error handling)
   */
  protected async downloadSingleSafe(
    media: Media,
    outputDir: string,
    options: DownloadOptions | undefined,
    files: DownloadedFile[],
    errors: DownloadError[],
    index?: number
  ): Promise<void> {
    try {
      await this.downloadSingle(media, outputDir, options, files, errors, index);
    } catch (error) {
      const downloadError: DownloadError = {
        code: this.getErrorCode(error),
        message: error instanceof Error ? error.message : 'Download failed',
        url: media.url,
        timestamp: new Date(),
        details: error
      };
      errors.push(downloadError);
      this.logger.error(`Failed to download media: ${media.url}`, error);
    }
  }

  /**
   * Download single media
   */
  protected async downloadSingle(
    media: Media,
    outputDir: string,
    options: DownloadOptions | undefined,
    files: DownloadedFile[],
    errors: DownloadError[],
    index?: number
  ): Promise<void> {
    // Generate filename
    const filename = this.generateFilename(media, index, options?.filenamePattern);
    const filepath = path.join(outputDir, filename);

    // Check if file exists and overwrite is false
    if (!options?.overwrite && await this.fileExists(filepath)) {
      this.logger.info(`File already exists, skipping: ${filepath}`);
      return;
    }

    // Download file
    this.logger.info(`Downloading: ${media.url} -> ${filepath}`);
    
    const downloadedFile = await this.downloadFile(
      media.metadata.downloadUrl || media.url,
      filepath,
      options
    );

    files.push(downloadedFile);
    this.logger.info(`Downloaded successfully: ${filepath}`);
  }

  /**
   * Download file from URL
   */
  protected abstract downloadFile(
    url: string,
    filepath: string,
    options?: DownloadOptions
  ): Promise<DownloadedFile>;

  /**
   * Generate filename for media
   */
  protected generateFilename(
    media: Media,
    index?: number,
    pattern?: string
  ): string {
    if (pattern) {
      return this.applyFilenamePattern(pattern, media, index);
    }

    const basename = media.metadata.title || media.id;
    const extension = media.getFileExtension();
    const suffix = index ? `_${index}` : '';
    
    return `${basename}${suffix}${extension}`;
  }

  /**
   * Apply filename pattern
   */
  protected applyFilenamePattern(
    pattern: string,
    media: Media,
    index?: number
  ): string {
    return pattern
      .replace('{id}', media.id)
      .replace('{title}', media.metadata.title || media.id)
      .replace('{author}', media.metadata.author || 'unknown')
      .replace('{platform}', media.platform)
      .replace('{type}', media.type)
      .replace('{index}', index?.toString() || '1')
      .replace('{ext}', media.getFileExtension());
  }

  /**
   * Ensure directory exists
   */
  protected async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory: ${dir}`);
    }
  }

  /**
   * Check if file exists
   */
  protected async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get error code from error
   */
  protected getErrorCode(error: any): DownloadErrorCode {
    if (error instanceof NetworkError) {
      return DownloadErrorCode.NETWORK_ERROR;
    }
    if (error instanceof TimeoutError) {
      return DownloadErrorCode.TIMEOUT;
    }
    if (error.code === 'ECONNREFUSED') {
      return DownloadErrorCode.CONNECTION_REFUSED;
    }
    if (error.statusCode === 401) {
      return DownloadErrorCode.UNAUTHORIZED;
    }
    if (error.statusCode === 403) {
      return DownloadErrorCode.FORBIDDEN;
    }
    if (error.statusCode === 404) {
      return DownloadErrorCode.NOT_FOUND;
    }
    if (error.statusCode === 429) {
      return DownloadErrorCode.RATE_LIMITED;
    }
    return DownloadErrorCode.UNKNOWN_ERROR;
  }

  /**
   * Report progress
   */
  protected reportProgress(
    progress: Partial<DownloadProgress>,
    callback?: (progress: DownloadProgress) => void
  ): void {
    if (!callback) return;

    const fullProgress: DownloadProgress = {
      totalBytes: 0,
      downloadedBytes: 0,
      percentage: 0,
      speed: 0,
      remainingTime: 0,
      ...progress
    };

    callback(fullProgress);
  }
}