/**
 * Value object representing a safe filename
 */
export class Filename {
  private static readonly MAX_LENGTH = 255;
  private static readonly RESERVED_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
  private static readonly RESERVED_NAMES = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  private readonly value: string;

  constructor(filename: string) {
    if (!filename || filename.trim().length === 0) {
      throw new InvalidFilenameError('Filename cannot be empty');
    }

    this.value = this.sanitize(filename);
  }

  /**
   * Get the sanitized filename
   */
  toString(): string {
    return this.value;
  }

  /**
   * Get filename without extension
   */
  getBasename(): string {
    const lastDot = this.value.lastIndexOf('.');
    return lastDot > 0 ? this.value.substring(0, lastDot) : this.value;
  }

  /**
   * Get file extension (including dot)
   */
  getExtension(): string {
    const lastDot = this.value.lastIndexOf('.');
    return lastDot > 0 ? this.value.substring(lastDot) : '';
  }

  /**
   * Change file extension
   */
  withExtension(extension: string): Filename {
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    return new Filename(this.getBasename() + extension);
  }

  /**
   * Add suffix before extension
   */
  withSuffix(suffix: string): Filename {
    return new Filename(this.getBasename() + suffix + this.getExtension());
  }

  /**
   * Check if filename has extension
   */
  hasExtension(): boolean {
    return this.getExtension().length > 0;
  }

  /**
   * Sanitize filename for filesystem compatibility
   */
  private sanitize(filename: string): string {
    // Remove directory separators
    let sanitized = filename.replace(/[/\\]/g, '_');

    // Replace reserved characters
    sanitized = sanitized.replace(Filename.RESERVED_CHARS, '_');

    // Remove leading/trailing dots and spaces
    sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

    // Handle reserved names (Windows)
    const nameWithoutExt = this.getNameWithoutExtension(sanitized);
    if (Filename.RESERVED_NAMES.includes(nameWithoutExt.toUpperCase())) {
      sanitized = '_' + sanitized;
    }

    // Truncate if too long
    if (sanitized.length > Filename.MAX_LENGTH) {
      const extension = this.getFileExtension(sanitized);
      const basename = sanitized.substring(0, sanitized.length - extension.length);
      const maxBasenameLength = Filename.MAX_LENGTH - extension.length;
      sanitized = basename.substring(0, maxBasenameLength) + extension;
    }

    // Ensure filename is not empty after sanitization
    if (sanitized.length === 0) {
      sanitized = 'unnamed';
    }

    return sanitized;
  }

  /**
   * Get filename without extension (helper for sanitization)
   */
  private getNameWithoutExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(0, lastDot) : filename;
  }

  /**
   * Get file extension (helper for sanitization)
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot) : '';
  }

  /**
   * Create filename from URL
   */
  static fromUrl(url: string, defaultName: string = 'download'): Filename {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastSegment = pathname.split('/').filter(Boolean).pop();
      
      if (lastSegment && lastSegment.includes('.')) {
        return new Filename(decodeURIComponent(lastSegment));
      }
    } catch {
      // Invalid URL, fall through to default
    }
    
    return new Filename(defaultName);
  }

  /**
   * Create filename with timestamp
   */
  static withTimestamp(basename: string, extension: string = ''): Filename {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${basename}_${timestamp}${extension}`;
    return new Filename(filename);
  }

  /**
   * Create filename with counter
   */
  static withCounter(basename: string, counter: number, extension: string = ''): Filename {
    const filename = `${basename}_${counter}${extension}`;
    return new Filename(filename);
  }

  /**
   * Check if two filenames are equal
   */
  equals(other: Filename): boolean {
    return this.value === other.value;
  }
}

/**
 * Error for invalid filenames
 */
export class InvalidFilenameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFilenameError';
  }
}