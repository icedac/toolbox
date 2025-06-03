import { Platform } from '../entities/Media';

/**
 * Value object representing a media URL
 */
export class MediaUrl {
  private readonly url: URL;
  private readonly _platform: Platform;
  private readonly _mediaId: string;

  constructor(url: string) {
    try {
      this.url = new URL(url);
    } catch (error) {
      throw new InvalidUrlError(`Invalid URL: ${url}`);
    }

    const platform = this.detectPlatform();
    if (!platform) {
      throw new UnsupportedPlatformError(`Unsupported platform for URL: ${url}`);
    }
    this._platform = platform;

    const mediaId = this.extractMediaId();
    if (!mediaId) {
      throw new InvalidUrlError(`Cannot extract media ID from URL: ${url}`);
    }
    this._mediaId = mediaId;
  }

  /**
   * Get the original URL string
   */
  toString(): string {
    return this.url.toString();
  }

  /**
   * Get the platform
   */
  get platform(): Platform {
    return this._platform;
  }

  /**
   * Get the media ID
   */
  get mediaId(): string {
    return this._mediaId;
  }

  /**
   * Get the hostname
   */
  get hostname(): string {
    return this.url.hostname;
  }

  /**
   * Check if URL is valid for the platform
   */
  isValid(): boolean {
    return this._platform !== null && this._mediaId !== null;
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(): Platform | null {
    const hostname = this.url.hostname.toLowerCase();
    
    if (hostname.includes('instagram.com')) {
      return Platform.INSTAGRAM;
    } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return Platform.YOUTUBE;
    } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      return Platform.TWITTER;
    } else if (hostname.includes('threads.net')) {
      return Platform.THREADS;
    } else if (hostname.includes('tiktok.com')) {
      return Platform.TIKTOK;
    }
    
    return null;
  }

  /**
   * Extract media ID from URL
   */
  private extractMediaId(): string | null {
    const pathname = this.url.pathname;
    
    switch (this._platform) {
      case Platform.INSTAGRAM:
        // Match /p/MEDIA_ID/ or /reel/MEDIA_ID/ or /tv/MEDIA_ID/
        const instagramMatch = pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
        return instagramMatch ? instagramMatch[2] : null;
        
      case Platform.YOUTUBE:
        // Match watch?v=VIDEO_ID or youtu.be/VIDEO_ID
        if (this.url.hostname.includes('youtu.be')) {
          return pathname.slice(1); // Remove leading slash
        }
        return this.url.searchParams.get('v');
        
      case Platform.TWITTER:
        // Match /username/status/TWEET_ID
        const twitterMatch = pathname.match(/\/[^\/]+\/status\/(\d+)/);
        return twitterMatch ? twitterMatch[1] : null;
        
      case Platform.THREADS:
        // Match /t/THREAD_ID or /@username/post/THREAD_ID
        const threadsMatch = pathname.match(/\/(t|@[^\/]+\/post)\/([A-Za-z0-9_-]+)/);
        return threadsMatch ? threadsMatch[2] : null;
        
      case Platform.TIKTOK:
        // Match /@username/video/VIDEO_ID or /video/VIDEO_ID
        const tiktokMatch = pathname.match(/\/(@[^\/]+\/)?video\/(\d+)/);
        return tiktokMatch ? tiktokMatch[2] : null;
        
      default:
        return null;
    }
  }

  /**
   * Create normalized URL for the platform
   */
  getNormalizedUrl(): string {
    switch (this._platform) {
      case Platform.INSTAGRAM:
        return `https://www.instagram.com/p/${this._mediaId}/`;
      case Platform.YOUTUBE:
        return `https://www.youtube.com/watch?v=${this._mediaId}`;
      case Platform.TWITTER:
        return `https://twitter.com/i/status/${this._mediaId}`;
      case Platform.THREADS:
        return `https://www.threads.net/t/${this._mediaId}`;
      case Platform.TIKTOK:
        return `https://www.tiktok.com/video/${this._mediaId}`;
      default:
        return this.toString();
    }
  }

  /**
   * Check if two MediaUrls are equal
   */
  equals(other: MediaUrl): boolean {
    return this._platform === other._platform && this._mediaId === other._mediaId;
  }
}

/**
 * Error for invalid URLs
 */
export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

/**
 * Error for unsupported platforms
 */
export class UnsupportedPlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedPlatformError';
  }
}