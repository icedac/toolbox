# Instagram Downloader Guide

## Overview

The Instagram downloader supports downloading photos, videos, and carousel posts from Instagram. Due to Instagram's API changes in 2024, authentication is recommended for reliable access.

## Features

- **Multiple extraction strategies**: Automatically tries different methods to extract media data
- **Retry mechanism**: Built-in exponential backoff for handling temporary failures
- **Enhanced error reporting**: Clear, actionable error messages with troubleshooting tips
- **Fallback support**: Automatic fallback to browser-based extraction when API fails
- **Cookie authentication**: Support for browser cookie import for authenticated access

## Usage

### Basic Usage (Public Posts)

```bash
# Download a single post
node get.js https://www.instagram.com/p/SHORTCODE/

# With TypeScript
npm run dev https://www.instagram.com/p/SHORTCODE/
```

### Authenticated Access

For better reliability, especially with private accounts or to avoid rate limiting:

#### Method 1: Cookie File (Recommended)

1. Export cookies from your browser using a cookie export extension
2. Save as Netscape format (cookies.txt)
3. Set the environment variable:

```bash
export INSTAGRAM_COOKIES_FILE="/path/to/cookies.txt"
node get.js https://www.instagram.com/p/SHORTCODE/
```

#### Method 2: JSON Cookies

```bash
export INSTAGRAM_COOKIES_JSON='[{"name":"sessionid","value":"...","domain":".instagram.com"}]'
node get.js https://www.instagram.com/p/SHORTCODE/
```

#### Method 3: Base64 Encoded

```bash
# Encode your JSON cookies
echo '[{"name":"sessionid","value":"..."}]' | base64

# Use the encoded string
export INSTAGRAM_COOKIES_B64="WyB7Im5hbWU..."
node get.js https://www.instagram.com/p/SHORTCODE/
```

## Troubleshooting

### Common Issues

#### "Post not found" Error

This usually means:
- The post is private and requires authentication
- The post has been deleted
- Instagram is blocking unauthenticated requests

**Solution**: Use cookie authentication (see above)

#### Rate Limiting (429 Error)

Instagram limits API requests to prevent abuse.

**Solutions**:
1. Wait a few minutes before trying again
2. Use authentication to get higher rate limits
3. The tool will automatically retry with exponential backoff

#### "No media items found with owner information"

This indicates Instagram returned data in an unexpected format.

**Solutions**:
1. Try again later (Instagram may be testing new API formats)
2. Use authentication for more stable API responses
3. Report the issue if it persists

### Debug Mode

Enable verbose logging to see detailed information:

```bash
# Using environment variable
DEBUG=1 node get.js https://www.instagram.com/p/SHORTCODE/

# Or configure in getany.config.json
{
  "verbose": true
}
```

## Technical Details

### Extraction Strategies

The downloader tries multiple strategies in order:

1. **Direct API** (`?__a=1&__d=dis`): Fast but requires public post
2. **GraphQL parsing**: Extracts from various GraphQL response formats
3. **Browser automation**: Fallback using Puppeteer to load the page
4. **Alternative formats**: Handles different Instagram API response structures

### Retry Logic

- **Default**: 3 retry attempts with exponential backoff
- **Initial delay**: 1 second
- **Maximum delay**: 30 seconds
- **Backoff factor**: 2x (doubles each attempt)

### Cookie Requirements

Essential cookies for authentication:
- `sessionid`: Your Instagram session ID (required)
- `csrftoken`: CSRF protection token (recommended)
- `ds_user_id`: Your Instagram user ID (optional)

## Configuration

Add Instagram-specific settings to your `getany.config.json`:

```json
{
  "instagram": {
    "quality": "high",
    "sessionFile": ".instagram_session.json",
    "cookiesFile": "instagram_cookies.txt"
  }
}
```

## Best Practices

1. **Always use authentication** for private accounts or frequent downloads
2. **Respect rate limits** - avoid downloading too many posts at once
3. **Keep cookies updated** - Instagram sessions expire after some time
4. **Use local folders** for output to avoid permission issues
5. **Monitor Instagram's terms** - ensure your usage complies with their policies

## Known Limitations

- Instagram's API is constantly changing
- Some posts may require being logged in to the same account
- Geographical restrictions may apply
- Business/Creator accounts may have different API responses

## Security Notes

- Never share your session cookies publicly
- Store cookie files with restricted permissions (chmod 600)
- Consider using separate Instagram accounts for automation
- Cookies expire - you'll need to re-export periodically