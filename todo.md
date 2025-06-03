# TODO List - getany Project

Based on PRD.md requirements and current codebase analysis.

## High Priority

### 1. Improve Instagram downloader implementation
- Replace current Puppeteer-based approach with instagram-private-api library
- Better reliability and less brittle than browser automation
- Maintain existing cookie authentication support
- Status: Pending

### 2. Add comprehensive test coverage
- Create tests for Instagram downloader functionality
- Test YouTube audio extraction
- Mock external dependencies (Puppeteer, ffmpeg)
- Add integration tests for end-to-end workflows
- Status: Pending

## Medium Priority

### 3. Add configuration file support
- Implement getany.config.json auto-loading
- Support user home directory configuration
- Allow default output paths, quality settings, etc.
- Status: Pending

### 4. Refactor codebase structure
- Organize code according to proposed folder structure:
  - src/core/ (interfaces, parser, storage, utils)
  - src/platforms/ (youtube, twitter, instagram)
  - src/cli/ (index.ts, commands)
- Move current get.ts logic into structured modules
- Status: Pending

### 5. Implement caching system
- Prevent duplicate downloads
- Cache video/post metadata
- Implement smart cache invalidation
- Status: Pending

### 6. Add progress tracking for YouTube downloader
- Parse subprocess stdout for progress information
- Display real-time download progress
- Status: Pending

### 7. Implement Twitter scraping
- Research best approach (puppeteer vs snscrape vs nitter)
- Implement Twitter media extraction
- Handle rate limiting and authentication
- Status: Pending

## Low Priority

### 8. Create Express-based web UI
- Build web interface for download management
- Implement download queue system
- Add real-time progress display
- Status: Pending

## Development Infrastructure

### Testing Setup Improvements
- Configure Jest for better TypeScript support
- Add test utilities for mocking external services
- Set up CI/CD pipeline for automated testing

### Documentation
- Create comprehensive README with usage examples
- Document authentication setup procedures
- Add troubleshooting guide for common issues

## Technical Debt

### Code Quality
- Add ESLint configuration
- Implement stricter TypeScript settings
- Remove unused code and dependencies
- Improve error handling throughout codebase