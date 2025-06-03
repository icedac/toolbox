import * as fs from 'fs';
import * as path from 'path';
import { 
    IAuthenticator, 
    AuthCredentials, 
    CookieCredentials,
    AuthResult, 
    AuthError,
    AuthErrorCode 
} from '../../domain/interfaces/IAuthenticator';
import { User, Cookie, AuthenticationMethod, Platform } from '../../domain/entities/User';
import { AppError } from '../../shared/errors/AppError';
import { Logger } from '../../shared/logging/Logger';

export class CookieAuthenticator implements IAuthenticator {
    private cookies: Cookie[] = [];
    private platform: Platform;
    private storageFile?: string;
    
    constructor(
        private logger: Logger,
        platform: Platform,
        storageFile?: string
    ) {
        this.platform = platform;
        this.storageFile = storageFile;
    }
    
    async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
        if (credentials.type !== 'cookies') {
            return {
                success: false,
                error: {
                    code: AuthErrorCode.INVALID_CREDENTIALS,
                    message: 'CookieAuthenticator requires cookie credentials'
                }
            };
        }
        
        const cookieCredentials = credentials as CookieCredentials;
        
        try {
            // Load cookies from various sources
            if (cookieCredentials.cookieFile) {
                this.cookies = await this.loadCookiesFromFile(cookieCredentials.cookieFile);
            } else if (typeof cookieCredentials.cookies === 'string') {
                this.cookies = this.parseCookieString(cookieCredentials.cookies);
            } else if (Array.isArray(cookieCredentials.cookies)) {
                this.cookies = cookieCredentials.cookies;
            }
            
            // Validate cookies
            if (!this.validateCookies()) {
                return {
                    success: false,
                    error: {
                        code: AuthErrorCode.INVALID_CREDENTIALS,
                        message: 'Invalid or insufficient cookies provided'
                    }
                };
            }
            
            // Save cookies if storage file is specified
            if (this.storageFile) {
                await this.saveCookies();
            }
            
            // Create user from cookies
            const user = await this.createUserFromCookies();
            
            this.logger.info(`Successfully authenticated with cookies for ${this.platform}`);
            
            return {
                success: true,
                user,
                expiresAt: this.getEarliestExpiry()
            };
            
        } catch (error: any) {
            this.logger.error('Cookie authentication failed', error);
            
            return {
                success: false,
                error: {
                    code: AuthErrorCode.UNKNOWN_ERROR,
                    message: error.message
                }
            };
        }
    }
    
    async verify(): Promise<boolean> {
        if (this.cookies.length === 0) {
            // Try to load from storage
            if (this.storageFile) {
                try {
                    await this.loadCookies();
                } catch {
                    return false;
                }
            }
        }
        
        // Check if we have required cookies
        if (!this.validateCookies()) {
            return false;
        }
        
        // Check if cookies are expired
        const expiry = this.getEarliestExpiry();
        if (expiry && expiry < new Date()) {
            return false;
        }
        
        return true;
    }
    
    async logout(): Promise<void> {
        this.cookies = [];
        
        // Delete stored cookies
        if (this.storageFile && fs.existsSync(this.storageFile)) {
            await fs.promises.unlink(this.storageFile);
            this.logger.info('Deleted stored cookies');
        }
    }
    
    async getCurrentUser(): Promise<User | null> {
        if (!await this.verify()) {
            return null;
        }
        
        return this.createUserFromCookies();
    }
    
    getMethod(): AuthenticationMethod {
        return AuthenticationMethod.COOKIES;
    }
    
    /**
     * Get cookies for use in requests
     */
    getCookies(): Cookie[] {
        return [...this.cookies];
    }
    
    /**
     * Get cookie string for HTTP headers
     */
    getCookieString(): string {
        return this.cookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');
    }
    
    private async loadCookiesFromFile(filePath: string): Promise<Cookie[]> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            
            // Detect format and parse accordingly
            if (content.includes('\t')) {
                // Netscape format
                return this.parseNetscapeCookies(content);
            } else if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
                // JSON format
                return JSON.parse(content);
            } else {
                // Try cookie string format
                return this.parseCookieString(content);
            }
        } catch (error: any) {
            throw new AppError(
                `Failed to load cookies from file: ${error.message}`,
                'COOKIE_LOAD_FAILED'
            );
        }
    }
    
    private parseNetscapeCookies(content: string): Cookie[] {
        const cookies: Cookie[] = [];
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            const parts = trimmed.split('\t');
            if (parts.length >= 7) {
                cookies.push({
                    name: parts[5],
                    value: parts[6],
                    domain: parts[0],
                    path: parts[2],
                    httpOnly: parts[1] === 'TRUE',
                    secure: parts[3] === 'TRUE',
                    expires: parts[4] !== '0' ? new Date(parseInt(parts[4]) * 1000) : undefined,
                    sameSite: 'Lax'
                });
            }
        }
        
        return cookies;
    }
    
    private parseCookieString(cookieString: string): Cookie[] {
        const cookies: Cookie[] = [];
        const pairs = cookieString.split(/;\s*/);
        
        for (const pair of pairs) {
            const [name, value] = pair.split('=');
            if (name && value) {
                cookies.push({
                    name: name.trim(),
                    value: value.trim(),
                    domain: this.getDefaultDomain(),
                    path: '/',
                    secure: true,
                    sameSite: 'Lax'
                });
            }
        }
        
        return cookies;
    }
    
    private validateCookies(): boolean {
        // Platform-specific validation
        switch (this.platform) {
            case Platform.INSTAGRAM:
                return this.cookies.some(c => c.name === 'sessionid');
                
            case Platform.TWITTER:
                return this.cookies.some(c => c.name === 'auth_token');
                
            default:
                // Basic validation - at least one cookie
                return this.cookies.length > 0;
        }
    }
    
    private async createUserFromCookies(): Promise<User> {
        // Extract user information from cookies
        let userId = 'unknown';
        let username = 'unknown';
        
        switch (this.platform) {
            case Platform.INSTAGRAM:
                const dsUserId = this.cookies.find(c => c.name === 'ds_user_id');
                if (dsUserId) userId = dsUserId.value;
                
                // Username might be in sessionid or other cookies
                const sessionId = this.cookies.find(c => c.name === 'sessionid');
                if (sessionId) {
                    // Extract username from sessionid if possible
                    const parts = sessionId.value.split(':');
                    if (parts.length > 0) {
                        userId = parts[0];
                    }
                }
                break;
                
            case Platform.TWITTER:
                const authToken = this.cookies.find(c => c.name === 'auth_token');
                if (authToken) userId = authToken.value.substring(0, 10);
                break;
        }
        
        return new User(
            userId,
            username,
            this.platform,
            {
                isValid: true,
                method: AuthenticationMethod.COOKIES,
                cookies: this.cookies,
                expiresAt: this.getEarliestExpiry()
            }
        );
    }
    
    private getEarliestExpiry(): Date | undefined {
        const expiringCookies = this.cookies
            .filter(c => c.expires)
            .map(c => c.expires!);
            
        if (expiringCookies.length === 0) {
            return undefined;
        }
        
        return new Date(Math.min(...expiringCookies.map(d => d.getTime())));
    }
    
    private getDefaultDomain(): string {
        switch (this.platform) {
            case Platform.INSTAGRAM:
                return '.instagram.com';
            case Platform.TWITTER:
                return '.twitter.com';
            case Platform.YOUTUBE:
                return '.youtube.com';
            default:
                return '';
        }
    }
    
    private async saveCookies(): Promise<void> {
        if (!this.storageFile) return;
        
        try {
            const dir = path.dirname(this.storageFile);
            await fs.promises.mkdir(dir, { recursive: true });
            
            await fs.promises.writeFile(
                this.storageFile,
                JSON.stringify(this.cookies, null, 2),
                'utf-8'
            );
            
            this.logger.info(`Saved cookies to ${this.storageFile}`);
        } catch (error: any) {
            this.logger.warn(`Failed to save cookies: ${error.message}`);
        }
    }
    
    private async loadCookies(): Promise<void> {
        if (!this.storageFile || !fs.existsSync(this.storageFile)) {
            throw new AppError('No stored cookies found', 'NO_COOKIES');
        }
        
        const content = await fs.promises.readFile(this.storageFile, 'utf-8');
        this.cookies = JSON.parse(content);
    }
}