#!/bin/bash
# Script to install missing type declarations

echo "Installing missing type declarations for OpenManus..."

# Remove non-existent type packages
npm install -D \
  @types/node \
  @types/uuid \
  @types/express \
  @types/cors \
  @types/ws \
  @types/axios \
  @types/pino \
  @types/puppeteer \
  @types/fs-extra

echo "Making the script executable..."
chmod +x fix-types.sh

echo "Done! Now run 'npm run build' to check if all type errors are resolved."

# Make the script executable
chmod +x fix-types.sh

# Install @types packages
npm install -D @types/node@20.10.0 @types/pino@7.0.5

# Fix the pino type version if needed
if [ $? -ne 0 ]; then
  echo "Trying alternate version for pino types..."
  npm install -D @types/node@20.10.0
  npm install -D @types/pino@latest
fi

# For other type declaration issues, we'll create ambient declarations
mkdir -p src/types/declarations
touch src/types/declarations/index.d.ts

cat > src/types/declarations/index.d.ts << 'EOF'
// Ambient declarations for external modules without type definitions

declare module 'toml' {
  export function parse(text: string): any;
  export function stringify(obj: any): string;
}

// Add other module declarations as needed
EOF

# Update tsconfig to include these declarations
tsconfig_file="tsconfig.json"
if grep -q "\"typeRoots\":" "$tsconfig_file"; then
  echo "typeRoots already defined in tsconfig.json"
else
  sed -i '' 's/"compilerOptions": {/"compilerOptions": {\n    "typeRoots": ["node_modules\/@types", "src\/types\/declarations"],/g' "$tsconfig_file"
fi

echo "Type declaration fixes applied."
