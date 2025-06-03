import { IgApiClient } from 'instagram-private-api';
import * as fs from 'fs';
import * as path from 'path';
import nodeFetch from 'node-fetch';
import { execSync } from 'child_process';

/* --------------------- Types --------------------- */
interface InstagramConfig {
    username?: string;
    password?: string;
    sessionFile?: string;
    outputDir?: string;
    quality?: 'high' | 'medium' | 'low';
}

interface DownloadResult {
    success: boolean;
    files: string[];
    error?: string;
}

interface MediaInfo {
    id: string;
    shortcode: string;
    username: string;
    caption?: string;
    mediaType: 'photo' | 'video' | 'carousel';
    urls: string[];
    isVideo: boolean;
}

/* --------------------- Instagram Downloader Class --------------------- */
export class InstagramDownloader {
    private ig: IgApiClient;
    private config: InstagramConfig;
    private isLoggedIn: boolean = false;

    constructor(config: InstagramConfig = {}) {
        this.ig = new IgApiClient();
        this.config = {
            outputDir: 'output',
            quality: 'high',
            ...config
        };
        
        // Set device and user agent
        this.ig.state.generateDevice(process.env.IG_USERNAME || 'dummy_user');
    }

    /**
     * Initialize and authenticate with Instagram
     */
    async initialize(): Promise<boolean> {
        try {
            // Try to load existing session first
            if (await this.loadSession()) {
                console.log('✅ Loaded existing Instagram session');
                return true;
            }

            // Try cookie-based authentication (fallback to existing method)
            if (await this.authenticateWithCookies()) {
                console.log('✅ Authenticated with cookies');
                await this.saveSession();
                return true;
            }

            // Try username/password authentication
            if (this.config.username && this.config.password) {
                await this.authenticateWithCredentials();
                console.log('✅ Authenticated with credentials');
                await this.saveSession();
                return true;
            }

            console.log('⚠️  No authentication method available - proceeding without login');
            return false;

        } catch (error: any) {
            console.log('❌ Instagram authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Load session from file
     */
    private async loadSession(): Promise<boolean> {
        try {
            const sessionFile = this.config.sessionFile || '.instagram_session.json';
            if (!fs.existsSync(sessionFile)) {
                return false;
            }

            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
            await this.ig.state.deserialize(sessionData);
            
            // Test if session is still valid
            await this.ig.user.info(this.ig.state.cookieUserId);
            this.isLoggedIn = true;
            return true;
        } catch (error) {
            // Session invalid, remove file
            try {
                const sessionFile = this.config.sessionFile || '.instagram_session.json';
                fs.unlinkSync(sessionFile);
            } catch {}
            return false;
        }
    }

    /**
     * Save current session to file
     */
    private async saveSession(): Promise<void> {
        try {
            const sessionFile = this.config.sessionFile || '.instagram_session.json';
            const sessionData = await this.ig.state.serialize();
            fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
        } catch (error) {
            console.log('⚠️  Failed to save session:', error);
        }
    }

    /**
     * Authenticate using cookies from environment variables
     */
    private async authenticateWithCookies(): Promise<boolean> {
        try {
            // For now, skip cookie authentication and rely on public access
            // The instagram-private-api can work with public posts without authentication
            console.log('ℹ️  Using public access mode (no authentication)');
            return false; // Return false to indicate no authentication, but continue with public access

        } catch (error: any) {
            console.log('Cookie authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Authenticate using username and password
     */
    private async authenticateWithCredentials(): Promise<void> {
        if (!this.config.username || !this.config.password) {
            throw new Error('Username and password are required for credential authentication');
        }

        await this.ig.account.login(this.config.username, this.config.password);
        this.isLoggedIn = true;
    }

    /**
     * Get Instagram cookies from environment (reuse existing logic)
     */
    private getInstagramCookies(): Array<{name: string, value: string}> | null {
        try {
            // Method 1: Cookie file path
            const cookieFile = process.env.INSTAGRAM_COOKIES_FILE;
            if (cookieFile && fs.existsSync(cookieFile)) {
                return this.loadCookiesFromFile(cookieFile);
            }
            
            // Method 2: Direct cookie JSON
            const cookieJson = process.env.INSTAGRAM_COOKIES_JSON;
            if (cookieJson) {
                return JSON.parse(cookieJson);
            }
            
            // Method 3: Base64 encoded cookies
            const cookieB64 = process.env.INSTAGRAM_COOKIES_B64;
            if (cookieB64) {
                const decoded = Buffer.from(cookieB64, 'base64').toString('utf-8');
                return JSON.parse(decoded);
            }
            
            return null;
        } catch (error: any) {
            console.log('❌ Error loading Instagram cookies:', error.message);
            return null;
        }
    }

    /**
     * Load cookies from Netscape format file
     */
    private loadCookiesFromFile(filePath: string): Array<{name: string, value: string}> | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const cookies: Array<{name: string, value: string}> = [];
            
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                
                const parts = trimmed.split('\t');
                if (parts.length >= 7) {
                    cookies.push({
                        name: parts[5],
                        value: parts[6]
                    });
                }
            }
            
            return cookies;
        } catch (error: any) {
            console.log('❌ Error reading cookies file:', error.message);
            return null;
        }
    }

    /**
     * Download media from Instagram URL
     */
    async downloadFromUrl(url: string): Promise<DownloadResult> {
        try {
            const mediaInfo = await this.getMediaInfo(url);
            if (!mediaInfo) {
                return { success: false, files: [], error: 'Could not extract media info' };
            }

            const outputDir = path.join(this.config.outputDir!, mediaInfo.username);
            fs.mkdirSync(outputDir, { recursive: true });

            // Save metadata
            const metadataPath = path.join(outputDir, `${mediaInfo.shortcode}.json`);
            fs.writeFileSync(metadataPath, JSON.stringify(mediaInfo, null, 2));

            const downloadedFiles: string[] = [metadataPath];

            // Download media files
            for (let i = 0; i < mediaInfo.urls.length; i++) {
                const mediaUrl = mediaInfo.urls[i];
                const extension = mediaInfo.isVideo ? '.mp4' : '.jpg';
                const filename = mediaInfo.urls.length > 1 
                    ? `${mediaInfo.shortcode}_${i + 1}${extension}`
                    : `${mediaInfo.shortcode}${extension}`;
                
                const filePath = path.join(outputDir, filename);
                await this.downloadFile(mediaUrl, filePath);
                downloadedFiles.push(filePath);
                
                console.log(`Saved file => ${filename}`);
            }

            console.log(`Found username => ${mediaInfo.username}`);
            return { success: true, files: downloadedFiles };

        } catch (error: any) {
            return { success: false, files: [], error: error.message };
        }
    }

    /**
     * Extract media information from Instagram URL using web scraping
     */
    private async getMediaInfo(url: string): Promise<MediaInfo | null> {
        try {
            // Use web scraping approach similar to the original implementation
            // This is more reliable for public posts and doesn't require authentication
            const response = await nodeFetch(url + '?__a=1&__d=dis');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch post data: ${response.status}`);
            }

            const data = await response.json() as any;
            const mediaData = data?.items?.[0] || data?.graphql?.shortcode_media;
            
            if (!mediaData) {
                throw new Error('No media data found in response');
            }

            const shortcode = this.extractShortcode(url);
            const result: MediaInfo = {
                id: mediaData.id || shortcode || 'unknown',
                shortcode: shortcode || 'unknown',
                username: mediaData.owner?.username || mediaData.user?.username || 'unknown',
                caption: mediaData.caption?.text || mediaData.edge_media_to_caption?.edges?.[0]?.node?.text,
                mediaType: this.getWebMediaType(mediaData),
                urls: [],
                isVideo: false
            };

            // Extract media URLs based on type
            if (mediaData.__typename === 'GraphImage' || !mediaData.is_video) {
                // Single photo
                result.urls = [this.getBestWebImageUrl(mediaData)];
            } else if (mediaData.__typename === 'GraphVideo' || mediaData.is_video) {
                // Single video
                result.isVideo = true;
                result.urls = [mediaData.video_url || ''];
            } else if (mediaData.__typename === 'GraphSidecar' || mediaData.edge_sidecar_to_children) {
                // Carousel (multiple media)
                result.mediaType = 'carousel';
                const children = mediaData.edge_sidecar_to_children?.edges || [];
                for (const edge of children) {
                    const child = edge.node;
                    if (child.__typename === 'GraphImage' || !child.is_video) {
                        result.urls.push(this.getBestWebImageUrl(child));
                    } else if (child.__typename === 'GraphVideo' || child.is_video) {
                        result.isVideo = true;
                        result.urls.push(child.video_url || '');
                    }
                }
            }

            return result;

        } catch (error: any) {
            console.log('Error getting media info:', error.message);
            return null;
        }
    }

    /**
     * Extract shortcode from Instagram URL
     */
    private extractShortcode(url: string): string | null {
        const patterns = [
            /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/tv\/([A-Za-z0-9_-]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    /**
     * Get media type string from web data
     */
    private getWebMediaType(media: any): 'photo' | 'video' | 'carousel' {
        if (media.__typename === 'GraphVideo' || media.is_video) return 'video';
        if (media.__typename === 'GraphSidecar' || media.edge_sidecar_to_children) return 'carousel';
        return 'photo';
    }

    /**
     * Get best quality image URL from web data
     */
    private getBestWebImageUrl(media: any): string {
        // Try different possible image URL fields
        if (media.display_resources && media.display_resources.length > 0) {
            // Return highest resolution from display_resources
            const best = media.display_resources.reduce((prev: any, curr: any) => 
                curr.config_width > prev.config_width ? curr : prev
            );
            return best.src;
        }
        
        if (media.display_url) return media.display_url;
        if (media.thumbnail_src) return media.thumbnail_src;
        
        return '';
    }

    /**
     * Download file from URL
     */
    private async downloadFile(url: string, filePath: string): Promise<void> {
        const response = await nodeFetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
    }

    /**
     * Close the Instagram client
     */
    async close(): Promise<void> {
        // Save session before closing
        if (this.isLoggedIn) {
            await this.saveSession();
        }
    }
}

/* --------------------- Factory Function --------------------- */
export async function createInstagramDownloader(config?: InstagramConfig): Promise<InstagramDownloader> {
    const downloader = new InstagramDownloader(config);
    await downloader.initialize();
    return downloader;
}