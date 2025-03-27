#!/bin/bash

# Build the TypeScript project
echo "Building project..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "Build failed. Exiting."
    exit 1
fi

# Run the test script
echo "Running enhanced logging test..."
node dist/test-logging.js

echo "Test complete."
