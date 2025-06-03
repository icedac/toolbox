import { cosmiconfigSync } from 'cosmiconfig';
import * as path from 'path';
import * as os from 'os';

/* --------------------- Configuration Types --------------------- */
export interface InstagramConfig {
    sessionFile?: string;
    cookiesFile?: string;
    quality?: 'high' | 'medium' | 'low';
}

export interface YouTubeConfig {
    format?: string;
    quality?: 'best' | 'high' | 'medium' | 'low';
}

export interface Config {
    // General settings
    outputDir?: string;
    quality?: 'high' | 'medium' | 'low';
    sizeThreshold?: string; // e.g., "10k", "1024"
    timeout?: number; // in seconds
    verbose?: boolean;
    
    // Platform-specific settings
    instagram?: InstagramConfig;
    youtube?: YouTubeConfig;
}

/* --------------------- Default Configuration --------------------- */
const defaultConfig: Config = {
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
};

/* --------------------- Configuration Loader --------------------- */
class ConfigLoader {
    private config: Config;
    private explorer;
    
    constructor() {
        this.explorer = cosmiconfigSync('getany', {
            searchPlaces: [
                'package.json',
                'getany.config.json',
                'getany.config.js',
                '.getanyrc.json',
                '.getanyrc.js',
                '.getanyrc',
            ],
            packageProp: 'getany'
        });
        
        this.config = this.loadConfig();
    }
    
    private loadConfig(): Config {
        // Load from current directory
        const localResult = this.explorer.search(process.cwd());
        
        // Load from home directory
        const homeDir = os.homedir();
        const homeResult = this.explorer.search(homeDir);
        
        // Merge configurations: defaults < home < local
        let config = { ...defaultConfig };
        
        if (homeResult && homeResult.config) {
            config = this.mergeConfig(config, homeResult.config);
        }
        
        if (localResult && localResult.config) {
            config = this.mergeConfig(config, localResult.config);
        }
        
        // Validate config
        this.validateConfig(config);
        
        return config;
    }
    
    private mergeConfig(base: Config, override: Partial<Config>): Config {
        const merged = { ...base };
        
        // Merge top-level properties
        if (override.outputDir !== undefined) merged.outputDir = override.outputDir;
        if (override.quality !== undefined) merged.quality = override.quality;
        if (override.sizeThreshold !== undefined) merged.sizeThreshold = override.sizeThreshold;
        if (override.timeout !== undefined) merged.timeout = override.timeout;
        if (override.verbose !== undefined) merged.verbose = override.verbose;
        
        // Merge Instagram config
        if (override.instagram) {
            merged.instagram = {
                ...base.instagram,
                ...override.instagram
            };
        }
        
        // Merge YouTube config
        if (override.youtube) {
            merged.youtube = {
                ...base.youtube,
                ...override.youtube
            };
        }
        
        return merged;
    }
    
    private validateConfig(config: Config): void {
        // Validate quality values
        const validQualities = ['high', 'medium', 'low'];
        if (config.quality && !validQualities.includes(config.quality)) {
            throw new Error(`Invalid quality value: ${config.quality}. Must be one of: ${validQualities.join(', ')}`);
        }
        
        // Validate timeout
        if (config.timeout !== undefined) {
            if (typeof config.timeout !== 'number' || config.timeout <= 0) {
                throw new Error('Timeout must be a positive number');
            }
        }
        
        // Validate sizeThreshold format
        if (config.sizeThreshold) {
            const match = config.sizeThreshold.match(/^(\d+)(k?)$/i);
            if (!match) {
                throw new Error('Invalid sizeThreshold format. Use a number or number followed by "k" (e.g., "1024" or "10k")');
            }
        }
        
        // Validate Instagram config
        if (config.instagram?.quality && !validQualities.includes(config.instagram.quality)) {
            throw new Error(`Invalid Instagram quality value: ${config.instagram.quality}`);
        }
        
        // Validate YouTube config
        const validYouTubeQualities = ['best', 'high', 'medium', 'low'];
        if (config.youtube?.quality && !validYouTubeQualities.includes(config.youtube.quality)) {
            throw new Error(`Invalid YouTube quality value: ${config.youtube.quality}`);
        }
    }
    
    /**
     * Get the loaded configuration
     */
    getConfig(): Config {
        return this.config;
    }
    
    /**
     * Override configuration with command-line arguments
     */
    applyCliOverrides(overrides: Partial<Config>): Config {
        return this.mergeConfig(this.config, overrides);
    }
    
    /**
     * Get a specific config value with type safety
     */
    get<K extends keyof Config>(key: K): Config[K] {
        return this.config[key];
    }
}

/* --------------------- Singleton Instance --------------------- */
let configLoaderInstance: ConfigLoader | null = null;

export function getConfigLoader(): ConfigLoader {
    if (!configLoaderInstance) {
        configLoaderInstance = new ConfigLoader();
    }
    return configLoaderInstance;
}

// Reset function for testing
export function resetConfigLoader(): void {
    configLoaderInstance = null;
}

/* --------------------- Convenience Functions --------------------- */
export function loadConfig(): Config {
    return getConfigLoader().getConfig();
}

export function getConfig<K extends keyof Config>(key: K): Config[K] {
    return getConfigLoader().get(key);
}