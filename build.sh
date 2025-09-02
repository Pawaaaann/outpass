#!/bin/bash

# Build script for LeaveEasy deployment

echo "🚀 Starting LeaveEasy build process..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install function dependencies
echo "📦 Installing function dependencies..."
cd functions && npm install && cd ..

# Build the application
echo "🔨 Building the application..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo "📁 Build files are in the 'build' directory"
    echo "🌐 Ready for deployment!"
else
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi
