// Unit tests for core functionality
import { parseSizeThreshold, parseTimeout, parseOutputFolder } from './get';

describe('Core Functions Unit Tests', () => {
    describe('parseSizeThreshold', () => {
        test('should parse numeric strings', () => {
            expect(parseSizeThreshold('100')).toBe(100);
            expect(parseSizeThreshold('5000')).toBe(5000);
        });

        test('should parse kilobyte values', () => {
            expect(parseSizeThreshold('10k')).toBe(10240);
            expect(parseSizeThreshold('5K')).toBe(5120);
        });

        test('should return default for invalid input', () => {
            expect(parseSizeThreshold()).toBe(10240);
            expect(parseSizeThreshold('')).toBe(10240);
            expect(parseSizeThreshold('invalid')).toBe(10240);
        });
    });

    describe('parseTimeout', () => {
        test('should convert seconds to milliseconds', () => {
            expect(parseTimeout('5')).toBe(5000);
            expect(parseTimeout('30')).toBe(30000);
        });

        test('should return default for invalid input', () => {
            expect(parseTimeout()).toBe(10000);
            expect(parseTimeout('invalid')).toBe(10000);
        });
    });

    describe('parseOutputFolder', () => {
        test('should extract folder from URL', () => {
            expect(parseOutputFolder('https://example.com/folder')).toBe('folder');
            expect(parseOutputFolder('https://instagram.com/p/ABC123/')).toBe('ABC123');
        });

        test('should sanitize special characters', () => {
            expect(parseOutputFolder('https://example.com/test@123')).toBe('test123');
        });

        test('should return default for invalid URLs', () => {
            expect(parseOutputFolder('not-a-url')).toBe('output');
            expect(parseOutputFolder('https://example.com/')).toBe('output');
        });
    });
});