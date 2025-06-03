import { BaseCommand, CommandArgs, CommandOption } from './ICommand';
import { DownloadMediaUseCase } from '../../../application/use-cases/DownloadMediaUseCase';
import { Logger } from '../../../shared/logging/Logger';
import { AppError } from '../../../shared/errors/AppError';
import * as path from 'path';

export class DownloadCommand extends BaseCommand {
    name = 'download';
    description = 'Download media from supported platforms';
    aliases = ['dl', 'd'];
    
    constructor(
        logger: Logger,
        private downloadUseCase: DownloadMediaUseCase
    ) {
        super(logger);
    }
    
    async execute(args: CommandArgs): Promise<void> {
        try {
            this.validateArgs(args);
            
            const urls = args._;
            if (urls.length === 0) {
                throw new Error('No URLs provided. Usage: getany download <url1> [url2] ...');
            }
            
            // Get options
            const outputDir = this.getOption<string>(args, 'output') || 'output';
            const quality = this.getOption<string>(args, 'quality') || 'high';
            const mediaType = this.getOption<string>(args, 'type') || 'any';
            const sizeThreshold = this.getOption<string>(args, 'size') || '10k';
            const concurrent = this.getOption<number>(args, 'concurrent') || 3;
            const cookies = this.getOption<string>(args, 'cookies');
            const verbose = this.getOption<boolean>(args, 'verbose') || false;
            
            if (verbose) {
                this.logger.setLevel('debug');
            }
            
            // Process URLs
            const results = await this.processUrls(urls, {
                outputDir,
                quality,
                mediaType,
                sizeThreshold,
                concurrent,
                cookies
            });
            
            // Summary
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            console.log('\n📊 Download Summary:');
            console.log(`✅ Successful: ${successful}`);
            if (failed > 0) {
                console.log(`❌ Failed: ${failed}`);
            }
            
        } catch (error: any) {
            this.logger.error('Download command failed', error);
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    }
    
    getOptions(): CommandOption[] {
        return [
            {
                name: 'output',
                alias: 'o',
                description: 'Output directory',
                type: 'string',
                default: 'output'
            },
            {
                name: 'quality',
                alias: 'q',
                description: 'Download quality',
                type: 'string',
                default: 'high',
                choices: ['high', 'medium', 'low', 'best']
            },
            {
                name: 'type',
                alias: 't',
                description: 'Media type filter',
                type: 'string',
                default: 'any',
                choices: ['any', 'video', 'image', 'audio']
            },
            {
                name: 'size',
                alias: 's',
                description: 'Minimum file size (e.g., 100k, 1m)',
                type: 'string',
                default: '10k'
            },
            {
                name: 'concurrent',
                alias: 'c',
                description: 'Number of concurrent downloads',
                type: 'number',
                default: 3
            },
            {
                name: 'cookies',
                description: 'Path to cookies file for authentication',
                type: 'string'
            },
            {
                name: 'verbose',
                alias: 'v',
                description: 'Enable verbose logging',
                type: 'boolean',
                default: false
            },
            {
                name: 'no-cache',
                description: 'Disable cache',
                type: 'boolean',
                default: false
            },
            {
                name: 'proxy',
                description: 'HTTP proxy URL',
                type: 'string'
            }
        ];
    }
    
    private async processUrls(
        urls: string[], 
        options: any
    ): Promise<Array<{ url: string; success: boolean; error?: string }>> {
        const results: Array<{ url: string; success: boolean; error?: string }> = [];
        
        // Process in batches
        const batchSize = options.concurrent;
        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            const batchPromises = batch.map(url => this.processUrl(url, options));
            const batchResults = await Promise.allSettled(batchPromises);
            
            batchResults.forEach((result, index) => {
                const url = batch[index];
                if (result.status === 'fulfilled') {
                    results.push({ url, success: result.value });
                } else {
                    results.push({ 
                        url, 
                        success: false, 
                        error: result.reason?.message || 'Unknown error' 
                    });
                }
            });
        }
        
        return results;
    }
    
    private async processUrl(url: string, options: any): Promise<boolean> {
        try {
            console.log(`\n🔍 Processing: ${url}`);
            
            const result = await this.downloadUseCase.execute({
                url,
                outputPath: path.join(options.outputDir),
                quality: options.quality,
                mediaType: options.mediaType,
                sizeThreshold: this.parseSizeThreshold(options.sizeThreshold),
                cookies: options.cookies ? await this.loadCookies(options.cookies) : undefined,
                useCache: !options['no-cache'],
                proxy: options.proxy
            });
            
            if (result.success) {
                console.log(`✅ Downloaded ${result.files.length} files`);
                result.files.forEach(file => {
                    console.log(`   📁 ${file.filename.value} (${this.formatSize(file.size)})`);
                });
                return true;
            } else {
                console.log(`❌ Failed: ${result.error || 'Unknown error'}`);
                return false;
            }
            
        } catch (error: any) {
            console.log(`❌ Error: ${error.message}`);
            this.logger.error(`Failed to process ${url}`, error);
            return false;
        }
    }
    
    private parseSizeThreshold(input: string): number {
        const match = input.match(/^(\d+)([kmg]?)$/i);
        if (!match) {
            throw new Error(`Invalid size format: ${input}. Use format like '100k', '1m', '2g'`);
        }
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        switch (unit) {
            case 'k': return value * 1024;
            case 'm': return value * 1024 * 1024;
            case 'g': return value * 1024 * 1024 * 1024;
            default: return value;
        }
    }
    
    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    
    private async loadCookies(cookiePath: string): Promise<any[]> {
        // This would be implemented to load cookies from file
        // For now, return empty array
        this.logger.warn('Cookie loading not yet implemented');
        return [];
    }
}