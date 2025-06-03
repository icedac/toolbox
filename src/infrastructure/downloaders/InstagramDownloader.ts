import { IMediaDownloader } from '../../domain/interfaces/IMediaDownloader';
import { Media, MediaType, Platform } from '../../domain/entities/Media';
import { MediaUrl } from '../../domain/value-objects/MediaUrl';
import { AppError } from '../../shared/errors/AppError';
import { Logger } from '../../shared/logging/Logger';
import { BaseDownloader } from './BaseDownloader';
import puppeteer, { Browser, Page } from 'puppeteer';
import * as path from 'path';
import nodeFetch from 'node-fetch';

interface InstagramMediaData {
    id: string;
    shortcode: string;
    is_video: boolean;
    display_resources?: Array<{
        src: string;
        config_width: number;
        config_height: number;
    }>;
    video_url?: string;
    dash_info?: any;
    owner?: {
        username: string;
    };
    edge_sidecar_to_children?: {
        edges: Array<{
            node: InstagramMediaData;
        }>;
    };
}

interface InstagramConfig {
    cookies?: Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
    }>;
    timeout?: number;
}

export class InstagramDownloader extends BaseDownloader implements IMediaDownloader {
    private config: InstagramConfig;
    
    constructor(logger: Logger, config: InstagramConfig = {}) {
        super(logger);
        this.config = config;
    }
    
    public canHandle(url: string): boolean {
        try {
            const mediaUrl = new MediaUrl(url);
            return mediaUrl.value.includes('instagram.com');
        } catch {
            return false;
        }
    }
    
    public async extract(url: string): Promise<Media> {
        this.logger.info(`Extracting Instagram media from: ${url}`);
        
        try {
            // Try API method first
            const apiData = await this.extractViaAPI(url);
            if (apiData) {
                return this.convertToMedia(apiData, url);
            }
        } catch (error) {
            this.logger.warn('API extraction failed, falling back to browser method', error);
        }
        
        // Fallback to browser method
        const browserData = await this.extractViaBrowser(url);
        if (!browserData) {
            throw new AppError('Could not extract media information', 'EXTRACTION_FAILED');
        }
        
        return this.convertToMedia(browserData, url);
    }
    
    public async download(media: Media): Promise<Buffer[]> {
        const buffers: Buffer[] = [];
        
        for (const url of media.urls) {
            try {
                const buffer = await this.downloadUrl(url);
                buffers.push(buffer);
            } catch (error) {
                this.logger.error(`Failed to download ${url}`, error);
                throw new AppError(`Download failed for ${url}`, 'DOWNLOAD_FAILED');
            }
        }
        
        return buffers;
    }
    
