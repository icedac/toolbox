#!/usr/bin/env node

import { CliApplication } from './CliApplication';
import { ConfigLoader } from '../config/ConfigLoader';
import { LoggerFactory } from '../../shared/logging/Logger';
import { setupDependencies } from './setup';

async function main() {
    try {
        // Initialize logger
        const logger = LoggerFactory.getLogger('CLI');
        
        // Load configuration
        const configLoader = new ConfigLoader(logger);
        const config = await configLoader.load();
        
        // Set up dependencies
        const { commands } = await setupDependencies(config, logger);
        
        // Create and configure CLI application
        const app = new CliApplication(
            logger,
            'getany',
            process.env.npm_package_version || '1.0.0'
        );
        
        // Register commands
        commands.forEach(command => app.registerCommand(command));
        
        // Run the application
        await app.run();
        
    } catch (error: any) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { main };