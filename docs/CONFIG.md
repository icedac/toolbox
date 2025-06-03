# Configuration Guide

The toolbox supports configuration files to customize default settings without needing to specify command-line arguments every time.

## Configuration File Locations

The tool searches for configuration files in the following order:
1. Current working directory
2. User home directory

Configuration files in the current directory override those in the home directory.

## Supported Configuration Files

- `getany.config.json` (recommended)
- `getany.config.js`
- `.getanyrc.json`
- `.getanyrc.js`
- `.getanyrc`
- `package.json` (under the `getany` key)

## Configuration Options

### General Settings

```json
{
  "outputDir": "downloads",      // Default output directory
  "quality": "high",            // Default quality: high, medium, low
  "sizeThreshold": "50k",       // Minimum file size (e.g., "1024", "50k")
  "timeout": 30,                // Default timeout in seconds
  "verbose": false              // Enable verbose logging
}
```

### Platform-Specific Settings

#### Instagram Configuration

```json
{
  "instagram": {
    "quality": "high",                    // Instagram-specific quality
    "sessionFile": ".instagram_session.json",  // Session persistence file
    "cookiesFile": "cookies.txt"         // Path to cookies file
  }
}
```

#### YouTube Configuration

```json
{
  "youtube": {
    "format": "mp4",     // Preferred format
    "quality": "best"    // Quality: best, high, medium, low
  }
}
```

## Complete Example

```json
{
  "outputDir": "downloads",
  "quality": "high",
  "sizeThreshold": "50k",
  "timeout": 30,
  "verbose": false,
  "instagram": {
    "quality": "high",
    "sessionFile": ".instagram_session.json",
    "cookiesFile": "cookies.txt"
  },
  "youtube": {
    "format": "mp4",
    "quality": "best"
  }
}
```

## Command-Line Override

Command-line arguments always override configuration file settings:

```bash
# Uses config file settings
node get.js https://example.com/video

# Overrides output directory from config
node get.js https://example.com/video --output custom-folder

# Overrides quality setting
node get.js https://example.com/video --quality medium

# Overrides verbose setting
node get.js https://example.com/video --verbose
```

## Environment-Specific Configuration

You can have different configurations for different environments:

1. Global defaults in `~/.getanyrc.json`
2. Project-specific settings in `./getany.config.json`
3. Command-line overrides for one-off changes

## Configuration Precedence

Settings are applied in this order (later overrides earlier):
1. Built-in defaults
2. Home directory config
3. Current directory config
4. Command-line arguments

## Validation

The configuration loader validates:
- Quality values must be: `high`, `medium`, or `low`
- YouTube quality can also be: `best`
- Timeout must be a positive number
- Size threshold must match format: `1024` or `10k`

Invalid configurations will show an error message and fall back to defaults.