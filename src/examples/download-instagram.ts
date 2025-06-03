/**
 * Example: Download Instagram media using the clean architecture
 * 
 * This example demonstrates how to use the new architecture
 * programmatically without the CLI.
 */

import { DownloadMediaUseCase } from '../application/use-cases/DownloadMediaUseCase';
import { InstagramDownloader } from '../infrastructure/downloaders/InstagramDownloader';
import { LocalFileStorage } from '../infrastructure/storage/LocalFileStorage';
import { CookieAuthenticator } from '../infrastructure/authentication/CookieAuthenticator';
import { LoggerFactory } from '../shared/logging/Logger';
import { Platform } from '../domain/entities/Media';
import * as path from 'path';

async function main() {
    // 1. Set up logger
    const logger = LoggerFactory.getLogger('Example');
    
    // 2. Create infrastructure components
    const storage = new LocalFileStorage(logger, 'downloads');
    
    const instagramDownloader = new InstagramDownloader(logger, {
        timeout: 30000
    });
    
    // 3. Set up authentication (optional)
    const authenticator = new CookieAuthenticator(
        logger,
        Platform.INSTAGRAM,
        '.instagram_session.json'
    );
    
    // Try to authenticate with cookies if available
    if (process.env.INSTAGRAM_COOKIES_FILE) {
        const authResult = await authenticator.authenticate({
            type: 'cookies',
            cookieFile: process.env.INSTAGRAM_COOKIES_FILE
        });
        
        if (authResult.success) {
            console.log('✅ Authenticated successfully');
            // Pass cookies to downloader
            const cookies = authenticator.getCookies();
            // Update downloader config with cookies
        } else {
            console.log('⚠️  Authentication failed:', authResult.error?.message);
        }
    }
    
    // 4. Create use case
    const downloaders = new Map();
    downloaders.set(Platform.INSTAGRAM, instagramDownloader);
    
    const downloadUseCase = new DownloadMediaUseCase(
        downloaders,
        storage,
        logger
    );
    
    // 5. Download media
    const url = 'https://www.instagram.com/p/EXAMPLE/';
    
    console.log(`\n📥 Downloading from: ${url}\n`);
    
    const result = await downloadUseCase.execute({
        url,
        outputPath: 'instagram',
        quality: 'high',
        mediaType: 'any',
        sizeThreshold: 10 * 1024 // 10KB
    });
    
    // 6. Handle results
    if (result.success) {
        console.log(`\n✅ Download successful!`);
        console.log(`📁 Downloaded ${result.files.length} files:`);
        
        result.files.forEach(file => {
            console.log(`   - ${file.filename.value} (${formatBytes(file.size)})`);
        });
    } else {
        console.log(`\n❌ Download failed: ${result.error}`);
        
        if (result.details) {
            console.log('\nError details:', result.details);
        }
    }
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the example
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { main };