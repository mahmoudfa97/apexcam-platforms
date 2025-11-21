#!/bin/bash

echo "🧹 Cleaning MDVR Platform..."

# Remove node_modules and lock files
echo "Removing node_modules and lock files..."
rm -rf node_modules
rm -rf .next
rm -rf pnpm-lock.yaml
rm -rf package-lock.json
rm -rf yarn.lock

# Remove service node_modules
echo "Cleaning service directories..."
rm -rf services/*/node_modules
rm -rf mobile/node_modules
rm -rf tools/*/node_modules

# Clear pnpm cache
echo "Clearing pnpm cache..."
pnpm store prune

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Run 'pnpm dev' to start the development server"
