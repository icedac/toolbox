#!/bin/bash

# Build TypeScript
echo "Building TypeScript..."
pnpm build

# Create a symbolic link in /usr/local/bin
echo "Creating global command..."
chmod +x dist/get.js
ln -sf "$(pwd)/dist/get.js" /usr/local/bin/getany

echo "✅ Installation complete!"
echo "You can now use 'getany' command from anywhere"
echo ""
echo "Usage: getany <URL> [options]"
echo "Example: getany https://www.instagram.com/p/ABC123/"