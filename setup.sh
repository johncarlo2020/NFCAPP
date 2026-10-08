#!/bin/bash

echo "========================================"
echo "RFID Scanner Setup - ACR122"
echo "========================================"
echo ""

echo "[1/4] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi
node --version
echo "✓ Node.js is installed"
echo ""

echo "[2/4] Installing Tauri app dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Tauri dependencies"
    exit 1
fi
echo "✓ Tauri dependencies installed"
echo ""

echo "[3/4] Installing RFID prerequisites..."

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)
        echo "Detected Linux - installing pcscd..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y pcscd libpcsclite-dev
            sudo systemctl start pcscd
            sudo systemctl enable pcscd
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y pcsc-lite pcsc-lite-devel
            sudo systemctl start pcscd
            sudo systemctl enable pcscd
        elif command -v pacman &> /dev/null; then
            sudo pacman -S --noconfirm pcsclite
            sudo systemctl start pcscd
            sudo systemctl enable pcscd
        else
            echo "WARNING: Could not detect package manager. Please install pcscd manually."
        fi
        ;;
    Darwin*)
        echo "Detected macOS - installing pcsc-lite via Homebrew..."
        if ! command -v brew &> /dev/null; then
            echo "WARNING: Homebrew is not installed. Please install from https://brew.sh/"
        else
            brew install pcsc-lite
        fi
        ;;
    *)
        echo "Unknown OS: ${OS}"
        ;;
esac
echo ""

echo "[4/4] Installing server dependencies..."
cd server
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install server dependencies"
    cd ..
    exit 1
fi
cd ..
echo "✓ Server dependencies installed"
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "IMPORTANT NOTES:"
echo ""
echo "1. Make sure your ACR122 RFID reader is connected via USB"
echo ""
echo "2. To start the application:"
echo "   - Run: npm run tauri dev"
echo ""
echo "3. To build for production:"
echo "   - Run: npm run tauri build"
echo ""
