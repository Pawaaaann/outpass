@echo off
echo 🚀 Starting LeaveEasy build process...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    exit /b 1
)

REM Install dependencies
echo 📦 Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies.
    exit /b 1
)

REM Install function dependencies
echo 📦 Installing function dependencies...
cd functions
npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install function dependencies.
    cd ..
    exit /b 1
)
cd ..

REM Build the application
echo 🔨 Building the application...
npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed. Please check the errors above.
    exit /b 1
)

echo ✅ Build completed successfully!
echo 📁 Build files are in the 'build' directory
echo 🌐 Ready for deployment!
echo.
echo To deploy, run: npm run deploy
pause
