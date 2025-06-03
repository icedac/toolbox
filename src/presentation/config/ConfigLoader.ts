import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../../shared/logging/Logger';
import { AppError } from '../../shared/errors/AppError';

export interface AppConfig {
    outputDir?: string;
    quality?: 'high' | 'medium' | 'low' | 'best';
    sizeThreshold?: string;
    timeout?: number;
    verbose?: boolean;
    concurrent?: number;
    userAgent?: string;
    proxy?: string;
    
    instagram?: {
        quality?: string;
        sessionFile?: string;
        cookiesFile?: string;
        maxRetries?: number;
    };
    
    youtube?: {
        format?: string;
        quality?: string;
        audioOnly?: boolean;
    };
    
    twitter?: {
        quality?: string;
        includeReplies?: boolean;
    };
    
    storage?: {
        type?: 'local' | 's3' | 'gcs';
        basePath?: string;
        s3?: {
            bucket: string;
            region: string;
            accessKeyId?: string;
            secretAccessKey?: string;
        };
    };
    
    cache?: {
        enabled?: boolean;
        ttl?: number;
        maxSize?: number;
        directory?: string;
    };
}

export class ConfigLoader {
    private config: AppConfig = {};
    private configPaths: string[] = [
        'getany.config.json',
        'getany.config.js',
        '.getanyrc.json',
        '.getanyrc.js',
        '.getanyrc'
    ];
    
    constructor(private logger: Logger) {}
    
    /**
     * Load configuration from files and environment
     */
    async load(): Promise<AppConfig> {
        // Load from files (home dir first, then current dir)
        const homeConfig = await this.loadFromDirectory(os.homedir());
        const localConfig = await this.loadFromDirectory(process.cwd());
        
        // Load from package.json
        const packageConfig = await this.loadFromPackageJson();
        
        // Load from environment variables
        const envConfig = this.loadFromEnvironment();
        
        // Merge configurations (later overrides earlier)
        this.config = this.mergeConfigs(
            this.getDefaults(),
            homeConfig,
            packageConfig,
            localConfig,
            envConfig
        );
        
        // Validate configuration
        this.validateConfig();
        
        this.logger.info('Configuration loaded', { 
            sources: this.getConfigSources() 
        });
        
        return this.config;
    }
    
