import nodeFetch, { RequestInit, Response } from 'node-fetch';
import { Logger } from '../../shared/logging/Logger';
import { AppError } from '../../shared/errors/AppError';

export interface HttpClientConfig {
    baseUrl?: string;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    maxRetryDelay?: number;
    backoffFactor?: number;
    headers?: Record<string, string>;
}

export interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
    timeout?: number;
    retries?: number;
    retryCondition?: (response: Response) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
}

export interface HttpResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
}

export class HttpClient {
    private config: Required<HttpClientConfig>;
    
    constructor(
        private logger: Logger,
        config: HttpClientConfig = {}
    ) {
        this.config = {
            baseUrl: '',
            timeout: 30000,
            retries: 3,
            retryDelay: 1000,
            maxRetryDelay: 30000,
            backoffFactor: 2,
            headers: {},
            ...config
        };
    }
    
    async get<T = any>(url: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        return this.request<T>('GET', url, options);
    }
    
    async post<T = any>(url: string, data?: any, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        return this.request<T>('POST', url, {
            ...options,
            body: this.prepareBody(data, options)
        });
    }
    
    async put<T = any>(url: string, data?: any, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        return this.request<T>('PUT', url, {
            ...options,
            body: this.prepareBody(data, options)
        });
    }
    
    async delete<T = any>(url: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        return this.request<T>('DELETE', url, options);
    }
    
    async patch<T = any>(url: string, data?: any, options: RequestOptions = {}): Promise<HttpResponse<T>> {
        return this.request<T>('PATCH', url, {
            ...options,
            body: this.prepareBody(data, options)
        });
    }
    
    async head(url: string, options: RequestOptions = {}): Promise<HttpResponse<void>> {
        return this.request<void>('HEAD', url, options);
    }
    
    private async request<T>(
        method: string,
        url: string,
        options: RequestOptions = {}
    ): Promise<HttpResponse<T>> {
        const fullUrl = this.buildUrl(url, options.params);
        const controller = new AbortController();
        const timeout = options.timeout || this.config.timeout;
        const retries = options.retries ?? this.config.retries;
        
        const requestOptions: RequestInit = {
            method,
            ...options,
            headers: {
                ...this.config.headers,
                ...options.headers
            },
            signal: controller.signal
        };
        
        // Set timeout
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await this.executeWithRetry(
                fullUrl,
                requestOptions,
                retries,
                options.retryCondition,
                options.onRetry
            );
            
            clearTimeout(timeoutId);
            
            return await this.processResponse<T>(response);
            
        } catch (error: any) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new AppError(
                    `Request timeout after ${timeout}ms`,
                    'REQUEST_TIMEOUT'
                );
            }
            
            throw error;
        }
    }
    
    private async executeWithRetry(
        url: string,
        options: RequestInit,
        maxRetries: number,
        retryCondition?: (response: Response) => boolean,
        onRetry?: (error: Error, attempt: number) => void
    ): Promise<Response> {
        let lastError: Error | null = null;
        let delay = this.config.retryDelay;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                this.logger.debug(`HTTP ${options.method} ${url} (attempt ${attempt + 1})`);
                
                const response = await nodeFetch(url, options);
                
                // Check if we should retry based on custom condition
                if (retryCondition && !retryCondition(response) && attempt < maxRetries) {
                    throw new Error(`Retry condition not met: ${response.status}`);
                }
                
                // Default retry conditions
                if (this.shouldRetryResponse(response) && attempt < maxRetries) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
                
            } catch (error: any) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    this.logger.warn(
                        `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}): ${error.message}`
                    );
                    
                    if (onRetry) {
                        onRetry(error, attempt + 1);
                    }
                    
                    await this.sleep(delay);
                    
                    // Exponential backoff
                    delay = Math.min(
                        delay * this.config.backoffFactor,
                        this.config.maxRetryDelay
                    );
                }
            }
        }
        
        throw new AppError(
            `Request failed after ${maxRetries} retries: ${lastError?.message}`,
            'REQUEST_FAILED'
        );
    }
    
    private shouldRetryResponse(response: Response): boolean {
        // Retry on 5xx errors and specific 4xx errors
        return (
            response.status >= 500 ||
            response.status === 429 || // Too Many Requests
            response.status === 408 || // Request Timeout
            response.status === 423    // Locked (rate limited)
        );
    }
    
    private async processResponse<T>(response: Response): Promise<HttpResponse<T>> {
        const contentType = response.headers.get('content-type') || '';
        let data: any;
        
        try {
            if (contentType.includes('application/json')) {
                data = await response.json();
            } else if (contentType.includes('text/')) {
                data = await response.text();
            } else {
                data = await response.buffer();
            }
        } catch (error: any) {
            throw new AppError(
                `Failed to parse response: ${error.message}`,
                'PARSE_ERROR'
            );
        }
        
        // Convert headers to object
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        
        const httpResponse: HttpResponse<T> = {
            data: data as T,
            status: response.status,
            statusText: response.statusText,
            headers
        };
        
        // Throw error for non-2xx responses
        if (!response.ok) {
            const errorMessage = this.extractErrorMessage(data, response);
            throw new AppError(
                errorMessage,
                'HTTP_ERROR',
                httpResponse
            );
        }
        
        return httpResponse;
    }
    
    private buildUrl(url: string, params?: Record<string, string>): string {
        // Handle relative URLs
        const fullUrl = url.startsWith('http') 
            ? url 
            : `${this.config.baseUrl}${url}`;
            
        if (!params || Object.keys(params).length === 0) {
            return fullUrl;
        }
        
        const urlObj = new URL(fullUrl);
        Object.entries(params).forEach(([key, value]) => {
            urlObj.searchParams.append(key, value);
        });
        
        return urlObj.toString();
    }
    
    private prepareBody(data: any, options: RequestOptions): string | Buffer | undefined {
        if (!data) return undefined;
        
        const contentType = options.headers?.['content-type'] || 
                          options.headers?.['Content-Type'] || 
                          'application/json';
        
        if (Buffer.isBuffer(data)) {
            return data;
        }
        
        if (typeof data === 'string') {
            return data;
        }
        
        if (contentType.includes('application/json')) {
            return JSON.stringify(data);
        }
        
        if (contentType.includes('application/x-www-form-urlencoded')) {
            return new URLSearchParams(data).toString();
        }
        
        return String(data);
    }
    
    private extractErrorMessage(data: any, response: Response): string {
        // Try to extract error message from common API error formats
        if (typeof data === 'object' && data !== null) {
            return data.message || 
                   data.error || 
                   data.error_description || 
                   data.detail || 
                   response.statusText;
        }
        
        if (typeof data === 'string') {
            return data;
        }
        
        return response.statusText;
    }
    
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Create a new instance with updated configuration
     */
    withConfig(config: HttpClientConfig): HttpClient {
        return new HttpClient(this.logger, {
            ...this.config,
            ...config
        });
    }
    
    /**
     * Set default headers that will be included in all requests
     */
    setDefaultHeaders(headers: Record<string, string>): void {
        this.config.headers = {
            ...this.config.headers,
            ...headers
        };
    }
    
    /**
     * Get current configuration
     */
    getConfig(): Readonly<Required<HttpClientConfig>> {
        return { ...this.config };
    }
}