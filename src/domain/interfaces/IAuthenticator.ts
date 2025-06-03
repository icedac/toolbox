import { User, Cookie, AuthenticationMethod } from '../entities/User';

/**
 * Core interface for authentication handlers
 */
export interface IAuthenticator {
  /**
   * Authenticate with the platform
   */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;

  /**
   * Verify if current authentication is valid
   */
  verify(): Promise<boolean>;

  /**
   * Refresh authentication if supported
   */
  refresh?(): Promise<AuthResult>;

  /**
   * Logout and clear authentication
   */
  logout(): Promise<void>;

  /**
   * Get current authenticated user
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Get authentication method
   */
  getMethod(): AuthenticationMethod;
}

/**
 * Authentication credentials
 */
export type AuthCredentials = 
  | CookieCredentials
  | SessionCredentials
  | OAuthCredentials
  | ApiKeyCredentials;

/**
 * Cookie-based authentication
 */
export interface CookieCredentials {
  type: 'cookies';
  cookies: Cookie[] | string; // Array of cookies or cookie string
  cookieFile?: string; // Path to cookie file
}

/**
 * Session-based authentication
 */
export interface SessionCredentials {
  type: 'session';
  sessionFile: string; // Path to session file
  sessionData?: Record<string, any>;
}

/**
 * OAuth authentication
 */
export interface OAuthCredentials {
  type: 'oauth';
  clientId: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  redirectUri?: string;
}

/**
 * API key authentication
 */
export interface ApiKeyCredentials {
  type: 'api_key';
  apiKey: string;
  apiSecret?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: User;
  error?: AuthError;
  expiresAt?: Date;
  needsRefresh?: boolean;
}

/**
 * Authentication error
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: any;
}

/**
 * Authentication error codes
 */
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}