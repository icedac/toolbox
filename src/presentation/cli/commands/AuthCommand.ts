import { BaseCommand, CommandArgs, CommandOption } from './ICommand';
import { Logger } from '../../../shared/logging/Logger';
import { IAuthenticator } from '../../../domain/interfaces/IAuthenticator';
import { Platform } from '../../../domain/entities/Media';
import * as fs from 'fs';
import * as path from 'path';

export class AuthCommand extends BaseCommand {
    name = 'auth';
    description = 'Manage authentication for different platforms';
    aliases = ['login'];
    
    constructor(
        logger: Logger,
        private authenticators: Map<Platform, IAuthenticator>
    ) {
        super(logger);
    }
    
    async execute(args: CommandArgs): Promise<void> {
        try {
            this.validateArgs(args);
            
            const platform = this.getOption<string>(args, 'platform');
            const action = args._[0] || 'status';
            
            if (!platform) {
                throw new Error('Platform is required. Use --platform <instagram|twitter|youtube>');
            }
            
            const platformEnum = this.parsePlatform(platform);
            const authenticator = this.authenticators.get(platformEnum);
            
            if (!authenticator) {
                throw new Error(`No authenticator available for platform: ${platform}`);
            }
            
            switch (action) {
                case 'login':
                    await this.handleLogin(args, platformEnum, authenticator);
                    break;
                    
                case 'logout':
                    await this.handleLogout(platformEnum, authenticator);
                    break;
                    
                case 'status':
                    await this.handleStatus(platformEnum, authenticator);
                    break;
                    
                case 'verify':
                    await this.handleVerify(platformEnum, authenticator);
                    break;
                    
                default:
                    throw new Error(`Unknown action: ${action}. Use: login, logout, status, or verify`);
            }
            
        } catch (error: any) {
            this.logger.error('Auth command failed', error);
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    }
    
    getOptions(): CommandOption[] {
        return [
            {
                name: 'platform',
                alias: 'p',
                description: 'Platform to authenticate with',
                type: 'string',
                required: true,
                choices: ['instagram', 'twitter', 'youtube']
            },
            {
                name: 'cookies',
                alias: 'c',
                description: 'Path to cookies file (for login)',
                type: 'string'
            },
            {
                name: 'session',
                alias: 's',
                description: 'Path to session file (for login)',
                type: 'string'
            },
            {
                name: 'username',
                alias: 'u',
                description: 'Username (if supported by platform)',
                type: 'string'
            },
            {
                name: 'password',
                description: 'Password (if supported by platform)',
                type: 'string'
            },
            {
                name: 'save',
                description: 'Save credentials for future use',
                type: 'boolean',
                default: true
            }
        ];
    }
    
    private parsePlatform(platform: string): Platform {
        switch (platform.toLowerCase()) {
            case 'instagram':
                return Platform.INSTAGRAM;
            case 'twitter':
                return Platform.TWITTER;
            case 'youtube':
                return Platform.YOUTUBE;
            default:
                throw new Error(`Unknown platform: ${platform}`);
        }
    }
    
    private async handleLogin(
        args: CommandArgs, 
        platform: Platform, 
        authenticator: IAuthenticator
    ): Promise<void> {
        console.log(`\n🔐 Logging in to ${platform}...`);
        
        let credentials: any;
        
        if (args.cookies) {
            // Cookie-based auth
            const cookiesPath = path.resolve(args.cookies);
            if (!fs.existsSync(cookiesPath)) {
                throw new Error(`Cookies file not found: ${cookiesPath}`);
            }
            
            credentials = {
                type: 'cookies',
                cookieFile: cookiesPath
            };
            
        } else if (args.session) {
            // Session-based auth
            const sessionPath = path.resolve(args.session);
            if (!fs.existsSync(sessionPath)) {
                throw new Error(`Session file not found: ${sessionPath}`);
            }
            
            credentials = {
                type: 'session',
                sessionFile: sessionPath
            };
            
        } else if (args.username && args.password) {
            // Username/password auth
            throw new Error('Username/password authentication not yet implemented');
            
        } else {
            throw new Error(
                'No authentication method provided. ' +
                'Use --cookies <file> or --session <file>'
            );
        }
        
        const result = await authenticator.authenticate(credentials);
        
        if (result.success && result.user) {
            console.log(`✅ Successfully logged in as ${result.user.getDisplayName()}`);
            
            if (result.expiresAt) {
                console.log(`⏰ Authentication expires: ${result.expiresAt.toLocaleString()}`);
            }
            
            if (args.save) {
                console.log('💾 Credentials saved for future use');
            }
        } else {
            console.log(`❌ Login failed: ${result.error?.message || 'Unknown error'}`);
            process.exit(1);
        }
    }
    
    private async handleLogout(
        platform: Platform, 
        authenticator: IAuthenticator
    ): Promise<void> {
        console.log(`\n🚪 Logging out from ${platform}...`);
        
        await authenticator.logout();
        console.log('✅ Successfully logged out');
    }
    
    private async handleStatus(
        platform: Platform, 
        authenticator: IAuthenticator
    ): Promise<void> {
        console.log(`\n📊 Authentication status for ${platform}:`);
        
        const user = await authenticator.getCurrentUser();
        
        if (user && user.isAuthenticated()) {
            console.log(`✅ Authenticated as: ${user.getDisplayName()}`);
            console.log(`🔑 Method: ${user.authentication.method}`);
            
            if (user.authentication.expiresAt) {
                const remaining = user.authentication.expiresAt.getTime() - Date.now();
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const days = Math.floor(hours / 24);
                
                if (days > 0) {
                    console.log(`⏰ Expires in: ${days} days`);
                } else if (hours > 0) {
                    console.log(`⏰ Expires in: ${hours} hours`);
                } else {
                    console.log('⚠️  Authentication expires soon');
                }
            }
        } else {
            console.log('❌ Not authenticated');
        }
    }
    
    private async handleVerify(
        platform: Platform, 
        authenticator: IAuthenticator
    ): Promise<void> {
        console.log(`\n🔍 Verifying authentication for ${platform}...`);
        
        const isValid = await authenticator.verify();
        
        if (isValid) {
            console.log('✅ Authentication is valid');
        } else {
            console.log('❌ Authentication is invalid or expired');
            process.exit(1);
        }
    }
}