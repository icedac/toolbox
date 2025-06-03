import { Logger } from '../../../shared/logging/Logger';

/**
 * Base interface for CLI commands
 */
export interface ICommand {
    /**
     * Command name (e.g., 'download', 'auth')
     */
    name: string;
    
    /**
     * Command description for help text
     */
    description: string;
    
    /**
     * Command aliases (e.g., ['dl'] for 'download')
     */
    aliases?: string[];
    
    /**
     * Execute the command
     */
    execute(args: CommandArgs): Promise<void>;
    
    /**
     * Get command-specific options
     */
    getOptions(): CommandOption[];
}

/**
 * Command arguments passed from CLI
 */
export interface CommandArgs {
    /**
     * Positional arguments
     */
    _: string[];
    
    /**
     * Named options/flags
     */
    [key: string]: any;
}

/**
 * Command option definition
 */
export interface CommandOption {
    name: string;
    alias?: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    default?: any;
    required?: boolean;
    choices?: string[];
}

/**
 * Base command class with common functionality
 */
export abstract class BaseCommand implements ICommand {
    abstract name: string;
    abstract description: string;
    aliases?: string[];
    
    constructor(protected logger: Logger) {}
    
    abstract execute(args: CommandArgs): Promise<void>;
    
    abstract getOptions(): CommandOption[];
    
    /**
     * Validate command arguments
     */
    protected validateArgs(args: CommandArgs): void {
        const options = this.getOptions();
        
        for (const option of options) {
            if (option.required && !(option.name in args)) {
                throw new Error(`Missing required option: --${option.name}`);
            }
            
            if (option.choices && option.name in args) {
                const value = args[option.name];
                if (!option.choices.includes(value)) {
                    throw new Error(
                        `Invalid value for --${option.name}: ${value}. ` +
                        `Valid choices are: ${option.choices.join(', ')}`
                    );
                }
            }
        }
    }
    
    /**
     * Get option value with default
     */
    protected getOption<T>(args: CommandArgs, name: string): T | undefined {
        const option = this.getOptions().find(o => o.name === name);
        
        if (name in args) {
            return args[name] as T;
        }
        
        return option?.default as T;
    }
}