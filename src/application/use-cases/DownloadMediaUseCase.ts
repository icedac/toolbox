import { 
  IMediaDownloader, 
  IFileStorage, 
  Media, 
  MediaCollection, 
  DownloadResult,
  MediaUrl,
  DownloadOptions,
  ExtractOptions
} from '../../domain';
import { 
  ILogger, 
  AppError, 
  ValidationError, 
  BusinessError,
  asyncErrorHandler 
} from '../../shared';

/**
 * Download media use case request
 */
export interface DownloadMediaRequest {
  url: string;
  outputDir?: string;
  quality?: 'high' | 'medium' | 'low' | 'best';
  overwrite?: boolean;
  concurrent?: number;
}

/**
 * Download media use case response
 */
export interface DownloadMediaResponse {
  success: boolean;
  result?: DownloadResult;
  error?: AppError;
}

/**
 * Use case for downloading media
 */
export class DownloadMediaUseCase {
  constructor(
    private readonly downloaders: Map<string, IMediaDownloader>,
    private readonly storage: IFileStorage,
    private readonly logger: ILogger
  ) {}

  /**
   * Execute the use case
   */
  execute = asyncErrorHandler(async (
    request: DownloadMediaRequest
  ): Promise<DownloadMediaResponse> => {
    this.logger.info('Starting media download', { url: request.url });

    // Validate request
    this.validateRequest(request);

    // Parse URL
    const mediaUrl = new MediaUrl(request.url);
    this.logger.debug('Parsed media URL', { 
      platform: mediaUrl.platform, 
      mediaId: mediaUrl.mediaId 
    });

    // Get appropriate downloader
    const downloader = this.getDownloader(mediaUrl.platform);
    if (!downloader) {
      throw new BusinessError(
        `No downloader available for platform: ${mediaUrl.platform}`,
        'UNSUPPORTED_PLATFORM'
      );
    }

    // Extract media information
    const extractOptions: ExtractOptions = {
      quality: request.quality || 'high',
      includeMetadata: true,
      timeout: 30000,
      retryCount: 3
    };

    this.logger.debug('Extracting media information', extractOptions);
    const media = await downloader.extractMedia(mediaUrl.toString(), extractOptions);

    // Prepare download options
    const downloadOptions: DownloadOptions = {
      outputDir: request.outputDir || 'output',
      overwrite: request.overwrite || false,
      concurrent: request.concurrent || 3,
      progressCallback: (progress) => {
        this.logger.debug('Download progress', progress);
      }
    };

    // Download media
    this.logger.info('Downloading media', { 
      type: media instanceof MediaCollection ? 'collection' : 'single',
      count: media instanceof MediaCollection ? media.count : 1
    });

    const result = await downloader.download(media, downloadOptions);

    // Log result
    if (result.success) {
      this.logger.info('Download completed successfully', {
        files: result.files.length,
        totalSize: result.metadata.totalSize,
        duration: result.metadata.duration
      });
    } else {
      this.logger.error('Download failed', undefined, {
        errors: result.errors
      });
    }

    return {
      success: result.success,
      result
    };
  });

  /**
   * Validate request
   */
  private validateRequest(request: DownloadMediaRequest): void {
    if (!request.url) {
      throw new ValidationError('URL is required');
    }

    if (request.quality && !['high', 'medium', 'low', 'best'].includes(request.quality)) {
      throw new ValidationError('Invalid quality value', { 
        quality: request.quality,
        allowed: ['high', 'medium', 'low', 'best']
      });
    }

    if (request.concurrent && (request.concurrent < 1 || request.concurrent > 10)) {
      throw new ValidationError('Concurrent downloads must be between 1 and 10');
    }
  }

  /**
   * Get downloader for platform
   */
  private getDownloader(platform: string): IMediaDownloader | undefined {
    return this.downloaders.get(platform);
  }
}

/**
 * Factory function to create use case
 */
export function createDownloadMediaUseCase(
  downloaders: Map<string, IMediaDownloader>,
  storage: IFileStorage,
  logger: ILogger
): DownloadMediaUseCase {
  return new DownloadMediaUseCase(downloaders, storage, logger);
}