    /**
     * Get current configuration
     */
    getConfig(): Readonly<AppConfig> {
        return { ...this.config };
    }
    
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<AppConfig>): void {
        this.config = this.mergeConfigs(this.config, updates);
        this.validateConfig();
    }
    
    /**
     * Save configuration to file
     */
    async saveConfig(filePath?: string): Promise<void> {
        const targetPath = filePath || path.join(process.cwd(), 'getany.config.json');
        
        try {
            const configToSave = this.stripDefaults(this.config);
            const content = JSON.stringify(configToSave, null, 2);
            
            await fs.promises.writeFile(targetPath, content, 'utf-8');
            this.logger.info(`Configuration saved to ${targetPath}`);
            
        } catch (error: any) {
            throw new AppError(
                `Failed to save configuration: ${error.message}`,
                'CONFIG_SAVE_FAILED'
            );
        }
    }
    
    private async loadFromDirectory(dir: string): Promise<AppConfig> {
        for (const filename of this.configPaths) {
            const filePath = path.join(dir, filename);
            
            if (fs.existsSync(filePath)) {
                try {
                    const config = await this.loadConfigFile(filePath);
                    this.logger.debug(`Loaded config from ${filePath}`);
                    return config;
                } catch (error: any) {
                    this.logger.warn(`Failed to load config from ${filePath}: ${error.message}`);
                }
            }
        }
        
        return {};
    }
    
    private async loadConfigFile(filePath: string): Promise<AppConfig> {
        const ext = path.extname(filePath);
        
        if (ext === '.js') {
            // Load JavaScript config
            delete require.cache[require.resolve(filePath)];
            return require(filePath);
        } else {
            // Load JSON config
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
    }
    
    private async loadFromPackageJson(): Promise<AppConfig> {
        const packagePath = path.join(process.cwd(), 'package.json');
        
        if (fs.existsSync(packagePath)) {
            try {
                const content = await fs.promises.readFile(packagePath, 'utf-8');
                const packageData = JSON.parse(content);
                return packageData.getany || {};
            } catch (error: any) {
                this.logger.debug(`Failed to load config from package.json: ${error.message}`);
            }
        }
        
        return {};
    }
    
    private loadFromEnvironment(): AppConfig {
        const config: AppConfig = {};
        
        // General settings
        if (process.env.GETANY_OUTPUT_DIR) {
            config.outputDir = process.env.GETANY_OUTPUT_DIR;
        }
        if (process.env.GETANY_QUALITY) {
            config.quality = process.env.GETANY_QUALITY as any;
        }
        if (process.env.GETANY_VERBOSE) {
            config.verbose = process.env.GETANY_VERBOSE === 'true';
        }
        if (process.env.GETANY_PROXY) {
            config.proxy = process.env.GETANY_PROXY;
        }
        
        // Instagram settings
        if (process.env.INSTAGRAM_COOKIES_FILE || process.env.INSTAGRAM_SESSION_FILE) {
            config.instagram = {
                cookiesFile: process.env.INSTAGRAM_COOKIES_FILE,
                sessionFile: process.env.INSTAGRAM_SESSION_FILE
            };
        }
        
        return config;
    }
    
    private mergeConfigs(...configs: AppConfig[]): AppConfig {
        const result: AppConfig = {};
        
        for (const config of configs) {
            Object.keys(config).forEach(key => {
                const value = (config as any)[key];
                
                if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                    // Deep merge objects
                    (result as any)[key] = {
                        ...(result as any)[key] || {},
                        ...value
                    };
                } else {
                    // Direct assignment
                    (result as any)[key] = value;
                }
            });
        }
        
        return result;
    }
    
    private validateConfig(): void {
        const { quality, outputDir, sizeThreshold } = this.config;
        
        // Validate quality
        if (quality && !['high', 'medium', 'low', 'best'].includes(quality)) {
            throw new AppError(
                `Invalid quality value: ${quality}`,
                'INVALID_CONFIG'
            );
        }
        
        // Validate output directory
        if (outputDir && !path.isAbsolute(outputDir)) {
            // Convert to absolute path
            this.config.outputDir = path.resolve(outputDir);
        }
        
        // Validate size threshold
        if (sizeThreshold && !/^\d+[kmg]?$/i.test(sizeThreshold)) {
            throw new AppError(
                `Invalid size threshold format: ${sizeThreshold}`,
                'INVALID_CONFIG'
            );
        }
    }
    
    private getDefaults(): AppConfig {
        return {
            outputDir: 'output',
            quality: 'high',
            sizeThreshold: '10k',
            timeout: 30000,
            verbose: false,
            concurrent: 3,
            cache: {
                enabled: true,
                ttl: 3600,
                directory: '.cache'
            }
        };
    }
    
    private stripDefaults(config: AppConfig): AppConfig {
        const defaults = this.getDefaults();
        const result: AppConfig = {};
        
        Object.keys(config).forEach(key => {
            const value = (config as any)[key];
            const defaultValue = (defaults as any)[key];
            
            if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
                (result as any)[key] = value;
            }
        });
        
        return result;
    }
    
    private getConfigSources(): string[] {
        const sources: string[] = [];
        
        // Check which config files exist
        const homeDir = os.homedir();
        const cwd = process.cwd();
        
        this.configPaths.forEach(filename => {
            if (fs.existsSync(path.join(homeDir, filename))) {
                sources.push(`~/${filename}`);
            }
            if (fs.existsSync(path.join(cwd, filename))) {
                sources.push(`./${filename}`);
            }
        });
        
        if (fs.existsSync(path.join(cwd, 'package.json'))) {
            sources.push('./package.json');
        }
        
        if (Object.keys(this.loadFromEnvironment()).length > 0) {
            sources.push('environment');
        }
        
        return sources;
    }
}