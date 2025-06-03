/**
 * Core Media entity representing downloadable content
 */
export class Media {
  constructor(
    public readonly id: string,
    public readonly url: string,
    public readonly type: MediaType,
    public readonly platform: Platform,
    public readonly metadata: MediaMetadata,
    public readonly createdAt: Date = new Date()
  ) {}

  /**
   * Check if media is a video type
   */
  isVideo(): boolean {
    return this.type === MediaType.VIDEO || this.type === MediaType.VIDEO_DASH;
  }

  /**
   * Check if media is an image type
   */
  isImage(): boolean {
    return this.type === MediaType.IMAGE;
  }

  /**
   * Get file extension based on media type
   */
  getFileExtension(): string {
    switch (this.type) {
      case MediaType.IMAGE:
        return '.jpg';
      case MediaType.VIDEO:
      case MediaType.VIDEO_DASH:
        return '.mp4';
      case MediaType.AUDIO:
        return '.mp3';
      default:
        return '';
    }
  }
}

/**
 * Media types supported by the application
 */
export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  VIDEO_DASH = 'VIDEO_DASH',
  AUDIO = 'AUDIO',
  CAROUSEL = 'CAROUSEL'
}

/**
 * Supported platforms
 */
export enum Platform {
  INSTAGRAM = 'INSTAGRAM',
  YOUTUBE = 'YOUTUBE',
  TWITTER = 'TWITTER',
  THREADS = 'THREADS',
  TIKTOK = 'TIKTOK'
}

/**
 * Media metadata interface
 */
export interface MediaMetadata {
  title?: string;
  description?: string;
  author?: string;
  authorId?: string;
  duration?: number; // in seconds
  width?: number;
  height?: number;
  fileSize?: number; // in bytes
  quality?: MediaQuality;
  thumbnail?: string;
  downloadUrl?: string;
  alternativeUrls?: string[];
}

/**
 * Media quality levels
 */
export enum MediaQuality {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  BEST = 'BEST'
}

/**
 * Media collection for carousel/album posts
 */
export class MediaCollection {
  constructor(
    public readonly id: string,
    public readonly items: Media[],
    public readonly platform: Platform,
    public readonly metadata: CollectionMetadata
  ) {}

  /**
   * Get total count of media items
   */
  get count(): number {
    return this.items.length;
  }

  /**
   * Check if collection has video content
   */
  hasVideo(): boolean {
    return this.items.some(item => item.isVideo());
  }

  /**
   * Check if collection has image content
   */
  hasImage(): boolean {
    return this.items.some(item => item.isImage());
  }
}

/**
 * Collection metadata
 */
export interface CollectionMetadata {
  title?: string;
  description?: string;
  author?: string;
  authorId?: string;
  createdAt?: Date;
  totalItems: number;
}