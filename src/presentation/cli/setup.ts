import { ICommand } from './commands/ICommand';
import { DownloadCommand } from './commands/DownloadCommand';
import { AuthCommand } from './commands/AuthCommand';
import { DownloadMediaUseCase } from '../../application/use-cases/DownloadMediaUseCase';
import { InstagramDownloader } from '../../infrastructure/downloaders/InstagramDownloader';
import { LocalFileStorage } from '../../infrastructure/storage/LocalFileStorage';
import { CookieAuthenticator } from '../../infrastructure/authentication/CookieAuthenticator';
import { HttpClient } from '../../infrastructure/http/HttpClient';
import { Logger, LoggerFactory } from '../../shared/logging/Logger';
import { Platform } from '../../domain/entities/Media';
import { IMediaDownloader } from '../../domain/interfaces/IMediaDownloader';
import { IAuthenticator } from '../../domain/interfaces/IAuthenticator';
import { AppConfig } from '../config/ConfigLoader';

export interface Dependencies {
    commands: ICommand[];
    downloaders: Map<Platform, IMediaDownloader>;
    authenticators: Map<Platform, IAuthenticator>;
}

/**
 * Set up all dependencies using manual dependency injection
 */
export async function setupDependencies(
    config: AppConfig,
    logger: Logger
): Promise<Dependencies> {
    // Create HTTP client
    const httpClient = new HttpClient(logger, {
        timeout: config.timeout,
        proxy: config.proxy
    });
    
    // Create storage
    const storage = new LocalFileStorage(
        logger,
        config.outputDir || 'output'
    );
    
    // Create authenticators
    const authenticators = new Map<Platform, IAuthenticator>();
    
    // Instagram authenticator
    const instagramAuth = new CookieAuthenticator(
        logger,
        Platform.INSTAGRAM,
        config.instagram?.sessionFile
    );
    authenticators.set(Platform.INSTAGRAM, instagramAuth);
    
    // Create downloaders
    const downloaders = new Map<Platform, IMediaDownloader>();
    
    // Instagram downloader
    const instagramDownloader = new InstagramDownloader(
        logger,
        {
            timeout: config.timeout,
            cookies: [] // Will be populated from authenticator
        }
    );
    downloaders.set(Platform.INSTAGRAM, instagramDownloader);
    
    // Create use cases
    const downloadUseCase = new DownloadMediaUseCase(
        downloaders,
        storage,
        logger
    );
    
    // Create commands
    const commands: ICommand[] = [
        new DownloadCommand(logger, downloadUseCase),
        new AuthCommand(logger, authenticators)
    ];
    
    return {
        commands,
        downloaders,
        authenticators
    };
}

/**
 * Create a simple service locator for runtime dependency resolution
 */
export class ServiceLocator {
    private static instance: ServiceLocator;
    private services: Map<string, any> = new Map();
    
    private constructor() {}
    
    static getInstance(): ServiceLocator {
        if (!ServiceLocator.instance) {
            ServiceLocator.instance = new ServiceLocator();
        }
        return ServiceLocator.instance;
    }
    
    register<T>(key: string, service: T): void {
        this.services.set(key, service);
    }
    
    get<T>(key: string): T {
        const service = this.services.get(key);
        if (!service) {
            throw new Error(`Service not found: ${key}`);
        }
        return service as T;
    }
    
    has(key: string): boolean {
        return this.services.has(key);
    }
    
    clear(): void {
        this.services.clear();
    }
}

// Service keys for type-safe access
export const ServiceKeys = {
    LOGGER: 'logger',
    CONFIG: 'config',
    HTTP_CLIENT: 'httpClient',
    STORAGE: 'storage',
    DOWNLOAD_USE_CASE: 'downloadUseCase',
    AUTHENTICATORS: 'authenticators',
    DOWNLOADERS: 'downloaders'
} as const;

/**
 * Initialize the service locator with all dependencies
 */
export async function initializeServices(config: AppConfig): Promise<ServiceLocator> {
    const locator = ServiceLocator.getInstance();
    locator.clear();
    
    // Register logger
    const logger = LoggerFactory.getLogger('App');
    locator.register(ServiceKeys.LOGGER, logger);
    locator.register(ServiceKeys.CONFIG, config);
    
    // Set up dependencies
    const deps = await setupDependencies(config, logger);
    
    // Register services
    locator.register(ServiceKeys.AUTHENTICATORS, deps.authenticators);
    locator.register(ServiceKeys.DOWNLOADERS, deps.downloaders);
    
    return locator;
}