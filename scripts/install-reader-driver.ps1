param(
    [string]$DriverPath,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$acsPage = 'https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/'
$projectRoot = Split-Path -Parent $PSScriptRoot
try {
    if ($Check) {
        if ($DriverPath) { throw 'Choose either -Check or -DriverPath.' }
        if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
            throw 'Install Rust for the reader probe, or use Device test in the built app.'
        }
        & cargo run --offline --manifest-path (Join-Path $projectRoot 'src-tauri/Cargo.toml') --example reader_probe
        exit $LASTEXITCODE
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script in a PowerShell window opened as Administrator.'
    }
    if ($DriverPath) {
        $resolved = (Resolve-Path -LiteralPath $DriverPath).Path
        if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
            throw '-DriverPath must be the extracted ACS PC/SC Drivers folder.'
        }
        $drivers = @(Get-ChildItem -LiteralPath $resolved -Recurse -Filter '*.inf' -File)
        if ($drivers.Count -eq 0) { throw 'No INF drivers found in the supplied folder.' }
        foreach ($driver in $drivers) {
            & pnputil.exe /add-driver $driver.FullName /install
            if ($LASTEXITCODE -notin @(0, 3010)) { throw "Driver installation failed: $($driver.Name)" }
            if ($LASTEXITCODE -eq 3010) { Write-Host 'Windows requested a reboot.' }
        }
    }
    # Preserve demand-start behavior instead of forcing automatic startup.
    Set-Service -Name SCardSvr -StartupType Manual
    Start-Service -Name SCardSvr
    if (-not $DriverPath) {
        Write-Host 'Smart Card service started. No ACS driver package was installed.'
        Write-Host "If detection fails, download PC/SC Drivers from $acsPage"
        Write-Host 'Extract the archive, then rerun with -DriverPath pointing to its driver folder.'
    } else {
        Write-Host 'ACS driver installation and Smart Card service setup finished.'
    }
    Write-Host 'Connect the reader, then run this script with -Check or open Device test.'
    Write-Host 'Device communication has not yet been verified.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
