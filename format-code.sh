#!/bin/bash

# Format all TypeScript files with Prettier
echo "Formatting TypeScript files with 2-space indentation..."
npx prettier --write "src/**/*.ts"

# Format any JavaScript files if they exist
if [ -n "$(find . -name "*.js" -not -path "./node_modules/*" -not -path "./dist/*" -print -quit)" ]; then
  echo "Formatting JavaScript files..."
  npx prettier --write "**/*.js" --ignore-path ".gitignore"
fi

# Format JSON files
if [ -n "$(find . -name "*.json" -not -path "./node_modules/*" -not -path "./dist/*" -print -quit)" ]; then
  echo "Formatting JSON files..."
  npx prettier --write "**/*.json" --ignore-path ".gitignore"
fi

echo "Formatting complete!" 