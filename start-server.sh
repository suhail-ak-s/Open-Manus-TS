#!/bin/bash

# Set environment variables
export NODE_ENV=development

# Build the project if the dist directory doesn't exist
if [ ! -d "./dist" ]; then
  echo "Building project..."
  npm run build
fi

# Start the server
echo "Starting OpenManus server..."
npm run server

# If the server exits, keep the terminal open
echo "Server exited. Press any key to close this window."
read -n 1
