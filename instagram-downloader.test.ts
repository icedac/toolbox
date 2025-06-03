import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { InstagramDownloader, createInstagramDownloader } from './instagram-downloader';
import nodeFetch from 'node-fetch';

// Mock external dependencies
jest.mock('instagram-private-api');
jest.mock('node-fetch');
jest.mock('fs');

const mockedFetch = jest.mocked(nodeFetch) as any;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('InstagramDownloader', () => {
    let downloader: InstagramDownloader;
    
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock fs methods
        mockedFs.existsSync.mockReturnValue(false);
        mockedFs.mkdirSync.mockImplementation(() => undefined);
        mockedFs.writeFileSync.mockImplementation(() => undefined);
    });

    afterEach(async () => {
        if (downloader) {
            await downloader.close();
        }
    });

    describe('Initialization', () => {
        it('should create an instance with default config', async () => {
            downloader = new InstagramDownloader();
            expect(downloader).toBeInstanceOf(InstagramDownloader);
        });

        it('should create an instance with custom config', async () => {
            const config = {
                outputDir: 'custom-output',
                quality: 'medium' as const,
                sessionFile: 'custom-session.json'
            };
            downloader = new InstagramDownloader(config);
            expect(downloader).toBeInstanceOf(InstagramDownloader);
        });

        it('should handle initialization without authentication', async () => {
            downloader = new InstagramDownloader();
            const initialized = await downloader.initialize();
            expect(initialized).toBe(false); // No auth available
        });
    });

    describe('URL Parsing', () => {
        it('should extract shortcode from various Instagram URL formats', () => {
            downloader = new InstagramDownloader();
            
            const testCases = [
                { url: 'https://www.instagram.com/p/ABC123DEF/', expected: 'ABC123DEF' },
                { url: 'https://instagram.com/p/XYZ789/', expected: 'XYZ789' },
                { url: 'https://www.instagram.com/reel/REEL123/', expected: 'REEL123' },
                { url: 'https://www.instagram.com/tv/IGTV456/', expected: 'IGTV456' },
                { url: 'https://invalid-url.com/', expected: null }
            ];

            testCases.forEach(({ url, expected }) => {
                const shortcode = (downloader as any).extractShortcode(url);
                expect(shortcode).toBe(expected);
            });
        });
    });

    describe('Media Type Detection', () => {
        it('should correctly identify media types from web data', () => {
            downloader = new InstagramDownloader();
            
            const photoData = { __typename: 'GraphImage', is_video: false };
            const videoData = { __typename: 'GraphVideo', is_video: true };
            const carouselData = { __typename: 'GraphSidecar', edge_sidecar_to_children: { edges: [] } };
            
            expect((downloader as any).getWebMediaType(photoData)).toBe('photo');
            expect((downloader as any).getWebMediaType(videoData)).toBe('video');
            expect((downloader as any).getWebMediaType(carouselData)).toBe('carousel');
        });
    });

    describe('Image URL Extraction', () => {
        it('should extract best quality image URL from display_resources', () => {
            downloader = new InstagramDownloader();
            
            const mediaData = {
                display_resources: [
                    { src: 'low.jpg', config_width: 320 },
                    { src: 'high.jpg', config_width: 1080 },
                    { src: 'medium.jpg', config_width: 640 }
                ]
            };
            
            const bestUrl = (downloader as any).getBestWebImageUrl(mediaData);
            expect(bestUrl).toBe('high.jpg');
        });

        it('should fallback to display_url if no display_resources', () => {
            downloader = new InstagramDownloader();
            
            const mediaData = {
                display_url: 'fallback.jpg'
            };
            
            const url = (downloader as any).getBestWebImageUrl(mediaData);
            expect(url).toBe('fallback.jpg');
        });

        it('should fallback to thumbnail_src as last resort', () => {
            downloader = new InstagramDownloader();
            
            const mediaData = {
                thumbnail_src: 'thumb.jpg'
            };
            
            const url = (downloader as any).getBestWebImageUrl(mediaData);
            expect(url).toBe('thumb.jpg');
        });
    });

    describe('Cookie Loading', () => {
        it('should load cookies from environment variable JSON', () => {
            process.env.INSTAGRAM_COOKIES_JSON = JSON.stringify([
                { name: 'sessionid', value: 'test-session' },
                { name: 'csrftoken', value: 'test-csrf' }
            ]);

            downloader = new InstagramDownloader();
            const cookies = (downloader as any).getInstagramCookies();
            
            expect(cookies).toHaveLength(2);
            expect(cookies[0].name).toBe('sessionid');
            expect(cookies[1].name).toBe('csrftoken');

            delete process.env.INSTAGRAM_COOKIES_JSON;
        });

        it('should load cookies from base64 encoded environment variable', () => {
            const cookieData = [
                { name: 'sessionid', value: 'test-session-b64' }
            ];
            process.env.INSTAGRAM_COOKIES_B64 = Buffer.from(JSON.stringify(cookieData)).toString('base64');

            downloader = new InstagramDownloader();
            const cookies = (downloader as any).getInstagramCookies();
            
            expect(cookies).toHaveLength(1);
            expect(cookies[0].value).toBe('test-session-b64');

            delete process.env.INSTAGRAM_COOKIES_B64;
        });

        it('should return null if no cookies available', () => {
            downloader = new InstagramDownloader();
            const cookies = (downloader as any).getInstagramCookies();
            expect(cookies).toBeNull();
        });
    });

    describe('Media Download', () => {
        it('should handle successful media info retrieval', async () => {
            downloader = new InstagramDownloader();
            await downloader.initialize();

            // Mock successful API response
            const mockResponse: any = {
                ok: true,
                json: jest.fn<any>().mockResolvedValue({
                    graphql: {
                        shortcode_media: {
                            id: '123456',
                            owner: { username: 'testuser' },
                            display_url: 'https://example.com/photo.jpg',
                            __typename: 'GraphImage',
                            is_video: false
                        }
                    }
                })
            };
            
            (mockedFetch as any).mockResolvedValueOnce(mockResponse);
            (mockedFetch as any).mockResolvedValueOnce({
                ok: true,
                arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(1000))
            });

            const result = await downloader.downloadFromUrl('https://www.instagram.com/p/TEST123/');
            
            expect(result.success).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
        });

        it('should handle download failures gracefully', async () => {
            downloader = new InstagramDownloader();
            await downloader.initialize();

            // Mock failed API response
            (mockedFetch as any).mockResolvedValueOnce({
                ok: false,
                status: 404
            } as any);

            const result = await downloader.downloadFromUrl('https://www.instagram.com/p/NOTFOUND/');
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle carousel posts with multiple media', async () => {
            downloader = new InstagramDownloader();
            await downloader.initialize();

            // Mock carousel response
            const mockResponse: any = {
                ok: true,
                json: jest.fn<any>().mockResolvedValue({
                    graphql: {
                        shortcode_media: {
                            id: '123456',
                            owner: { username: 'testuser' },
                            __typename: 'GraphSidecar',
                            edge_sidecar_to_children: {
                                edges: [
                                    {
                                        node: {
                                            __typename: 'GraphImage',
                                            display_url: 'https://example.com/photo1.jpg',
                                            is_video: false
                                        }
                                    },
                                    {
                                        node: {
                                            __typename: 'GraphVideo',
                                            video_url: 'https://example.com/video1.mp4',
                                            is_video: true
                                        }
                                    }
                                ]
                            }
                        }
                    }
                })
            };
            
            (mockedFetch as any).mockResolvedValueOnce(mockResponse);
            
            // Mock file downloads
            (mockedFetch as any).mockResolvedValue({
                ok: true,
                arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(1000))
            } as any);

            const result = await downloader.downloadFromUrl('https://www.instagram.com/p/CAROUSEL/');
            
            expect(result.success).toBe(true);
            expect(result.files.length).toBe(2); // 2 media files from carousel
        });
    });

    describe('Session Management', () => {
        it('should save session after successful authentication', async () => {
            downloader = new InstagramDownloader({
                sessionFile: 'test-session.json'
            });

            // Mock successful save
            mockedFs.writeFileSync.mockImplementation(() => undefined);

            await (downloader as any).saveSession();
            
            expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
                'test-session.json',
                expect.any(String)
            );
        });

        it('should handle session save failures gracefully', async () => {
            downloader = new InstagramDownloader();
            
            // Mock write failure
            mockedFs.writeFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });

            // Should not throw
            await expect((downloader as any).saveSession()).resolves.not.toThrow();
        });
    });
});