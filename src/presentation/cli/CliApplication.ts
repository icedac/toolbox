import { ICommand, CommandArgs } from './commands/ICommand';
import { Logger } from '../../shared/logging/Logger';
import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export class CliApplication {
    private commands: Map<string, ICommand> = new Map();
    private commandAliases: Map<string, string> = new Map();
    
    constructor(
        private logger: Logger,
        private appName: string = 'getany',
        private version: string = '1.0.0'
    ) {}
    
    /**
     * Register a command
     */
    registerCommand(command: ICommand): void {
        this.commands.set(command.name, command);
        
        // Register aliases
        if (command.aliases) {
            command.aliases.forEach(alias => {
                this.commandAliases.set(alias, command.name);
            });
        }
        
        this.logger.debug(`Registered command: ${command.name}`);
    }
    
    /**
     * Run the CLI application
     */
    async run(argv: string[] = process.argv): Promise<void> {
        const args = hideBin(argv);
        
        try {
            // Build yargs instance
            const yargsInstance = yargs(args)
                .scriptName(this.appName)
                .version(this.version)
                .help()
                .alias('h', 'help')
                .alias('v', 'version')
                .strict()
                .showHelpOnFail(true)
                .wrap(100);
            
            // Add commands
            this.commands.forEach((command, name) => {
                yargsInstance.command(
                    name,
                    command.description,
                    (yargs) => this.configureCommand(yargs, command),
                    async (argv) => await this.executeCommand(command, argv as any)
                );
                
                // Add aliases as separate commands
                if (command.aliases) {
                    command.aliases.forEach(alias => {
                        yargsInstance.command(
                            alias,
                            `Alias for '${name}'`,
                            (yargs) => this.configureCommand(yargs, command),
                            async (argv) => await this.executeCommand(command, argv as any)
                        );
                    });
                }
            });
            
            // Add default command for direct URL input
            yargsInstance.command(
                '$0 [urls..]',
                'Download media from URLs',
                (yargs) => {
                    return yargs
                        .positional('urls', {
                            describe: 'URLs to download',
                            type: 'string',
                            array: true
                        })
                        .options(this.getDefaultOptions());
                },
                async (argv) => await this.handleDefaultCommand(argv as any)
            );
            
            // Parse and execute
            await yargsInstance.parse();
            
        } catch (error: any) {
            this.logger.error('CLI error', error);
            console.error(`\n❌ ${error.message}`);
            process.exit(1);
        }
    }
    
    private configureCommand(yargs: yargs.Argv, command: ICommand): yargs.Argv {
        const options = command.getOptions();
        
        options.forEach(option => {
            const config: any = {
                describe: option.description,
                type: option.type,
                default: option.default,
                demandOption: option.required
            };
            
            if (option.choices) {
                config.choices = option.choices;
            }
            
            if (option.alias) {
                config.alias = option.alias;
            }
            
            yargs.option(option.name, config);
        });
        
        return yargs;
    }
    
    private async executeCommand(command: ICommand, argv: CommandArgs): Promise<void> {
        try {
            await command.execute(argv);
        } catch (error: any) {
            this.logger.error(`Command '${command.name}' failed`, error);
            throw error;
        }
    }
    
    private async handleDefaultCommand(argv: any): Promise<void> {
        // If URLs are provided, use download command
        if (argv.urls && argv.urls.length > 0) {
            const downloadCommand = this.commands.get('download');
            if (downloadCommand) {
                // Convert URLs to positional arguments
                const args: CommandArgs = {
                    _: argv.urls,
                    ...argv
                };
                delete args.urls;
                
                await this.executeCommand(downloadCommand, args);
            } else {
                throw new Error('Download command not registered');
            }
        } else {
            // Show help if no URLs
            yargs.showHelp();
        }
    }
    
    private getDefaultOptions(): Record<string, yargs.Options> {
        // Get options from download command if available
        const downloadCommand = this.commands.get('download');
        if (!downloadCommand) {
            return {};
        }
        
        const options: Record<string, yargs.Options> = {};
        
        downloadCommand.getOptions().forEach(option => {
            options[option.name] = {
                describe: option.description,
                type: option.type as any,
                default: option.default,
                alias: option.alias,
                choices: option.choices
            };
        });
        
        return options;
    }
    
    /**
     * Show help text
     */
    showHelp(): void {
        yargs.showHelp();
    }
    
    /**
     * Get registered commands
     */
    getCommands(): ICommand[] {
        return Array.from(this.commands.values());
    }
}