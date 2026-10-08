#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACS_PAGE='https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/'
package_path=''
check_only=false
usage() {
    cat <<'HELP'
Usage: bash scripts/install-reader-driver.sh [--check | --package /path/to/ACS.pkg]
  macOS: supply --package with a manually downloaded ACS installer.
  Linux: install the reader driver using the system package manager.
  --check: run the native PC/SC probe without installing anything.
  --package: install a locally downloaded macOS ACS .pkg or .mpkg.
Installation may request an administrator password through sudo.
HELP
}
while [ "$#" -gt 0 ]; do
    case "$1" in
        --check) check_only=true; shift ;;
        --package)
            [ "$#" -ge 2 ] || { usage >&2; exit 2; }
            package_path="$2"; shift 2 ;;
        --help|-h) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done
if $check_only && [ -n "$package_path" ]; then
    echo 'Choose either --check or --package.' >&2
    exit 2
fi
if $check_only; then
    command -v cargo >/dev/null 2>&1 || {
        echo 'Install Rust for the probe, or use Device test in the built app.' >&2
        exit 2
    }
    cargo run --offline --manifest-path "$PROJECT_ROOT/src-tauri/Cargo.toml" --example reader_probe
    exit $?
fi
case "$(uname -s)" in
    Darwin)
        if [ -z "$package_path" ]; then
            echo "Download and extract the macOS PC/SC Driver Installer from $ACS_PAGE" >&2
            echo 'Then run: bash scripts/install-reader-driver.sh --package /path/to/ACS.pkg' >&2
            echo 'If already installed, use --check to verify reader detection.' >&2
            exit 2
        fi
        case "$package_path" in
            *.pkg|*.mpkg) ;;
            *) echo '--package must point to an ACS .pkg or .mpkg installer.' >&2; exit 2 ;;
        esac
        [ -e "$package_path" ] || { echo "Installer not found: $package_path" >&2; exit 2; }
        echo "Installing: $package_path"
        sudo /usr/sbin/installer -pkg "$package_path" -target /
        echo 'Driver installation finished. Reconnect the reader; reboot if requested by ACS.'
        ;;
    Linux)
        [ -z "$package_path" ] || { echo '--package is for macOS only.' >&2; exit 2; }
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update
            sudo apt-get install -y pcscd libpcsclite-dev libacsccid1 pcsc-tools
        elif command -v dnf >/dev/null 2>&1; then
            sudo dnf install -y pcsc-lite pcsc-lite-devel pcsc-lite-acsccid pcsc-tools
        elif command -v pacman >/dev/null 2>&1; then
            sudo pacman -S --needed pcsclite acsccid pcsc-tools
        else
            echo 'Unsupported package manager. Install PC/SC and the ACS CCID driver manually.' >&2
            exit 2
        fi
        if command -v systemctl >/dev/null 2>&1; then
            sudo systemctl enable --now pcscd.socket
        else
            echo 'Packages installed. Start pcscd using your system service manager before testing.' >&2
            exit 2
        fi
        echo 'ACS driver and PC/SC socket setup finished.'
        ;;
    *) echo 'Use scripts/install-reader-driver.ps1 on Windows.' >&2; exit 2 ;;
esac
echo 'Installation is complete; device communication has not yet been verified.'
echo 'Connect the reader, then run: bash scripts/install-reader-driver.sh --check'
echo 'Or open the desktop app and select Device test.'
