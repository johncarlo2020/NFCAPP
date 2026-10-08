@echo off
setlocal
cd /d "%~dp0"
echo RFID Scanner Setup - Windows ACR122U (native PC/SC)
echo Building requires Visual Studio C++ Build Tools, Windows SDK, and Rust MSVC.
echo Python is not required for the native app.
where node >nul 2>&1
if errorlevel 1 goto missing
where npm >nul 2>&1
if errorlevel 1 goto missing
where cargo >nul 2>&1
if errorlevel 1 goto missing
call npm install
if errorlevel 1 exit /b 1
echo App dependencies installed.
echo Manually install the ACS Windows driver from:
echo https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/
echo Open PowerShell as Administrator to set up the reader:
echo powershell -NoProfile -File scripts\install-reader-driver.ps1
echo For an extracted ACS driver folder, add -DriverPath "C:\path\to\ACS-drivers"
echo Then run npm run dev and select Device test.
exit /b 0
:missing
echo Missing Node.js, npm, or Rust. Install them before setup.
exit /b 1
