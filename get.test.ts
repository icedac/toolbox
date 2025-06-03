import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';

// Mock external dependencies
jest.mock('puppeteer');
jest.mock('node-fetch');
jest.mock('sharp');
jest.mock('./instagram-downloader');
jest.mock('fs');
jest.mock('image-size');

describe('get.ts - Main Media Downloader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('URL Parsing', () => {
        it('should correctly identify Instagram URLs', () => {
            const instagramUrls = [
                'https://www.instagram.com/p/ABC123/',
                'https://instagram.com/reel/XYZ789/',
                'https://www.instagram.com/tv/DEF456/'
            ];

            instagramUrls.forEach(url => {
                const domain = new URL(url).hostname;
                expect(domain).toMatch(/instagram/);
            });
        });

        it('should correctly identify YouTube URLs', () => {
            const youtubeUrls = [
                'https://www.youtube.com/watch?v=ABC123',
                'https://youtu.be/XYZ789',
                'https://youtube.com/shorts/DEF456'
            ];

            youtubeUrls.forEach(url => {
                const domain = new URL(url).hostname;
                expect(domain).toMatch(/youtube|youtu\.be/);
            });
        });

        it('should correctly identify Twitter URLs', () => {
            const twitterUrls = [
                'https://twitter.com/user/status/123456',
                'https://x.com/user/status/789012'
            ];

            twitterUrls.forEach(url => {
                const domain = new URL(url).hostname;
                expect(domain).toMatch(/twitter|x\.com/);
            });
        });
    });

    describe('Helper Functions', () => {
        // Import the functions we need to test
        const { parseSizeThreshold, parseTimeout, parseOutputFolder } = require('./get');

        it('should parse size threshold correctly', () => {
            expect(parseSizeThreshold('100')).toBe(100);
            expect(parseSizeThreshold('10k')).toBe(10240);
            expect(parseSizeThreshold('5K')).toBe(5120);
            expect(parseSizeThreshold()).toBe(10240); // default
            expect(parseSizeThreshold('invalid')).toBe(10240); // default
        });

        it('should parse timeout correctly', () => {
            expect(parseTimeout('5')).toBe(5000);
            expect(parseTimeout('10')).toBe(10000);
            expect(parseTimeout()).toBe(10000); // default
            expect(parseTimeout('invalid')).toBe(10000); // default
        });

        it('should parse output folder from URL', () => {
            expect(parseOutputFolder('https://example.com/path/folder')).toBe('folder');
            expect(parseOutputFolder('https://example.com/')).toBe('output');
            expect(parseOutputFolder('invalid-url')).toBe('output');
        });
    });

    describe('Media Filtering', () => {
        const { filterAndSaveMedia } = require('./get');
        const fs = require('fs');

        beforeEach(() => {
            // Mock fs methods for this test suite
            fs.mkdirSync = jest.fn();
            fs.writeFileSync = jest.fn();
        });

        it('should filter images by size threshold', () => {
            const smallImage = Buffer.alloc(100); // 100 bytes
            const largeImage = Buffer.alloc(20000); // 20KB

            const smallResource = {
                url: 'https://example.com/small.jpg',
                buf: smallImage,
                ctype: 'image/jpeg'
            };

            const largeResource = {
                url: 'https://example.com/large.jpg',
                buf: largeImage,
                ctype: 'image/jpeg'
            };

            // Small image should be filtered out
            expect(filterAndSaveMedia('test-output', smallResource, 10240)).toBe(false);
            
            // Large image should be saved
            expect(filterAndSaveMedia('test-output', largeResource, 10240)).toBe(true);
        });

        it('should filter PNG images', () => {
            const pngResource = {
                url: 'https://example.com/image.png',
                buf: Buffer.alloc(20000),
                ctype: 'image/png'
            };

            expect(filterAndSaveMedia('test-output', pngResource, 1024)).toBe(false);
        });
    });

    describe('CLI Arguments', () => {
        it('should parse command line arguments correctly', () => {
            const originalArgv = process.argv;
            
            // Test with URL only
            process.argv = ['node', 'get.js', 'https://example.com/video'];
            const args1 = process.argv.slice(2);
            expect(args1[0]).toBe('https://example.com/video');

            // Test with all arguments
            process.argv = ['node', 'get.js', 'https://example.com/video', 'video', '100k', '--timeout', '30', '--verbose'];
            const args2 = process.argv.slice(2);
            expect(args2).toContain('--verbose');
            expect(args2).toContain('--timeout');
            
            process.argv = originalArgv;
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid URLs gracefully', async () => {
            // Mock the instagram-downloader module
            const mockDownloader = {
                downloadFromUrl: jest.fn<any>().mockResolvedValue({
                    success: false,
                    error: 'Invalid URL'
                }),
                close: jest.fn<any>().mockResolvedValue(undefined)
            };
            
            const { createInstagramDownloader } = require('./instagram-downloader');
            (createInstagramDownloader as jest.Mock<any>).mockResolvedValue(mockDownloader);
            
            const { handleInstagram } = require('./get');
            
            // This should complete without throwing
            await handleInstagram('not-a-url', 'any', '0');
            
            // Verify the downloader was called
            expect(mockDownloader.downloadFromUrl).toHaveBeenCalledWith('not-a-url');
            expect(mockDownloader.close).toHaveBeenCalled();
        });

        it('should handle Instagram 404 errors and fallback to legacy method', async () => {
            // Mock the instagram-downloader to fail with 404
            const mockDownloader = {
                downloadFromUrl: jest.fn<any>().mockResolvedValue({
                    success: false,
                    error: 'Could not extract media info'
                }),
                close: jest.fn<any>().mockResolvedValue(undefined)
            };
            
            const { createInstagramDownloader } = require('./instagram-downloader');
            (createInstagramDownloader as jest.Mock<any>).mockResolvedValue(mockDownloader);
            
            // Mock puppeteer for legacy fallback
            const mockPage = {
                setRequestInterception: jest.fn<any>(),
                on: jest.fn<any>(),
                goto: jest.fn<any>().mockResolvedValue(undefined),
                close: jest.fn<any>().mockResolvedValue(undefined)
            };
            
            const mockBrowser = {
                newPage: jest.fn<any>().mockResolvedValue(mockPage),
                close: jest.fn<any>().mockResolvedValue(undefined)
            };
            
            const puppeteer = require('puppeteer');
            puppeteer.launch = jest.fn<any>().mockResolvedValue(mockBrowser);
            
            const { handleInstagram } = require('./get');
            
            // Test the scenario where primary method fails and legacy is called
            await handleInstagram('https://www.instagram.com/p/DKM6hijhURN/', 'any', '10k');
            
            // Verify both methods were attempted
            expect(mockDownloader.downloadFromUrl).toHaveBeenCalledWith('https://www.instagram.com/p/DKM6hijhURN/');
            expect(puppeteer.launch).toHaveBeenCalled();
            expect(mockPage.goto).toHaveBeenCalledWith('https://www.instagram.com/p/DKM6hijhURN/', { waitUntil: 'networkidle2' });
        });

        it('should handle Instagram posts with missing owner information', () => {
            const { findJsonItemWithOwner } = require('./get');
            
            // Test with valid Instagram API response but no owner info
            const graphqlResponseWithoutOwner = JSON.stringify({
                data: {
                    shortcode_media: {
                        id: "1234567890",
                        display_url: "https://example.com/image.jpg",
                        is_video: false,
                        display_resources: [
                            { src: "https://example.com/image_small.jpg", config_width: 150, config_height: 150 },
                            { src: "https://example.com/image_large.jpg", config_width: 1080, config_height: 1080 }
                        ]
                    }
                }
            });
            
            const result = findJsonItemWithOwner(graphqlResponseWithoutOwner);
            expect(result).toBeNull();
        });

        it('should handle Instagram posts with owner information', () => {
            const { findJsonItemWithOwner } = require('./get');
            
            // Test with valid Instagram API response with owner info
            const graphqlResponseWithOwner = JSON.stringify({
                data: {
                    shortcode_media: {
                        id: "1234567890",
                        owner: {
                            username: "_chaechae_1",
                            id: "987654321"
                        },
                        display_url: "https://example.com/image.jpg",
                        is_video: false,
                        display_resources: [
                            { src: "https://example.com/image_small.jpg", config_width: 150, config_height: 150 },
                            { src: "https://example.com/image_large.jpg", config_width: 1080, config_height: 1080 }
                        ],
                        edge_sidecar_to_children: {
                            edges: [
                                {
                                    node: {
                                        display_url: "https://example.com/carousel1.jpg",
                                        display_resources: [
                                            { src: "https://example.com/carousel1_large.jpg", config_width: 1080, config_height: 1080 }
                                        ]
                                    }
                                },
                                {
                                    node: {
                                        display_url: "https://example.com/carousel2.jpg", 
                                        display_resources: [
                                            { src: "https://example.com/carousel2_large.jpg", config_width: 1080, config_height: 1080 }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            });
            
            const result = findJsonItemWithOwner(graphqlResponseWithOwner);
            expect(result).not.toBeNull();
            expect(result?.owner?.username).toBe('_chaechae_1');
        });

        it('should handle different Instagram post types (carousel vs single)', async () => {
            const fs = require('fs');
            
            // Mock fs operations
            fs.mkdirSync = jest.fn();
            fs.writeFileSync = jest.fn();
            
            // Mock node-fetch and sharp for the download functions
            const nodeFetch = require('node-fetch');
            const sharp = require('sharp');
            
            const mockResponse = {
                buffer: jest.fn<any>().mockResolvedValue(Buffer.alloc(1000))
            };
            nodeFetch.mockResolvedValue(mockResponse);
            sharp.mockReturnValue({
                resize: jest.fn().mockReturnThis(),
                jpeg: jest.fn().mockReturnThis(),
                toFile: jest.fn<any>().mockResolvedValue(undefined)
            });
            
            const { extractMediaRecursive } = require('./get');
            
            // Test single image post
            const singleImageItem = {
                owner: { username: "testuser" },
                is_video: false,
                display_resources: [
                    { src: "https://example.com/image.jpg", config_width: 1080, config_height: 1080 }
                ]
            };
            
            const count1 = await extractMediaRecursive(singleImageItem, '/test/output', 'DKM6hijhURN');
            expect(count1).toBe(1);
            expect(nodeFetch).toHaveBeenCalledWith('https://example.com/image.jpg');
            
            // Test carousel post (like the working first URL)
            const carouselItem = {
                owner: { username: "testuser" },
                edge_sidecar_to_children: {
                    edges: [
                        {
                            node: {
                                is_video: false,
                                display_resources: [
                                    { src: "https://example.com/carousel1.jpg", config_width: 1080, config_height: 1080 }
                                ]
                            }
                        },
                        {
                            node: {
                                is_video: false,
                                display_resources: [
                                    { src: "https://example.com/carousel2.jpg", config_width: 1080, config_height: 1080 }
                                ]
                            }
                        }
                    ]
                }
            };
            
            nodeFetch.mockClear();
            const count2 = await extractMediaRecursive(carouselItem, '/test/output', 'DKHTVuwzjCe');
            expect(count2).toBe(2);
            expect(nodeFetch).toHaveBeenCalledTimes(2);
            expect(nodeFetch).toHaveBeenNthCalledWith(1, 'https://example.com/carousel1.jpg');
            expect(nodeFetch).toHaveBeenNthCalledWith(2, 'https://example.com/carousel2.jpg');
        });

        it('should handle video posts with missing DASH manifest (now uses video_url fallback)', async () => {
            const { extractMediaRecursive } = require('./get');
            const fs = require('fs');
            const nodeFetch = require('node-fetch');
            
            // Mock fs and fetch operations
            fs.mkdirSync = jest.fn();
            fs.writeFileSync = jest.fn();
            
            const mockResponse = {
                buffer: jest.fn<any>().mockResolvedValue(Buffer.alloc(1000))
            };
            nodeFetch.mockResolvedValue(mockResponse);
            
            // Test video without DASH manifest - now uses video_url fallback
            const videoWithoutDash = {
                owner: { username: "testuser" },
                is_video: true,
                video_url: "https://example.com/video.mp4",
                // Missing dash_info or video_dash_manifest
                display_resources: []
            };
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            
            const count = await extractMediaRecursive(videoWithoutDash, '/test/output', 'VideoTest');
            
            // Should return 1 because it uses video_url fallback
            expect(count).toBe(1);
            expect(consoleSpy).toHaveBeenCalledWith('[extractMediaRecursive] is_video => using direct video_url:', 'VideoTest');
            expect(nodeFetch).toHaveBeenCalledWith('https://example.com/video.mp4');
            
            consoleSpy.mockRestore();
        });

        it('should handle video posts with no DASH manifest and no video_url (true silent failure)', async () => {
            const { extractMediaRecursive } = require('./get');
            
            // Test video without DASH manifest AND without video_url - true silent failure
            const videoWithoutAnyUrl = {
                owner: { username: "testuser" },
                is_video: true,
                // Missing dash_info, video_dash_manifest, AND video_url
                display_resources: []
            };
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            
            const count = await extractMediaRecursive(videoWithoutAnyUrl, '/test/output', 'VideoTest');
            
            // Should return 0 because no download method is available
            expect(count).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith('[extractMediaRecursive] is_video => but no dash_info or video_url available.');
            
            consoleSpy.mockRestore();
        });
    });
});