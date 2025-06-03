# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run dev` - Run TypeScript directly with ts-node
- `npm run clean` - Remove build outputs and coverage

### Testing
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode  
- `npm run test:coverage` - Generate test coverage report

### Configuration
- Create `getany.config.json` for custom defaults
- See `docs/CONFIG.md` for configuration options
- Example config in `getany.config.example.json`

## Project Architecture

This is a multi-tool collection for web scraping and media extraction, primarily focused on Instagram content downloading.

### Core Structure
- **get.ts** - Main CLI tool for media extraction with Puppeteer-based scraping
- **youtube_audio.py** - Standalone Python script for YouTube audio extraction using yt-dlp
- **dist/** - Compiled JavaScript output (get.js is the CLI entry point)

### Key Components

#### Instagram Downloader (get.ts)
- Uses Puppeteer for browser automation and request interception
- Supports cookie-based authentication via environment variables
- Handles DASH video manifests for high-quality video/audio extraction  
- Extracts carousel posts (multiple media items)
- Downloads highest resolution images from display_resources

#### Authentication Methods
Instagram authentication uses cookies set via environment variables:
- `INSTAGRAM_COOKIES_FILE` - Path to Netscape cookies.txt file
- `INSTAGRAM_COOKIES_JSON` - JSON array of cookie objects
- `INSTAGRAM_COOKIES_B64` - Base64 encoded cookie JSON

#### Media Processing
- ffmpeg integration for video/audio merging
- Image dimension filtering (minimum 161x161)
- Size-based filtering with configurable thresholds
- Automatic folder organization by username

### Technology Stack
- **TypeScript** - Main language with strict typing enabled
- **Puppeteer** - Browser automation for scraping
- **Jest** - Testing framework with ts-jest preset
- **Sharp** - Image processing
- **xml2js** - DASH manifest parsing
- **node-fetch** - HTTP requests
- **dotenv** - Environment configuration

### Package Manager
Uses pnpm (specified in packageManager field) - ensure pnpm commands are used instead of npm when available.