    private async extractViaAPI(url: string): Promise<InstagramMediaData | null> {
        const maxRetries = 3;
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await nodeFetch(url + '?__a=1&__d=dis', {
                    headers: this.getAPIHeaders(),
                });
                
                if (response.status === 429) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                    this.logger.warn(`Rate limited, waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                if (!response.ok) {
                    throw new Error(`API returned ${response.status}`);
                }
                
                const data = await response.json() as any;
                const mediaData = data?.items?.[0] || data?.graphql?.shortcode_media;
                
                if (!mediaData) {
                    throw new Error('No media data in API response');
                }
                
                return this.normalizeMediaData(mediaData);
                
            } catch (error: any) {
                lastError = error;
                this.logger.warn(`API attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError || new Error('API extraction failed');
    }
    
    private async extractViaBrowser(url: string): Promise<InstagramMediaData | null> {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        
        try {
            const page = await browser.newPage();
            
            // Set cookies if provided
            if (this.config.cookies && this.config.cookies.length > 0) {
                await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
                await page.setCookie(...this.config.cookies);
            }
            
            // Intercept JSON responses
            let mediaData: InstagramMediaData | null = null;
            
            page.on('response', async (response) => {
                try {
                    const url = response.url();
                    const contentType = response.headers()['content-type'] || '';
                    
                    if (contentType.includes('application/json') && url.includes('instagram.com')) {
                        const text = await response.text();
                        const extracted = this.extractMediaFromJSON(text);
                        if (extracted) {
                            mediaData = extracted;
                        }
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });
            
            // Navigate to the post
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: this.config.timeout || 30000
            });
            
            // Wait a bit for dynamic content
            await page.waitForTimeout(3000);
            
            return mediaData;
            
        } finally {
            await browser.close();
        }
    }
    
    private extractMediaFromJSON(jsonStr: string): InstagramMediaData | null {
        try {
            const data = JSON.parse(jsonStr);
            
            // Try various JSON paths where Instagram might store media data
            const paths = [
                'data.xdt_shortcode_media',
                'data.shortcode_media',
                'graphql.shortcode_media',
                'data.xdt_api__v1__media__shortcode__web_info.items[0]',
                'items[0]'
            ];
            
            for (const path of paths) {
                const media = this.getNestedValue(data, path);
                if (media && this.isValidMediaData(media)) {
                    return this.normalizeMediaData(media);
                }
            }
            
            // Recursive search for media data
            return this.searchForMediaData(data);
            
        } catch {
            return null;
        }
    }
    
    private searchForMediaData(obj: any): InstagramMediaData | null {
        if (!obj || typeof obj !== 'object') return null;
        
        if (this.isValidMediaData(obj)) {
            return this.normalizeMediaData(obj);
        }
        
        for (const key in obj) {
            const value = obj[key];
            if (Array.isArray(value)) {
                for (const item of value) {
                    const found = this.searchForMediaData(item);
                    if (found) return found;
                }
            } else if (typeof value === 'object') {
                const found = this.searchForMediaData(value);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    private isValidMediaData(obj: any): boolean {
        return obj && (
            obj.display_resources ||
            obj.video_url ||
            obj.dash_info ||
            obj.image_versions2 ||
            obj.carousel_media
        );
    }
    
    private normalizeMediaData(data: any): InstagramMediaData {
        const normalized: InstagramMediaData = {
            id: data.id || data.pk || 'unknown',
            shortcode: data.shortcode || data.code || 'unknown',
            is_video: data.is_video || data.__typename === 'GraphVideo' || !!data.video_url,
            owner: data.owner || data.user ? {
                username: data.owner?.username || data.user?.username || 'unknown'
            } : undefined
        };
        
        // Handle display resources
        if (data.display_resources) {
            normalized.display_resources = data.display_resources;
        } else if (data.image_versions2?.candidates) {
            normalized.display_resources = data.image_versions2.candidates.map((img: any) => ({
                src: img.url,
                config_width: img.width,
                config_height: img.height
            }));
        }
        
        // Handle video URL
        if (data.video_url) {
            normalized.video_url = data.video_url;
        } else if (data.video_versions && data.video_versions.length > 0) {
            normalized.video_url = data.video_versions[0].url;
        }
        
        // Handle carousel/sidecar
        if (data.edge_sidecar_to_children) {
            normalized.edge_sidecar_to_children = data.edge_sidecar_to_children;
        } else if (data.carousel_media) {
            normalized.edge_sidecar_to_children = {
                edges: data.carousel_media.map((child: any) => ({
                    node: this.normalizeMediaData(child)
                }))
            };
        }
        
        return normalized;
    }
    
    private convertToMedia(data: InstagramMediaData, url: string): Media {
        const urls: string[] = [];
        const mediaType = this.determineMediaType(data);
        
        // Extract URLs based on media type
        if (mediaType === MediaType.VIDEO && data.video_url) {
            urls.push(data.video_url);
        } else if (mediaType === MediaType.CAROUSEL && data.edge_sidecar_to_children) {
            for (const edge of data.edge_sidecar_to_children.edges) {
                const child = edge.node;
                if (child.video_url) {
                    urls.push(child.video_url);
                } else if (child.display_resources) {
                    const best = this.getBestImage(child.display_resources);
                    if (best) urls.push(best.src);
                }
            }
        } else if (data.display_resources) {
            const best = this.getBestImage(data.display_resources);
            if (best) urls.push(best.src);
        }
        
        return new Media({
            id: data.id,
            platform: Platform.INSTAGRAM,
            type: mediaType,
            url: new MediaUrl(url),
            urls,
            metadata: {
                shortcode: data.shortcode,
                username: data.owner?.username || 'unknown',
                isVideo: data.is_video
            }
        });
    }
    
    private determineMediaType(data: InstagramMediaData): MediaType {
        if (data.edge_sidecar_to_children) {
            return MediaType.CAROUSEL;
        } else if (data.is_video || data.video_url) {
            return MediaType.VIDEO;
        } else {
            return MediaType.IMAGE;
        }
    }
    
    private getBestImage(resources: Array<{ src: string; config_width: number; config_height: number }>): any {
        if (!resources || resources.length === 0) return null;
        return resources.reduce((best, current) => {
            const currentRes = current.config_width * current.config_height;
            const bestRes = best.config_width * best.config_height;
            return currentRes > bestRes ? current : best;
        });
    }
    
    private getAPIHeaders(): Record<string, string> {
        return {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.instagram.com/',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }
    
    private getNestedValue(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                const [, key, index] = arrayMatch;
                if (!current[key] || !Array.isArray(current[key])) return null;
                current = current[key][parseInt(index)];
            } else {
                if (!current || typeof current !== 'object' || !(part in current)) return null;
                current = current[part];
            }
        }
        
        return current;
    }
    
    private async downloadUrl(url: string): Promise<Buffer> {
        const response = await nodeFetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
    }
}