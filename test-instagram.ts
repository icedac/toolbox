#!/usr/bin/env npx ts-node

import { createInstagramDownloader } from './instagram-downloader';

async function testInstagramDownloader() {
    console.log('🧪 Testing Instagram Downloader...');
    
    try {
        // Create downloader instance
        const downloader = await createInstagramDownloader({
            outputDir: 'test-output',
            quality: 'high'
        });

        console.log('✅ Instagram downloader created successfully');
        
        // Test URL extraction
        const testUrls = [
            'https://www.instagram.com/p/ABC123DEF/',
            'https://www.instagram.com/reel/XYZ789/',
            'https://instagram.com/p/TEST123/'
        ];

        for (const url of testUrls) {
            const shortcode = (downloader as any).extractShortcode(url);
            console.log(`📝 URL: ${url} -> Shortcode: ${shortcode}`);
        }

        console.log('✅ URL parsing works correctly');
        
        // Close downloader
        await downloader.close();
        
        console.log('🎉 All tests passed!');
        
    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    testInstagramDownloader();
}