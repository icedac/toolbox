// Mock for instagram-downloader module
export const createInstagramDownloader = jest.fn().mockReturnValue({
    initialize: jest.fn().mockResolvedValue(true),
    downloadFromUrl: jest.fn().mockResolvedValue({
        success: true,
        files: ['output/test.jpg'],
        error: null
    }),
    close: jest.fn().mockResolvedValue(undefined)
});

export class InstagramDownloader {
    constructor(config?: any) {}
    
    async initialize(): Promise<boolean> {
        return true;
    }
    
    async downloadFromUrl(url: string): Promise<any> {
        return {
            success: true,
            files: ['output/test.jpg'],
            error: null
        };
    }
    
    async close(): Promise<void> {
        return;
    }
}