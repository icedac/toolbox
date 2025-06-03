import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { glob } from 'glob';
import { 
    IFileStorage, 
    SaveOptions, 
    SaveProgress, 
    FileMetadata, 
    ListOptions, 
    FileInfo 
} from '../../domain/interfaces/IFileStorage';
import { DownloadedFile } from '../../domain/entities/DownloadResult';
import { Filename } from '../../domain/value-objects/Filename';
import { AppError } from '../../shared/errors/AppError';
import { Logger } from '../../shared/logging/Logger';

const pipelineAsync = promisify(pipeline);
const fsPromises = fs.promises;

export class LocalFileStorage implements IFileStorage {
    private baseDir: string;
    
    constructor(
        private logger: Logger,
        baseDir: string = 'output'
    ) {
        this.baseDir = path.resolve(baseDir);
        this.ensureBaseDirectory();
    }
    
    async save(
        filePath: string, 
        data: Buffer | NodeJS.ReadableStream, 
        options: SaveOptions = {}
    ): Promise<DownloadedFile> {
        const fullPath = this.resolvePath(filePath);
        const { 
            overwrite = false, 
            createDirectories = true, 
            permissions,
            progressCallback 
        } = options;
        
        try {
            // Check if file exists
            if (!overwrite && await this.exists(filePath)) {
                throw new AppError(`File already exists: ${filePath}`, 'FILE_EXISTS');
            }
            
            // Create directories if needed
            if (createDirectories) {
                await this.createDirectory(path.dirname(filePath));
            }
            
            // Save the file
            if (Buffer.isBuffer(data)) {
                await this.saveBuffer(fullPath, data, progressCallback);
            } else {
                await this.saveStream(fullPath, data, progressCallback);
            }
            
            // Set permissions if specified
            if (permissions) {
                await fsPromises.chmod(fullPath, permissions);
            }
            
            // Get file metadata
            const stats = await fsPromises.stat(fullPath);
            
            this.logger.info(`File saved: ${filePath} (${stats.size} bytes)`);
            
            return new DownloadedFile({
                filename: new Filename(path.basename(filePath)),
                path: filePath,
                size: stats.size,
                savedAt: new Date()
            });
            
        } catch (error: any) {
            this.logger.error(`Failed to save file: ${filePath}`, error);
            throw new AppError(
                `Failed to save file: ${error.message}`,
                'SAVE_FAILED'
            );
        }
    }
    
    async read(filePath: string): Promise<Buffer> {
        const fullPath = this.resolvePath(filePath);
        
        try {
            return await fsPromises.readFile(fullPath);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                throw new AppError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
            }
            throw new AppError(
                `Failed to read file: ${error.message}`,
                'READ_FAILED'
            );
        }
    }
    
    stream(filePath: string): NodeJS.ReadableStream {
        const fullPath = this.resolvePath(filePath);
        
        if (!fs.existsSync(fullPath)) {
            throw new AppError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
        }
        
        return fs.createReadStream(fullPath);
    }
    
    async exists(filePath: string): Promise<boolean> {
        const fullPath = this.resolvePath(filePath);
        
        try {
            await fsPromises.access(fullPath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }
    
    async delete(filePath: string): Promise<void> {
        const fullPath = this.resolvePath(filePath);
        
        try {
            await fsPromises.unlink(fullPath);
            this.logger.info(`File deleted: ${filePath}`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, consider it deleted
                return;
            }
            throw new AppError(
                `Failed to delete file: ${error.message}`,
                'DELETE_FAILED'
            );
        }
    }
    
    async getMetadata(filePath: string): Promise<FileMetadata> {
        const fullPath = this.resolvePath(filePath);
        
        try {
            const stats = await fsPromises.stat(fullPath);
            const mimeType = this.getMimeType(filePath);
            
            return {
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                mimeType,
                permissions: stats.mode.toString(8).slice(-3)
            };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                throw new AppError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
            }
            throw new AppError(
                `Failed to get metadata: ${error.message}`,
                'METADATA_FAILED'
            );
        }
    }
    
    async createDirectory(dirPath: string): Promise<void> {
        const fullPath = this.resolvePath(dirPath);
        
        try {
            await fsPromises.mkdir(fullPath, { recursive: true });
        } catch (error: any) {
            throw new AppError(
                `Failed to create directory: ${error.message}`,
                'CREATE_DIR_FAILED'
            );
        }
    }
    
    async list(directory: string, options: ListOptions = {}): Promise<FileInfo[]> {
        const fullPath = this.resolvePath(directory);
        const {
            recursive = false,
            pattern = '*',
            includeDirectories = false,
            sortBy = 'name',
            sortOrder = 'asc',
            limit
        } = options;
        
        try {
            let files: string[];
            
            if (recursive) {
                const globPattern = path.join(fullPath, '**', pattern);
                files = await glob(globPattern, { dot: true });
            } else {
                const globPattern = path.join(fullPath, pattern);
                files = await glob(globPattern, { dot: true });
            }
            
            // Get file info for each file
            const fileInfos: FileInfo[] = await Promise.all(
                files.map(async (file) => {
                    const stats = await fsPromises.stat(file);
                    
                    if (!includeDirectories && stats.isDirectory()) {
                        return null;
                    }
                    
                    return {
                        name: path.basename(file),
                        path: path.relative(this.baseDir, file),
                        size: stats.size,
                        isDirectory: stats.isDirectory(),
                        createdAt: stats.birthtime,
                        modifiedAt: stats.mtime
                    };
                })
            );
            
            // Filter out nulls
            let results = fileInfos.filter(info => info !== null) as FileInfo[];
            
            // Sort results
            results = this.sortFiles(results, sortBy, sortOrder);
            
            // Apply limit if specified
            if (limit && limit > 0) {
                results = results.slice(0, limit);
            }
            
            return results;
            
        } catch (error: any) {
            throw new AppError(
                `Failed to list directory: ${error.message}`,
                'LIST_FAILED'
            );
        }
    }
    
    async getAvailableSpace(): Promise<number> {
        // This is platform-specific and would require different implementations
        // For now, return a large number (100GB)
        return 100 * 1024 * 1024 * 1024;
    }
    
    private resolvePath(filePath: string): string {
        // Ensure the path is within the base directory
        const resolved = path.resolve(this.baseDir, filePath);
        
        if (!resolved.startsWith(this.baseDir)) {
            throw new AppError(
                'Path traversal attempt detected',
                'INVALID_PATH'
            );
        }
        
        return resolved;
    }
    
    private ensureBaseDirectory(): void {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
            this.logger.info(`Created base directory: ${this.baseDir}`);
        }
    }
    
    private async saveBuffer(
        fullPath: string, 
        buffer: Buffer,
        progressCallback?: (progress: SaveProgress) => void
    ): Promise<void> {
        const totalBytes = buffer.length;
        
        if (progressCallback) {
            progressCallback({
                totalBytes,
                savedBytes: 0,
                percentage: 0
            });
        }
        
        await fsPromises.writeFile(fullPath, buffer);
        
        if (progressCallback) {
            progressCallback({
                totalBytes,
                savedBytes: totalBytes,
                percentage: 100
            });
        }
    }
    
    private async saveStream(
        fullPath: string,
        stream: NodeJS.ReadableStream,
        progressCallback?: (progress: SaveProgress) => void
    ): Promise<void> {
        const writeStream = fs.createWriteStream(fullPath);
        let savedBytes = 0;
        
        if (progressCallback) {
            stream.on('data', (chunk) => {
                savedBytes += chunk.length;
                // Note: We don't know total size for streams
                progressCallback({
                    totalBytes: -1,
                    savedBytes,
                    percentage: -1
                });
            });
        }
        
        await pipelineAsync(stream, writeStream);
    }
    
    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.json': 'application/json',
            '.txt': 'text/plain'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }
    
    private sortFiles(
        files: FileInfo[], 
        sortBy: 'name' | 'size' | 'date',
        sortOrder: 'asc' | 'desc'
    ): FileInfo[] {
        const multiplier = sortOrder === 'asc' ? 1 : -1;
        
        return files.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name) * multiplier;
                case 'size':
                    return (a.size - b.size) * multiplier;
                case 'date':
                    return (a.modifiedAt.getTime() - b.modifiedAt.getTime()) * multiplier;
                default:
                    return 0;
            }
        });
    }
}