@echo off
echo ========================================
echo RFID Scanner Setup - ACR122
echo ========================================
echo.

echo [1/3] Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo ✓ Node.js is installed
echo.

echo [2/3] Installing Tauri app dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Tauri dependencies
    pause
    exit /b 1
)
echo ✓ Tauri dependencies installed
echo.

echo [3/3] Installing RFID prerequisites and server dependencies...
cd server
call npm run install-prerequisites
if %errorlevel% neq 0 (
    echo ERROR: Failed to install RFID prerequisites or server dependencies
    cd ..
    pause
    exit /b 1
)
cd ..
echo ✓ RFID prerequisites and server dependencies installed
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo IMPORTANT NOTES:
echo.
echo 1. Make sure your ACR122 RFID reader is connected via USB
echo.
echo 2. Windows may require additional drivers:
echo    - Download ACR122U driver from: https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/
echo.
echo 3. Windows native-module builds require Python 3 and Visual Studio Build Tools
echo    with the "Desktop development with C++" workload.
echo    Install them before setup if server dependency installation fails.
echo.
echo 4. To start the application:
echo    - Run: npm run tauri dev
echo.
echo 5. To build for production:
echo    - Run: npm run tauri build
echo.
pause
