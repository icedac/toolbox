import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getConfigLoader, loadConfig, getConfig } from './config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock cosmiconfig
jest.mock('cosmiconfig');

describe('Configuration Loader', () => {
    const mockExplorer = {
        search: jest.fn()
    };
    
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the singleton
        (global as any).configLoaderInstance = null;
        
        // Mock cosmiconfigSync to return our mock explorer
        const cosmiconfig = require('cosmiconfig');
        cosmiconfig.cosmiconfigSync = jest.fn(() => mockExplorer);
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Config Loading', () => {
        it('should load default config when no config files exist', () => {
            mockExplorer.search.mockReturnValue(null);
            
            const config = loadConfig();
            
            expect(config).toEqual({
                outputDir: 'output',
                quality: 'high',
                sizeThreshold: '10k',
                timeout: 10,
                verbose: false,
                instagram: {
                    quality: 'high',
                    sessionFile: '.instagram_session.json'
                },
                youtube: {
                    quality: 'best'
                }
            });
        });
        
        it('should load config from local directory', () => {
            mockExplorer.search
                .mockReturnValueOnce({
                    config: {
                        outputDir: 'downloads',
                        verbose: true
                    }
                })
                .mockReturnValueOnce(null); // home directory
            
            const config = loadConfig();
            
            expect(config.outputDir).toBe('downloads');
            expect(config.verbose).toBe(true);
            expect(config.quality).toBe('high'); // default
        });
        
        it('should merge home and local configs with correct precedence', () => {
            // First call for local directory
            mockExplorer.search
                .mockReturnValueOnce({
                    config: {
                        outputDir: 'local-output',
                        quality: 'medium'
                    }
                })
                // Second call for home directory
                .mockReturnValueOnce({
                    config: {
                        outputDir: 'home-output',
                        timeout: 30,
                        verbose: true
                    }
                });
            
            const config = loadConfig();
            
            // Local should override home
            expect(config.outputDir).toBe('local-output');
            expect(config.quality).toBe('medium');
            // Home values not in local should be used
            expect(config.timeout).toBe(30);
            expect(config.verbose).toBe(true);
        });
    });
    
    describe('Config Validation', () => {
        it('should throw error for invalid quality value', () => {
            mockExplorer.search.mockReturnValueOnce({
                config: {
                    quality: 'invalid'
                }
            }).mockReturnValueOnce(null);
            
            expect(() => loadConfig()).toThrow('Invalid quality value: invalid');
        });
        
        it('should throw error for invalid timeout value', () => {
            mockExplorer.search.mockReturnValueOnce({
                config: {
                    timeout: -5
                }
            }).mockReturnValueOnce(null);
            
            expect(() => loadConfig()).toThrow('Timeout must be a positive number');
        });
        
        it('should throw error for invalid sizeThreshold format', () => {
            mockExplorer.search.mockReturnValueOnce({
                config: {
                    sizeThreshold: '10mb'
                }
            }).mockReturnValueOnce(null);
            
            expect(() => loadConfig()).toThrow('Invalid sizeThreshold format');
        });
    });
    
    describe('Platform-specific Config', () => {
        it('should merge Instagram config correctly', () => {
            mockExplorer.search
                .mockReturnValueOnce({
                    config: {
                        instagram: {
                            quality: 'low',
                            cookiesFile: '/path/to/cookies.txt'
                        }
                    }
                })
                .mockReturnValueOnce(null);
            
            const config = loadConfig();
            
            expect(config.instagram).toEqual({
                quality: 'low',
                sessionFile: '.instagram_session.json', // default
                cookiesFile: '/path/to/cookies.txt'
            });
        });
        
        it('should merge YouTube config correctly', () => {
            mockExplorer.search
                .mockReturnValueOnce({
                    config: {
                        youtube: {
                            format: 'mp4',
                            quality: 'high'
                        }
                    }
                })
                .mockReturnValueOnce(null);
            
            const config = loadConfig();
            
            expect(config.youtube).toEqual({
                format: 'mp4',
                quality: 'high'
            });
        });
    });
    
    describe('CLI Overrides', () => {
        it('should apply CLI overrides to config', () => {
            mockExplorer.search.mockReturnValue(null);
            
            const loader = getConfigLoader();
            const overriddenConfig = loader.applyCliOverrides({
                outputDir: 'cli-output',
                verbose: true
            });
            
            expect(overriddenConfig.outputDir).toBe('cli-output');
            expect(overriddenConfig.verbose).toBe(true);
            expect(overriddenConfig.quality).toBe('high'); // unchanged
        });
    });
    
    describe('Config Getter', () => {
        it('should get specific config values', () => {
            mockExplorer.search.mockReturnValue({
                config: {
                    outputDir: 'test-output',
                    verbose: true
                }
            });
            
            expect(getConfig('outputDir')).toBe('test-output');
            expect(getConfig('verbose')).toBe(true);
            expect(getConfig('quality')).toBe('high'); // default
        });
    });
});