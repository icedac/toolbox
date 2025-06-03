// Mock for config module
export const mockConfig = {
    outputDir: 'output',
    quality: 'high',
    sizeThreshold: '10k',
    timeout: 10,
    verbose: false,
    instagram: {
        quality: 'high',
        sessionFile: '.instagram_session.json'
    },
    youtube: {
        quality: 'best'
    }
};

export class ConfigLoader {
    private config = mockConfig;
    
    getConfig() {
        return this.config;
    }
    
    applyCliOverrides(overrides: any) {
        return { ...this.config, ...overrides };
    }
    
    get(key: string) {
        return this.config[key as keyof typeof mockConfig];
    }
}

let instance: ConfigLoader | null = null;

export function getConfigLoader() {
    if (!instance) {
        instance = new ConfigLoader();
    }
    return instance;
}

export function resetConfigLoader() {
    instance = null;
}

export function loadConfig() {
    return getConfigLoader().getConfig();
}

export function getConfig(key: string) {
    return getConfigLoader().get(key);
}

export type Config = typeof mockConfig;
export type InstagramConfig = typeof mockConfig.instagram;
export type YouTubeConfig = typeof mockConfig.youtube;