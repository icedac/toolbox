/**
 * User entity representing authenticated users
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly platform: Platform,
    public readonly authentication: AuthenticationInfo,
    public readonly createdAt: Date = new Date()
  ) {}

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authentication.isValid && 
           (!this.authentication.expiresAt || this.authentication.expiresAt > new Date());
  }

  /**
   * Get display name
   */
  getDisplayName(): string {
    return this.authentication.displayName || this.username;
  }
}

/**
 * Authentication information
 */
export interface AuthenticationInfo {
  isValid: boolean;
  method: AuthenticationMethod;
  token?: string;
  cookies?: Cookie[];
  sessionData?: Record<string, any>;
  expiresAt?: Date;
  displayName?: string;
  profilePicture?: string;
}

/**
 * Authentication methods
 */
export enum AuthenticationMethod {
  COOKIES = 'COOKIES',
  SESSION = 'SESSION',
  OAUTH = 'OAUTH',
  API_KEY = 'API_KEY',
  NONE = 'NONE'
}

/**
 * Cookie interface
 */
export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Platform-specific user session
 */
export class UserSession {
  constructor(
    public readonly userId: string,
    public readonly platform: Platform,
    public readonly sessionData: Record<string, any>,
    public readonly createdAt: Date = new Date(),
    public readonly expiresAt?: Date
  ) {}

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return this.expiresAt ? this.expiresAt < new Date() : false;
  }

  /**
   * Get session age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }
}

// Re-export Platform enum to avoid circular dependency
export { Platform } from './Media';