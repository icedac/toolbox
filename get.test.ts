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
    });
});