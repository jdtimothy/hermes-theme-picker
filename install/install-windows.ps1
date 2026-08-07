# Installs the Theme Picker desktop plugin into the active Windows Hermes home.
# Self-contained: no backend plugin, no skins to copy, nothing to enable.
$ErrorActionPreference = 'Stop'

$bundle = Split-Path -Parent $MyInvocation.MyCommand.Path

# Support both layouts:
# - a source checkout: <repo>\plugin\plugin.js
# - a small distributable bundle: <bundle>\theme-picker\plugin.js
$checkoutPlugin = Join-Path (Split-Path -Parent $bundle) 'plugin\plugin.js'
$bundledPlugin = Join-Path $bundle 'theme-picker\plugin.js'
$sourcePlugin = if (Test-Path -LiteralPath $checkoutPlugin) {
  $checkoutPlugin
} elseif (Test-Path -LiteralPath $bundledPlugin) {
  $bundledPlugin
} else {
  throw "Theme Picker plugin file was not found. Expected '$checkoutPlugin' or '$bundledPlugin'."
}

# Hermes Desktop on this Windows install stores its runtime home under LocalAppData.
# Honour an explicit override first, then select the installed Desktop home,
# then fall back to the CLI default.
$desktopHome = Join-Path $env:LOCALAPPDATA 'hermes'
$cliHome = Join-Path $env:USERPROFILE '.hermes'
$hermesHome = if ($env:HERMES_HOME) {
  $env:HERMES_HOME
} elseif (Test-Path $desktopHome) {
  $desktopHome
} else {
  $cliHome
}

$pluginDir = Join-Path $hermesHome 'desktop-plugins\theme-picker'
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
Copy-Item -LiteralPath $sourcePlugin -Destination (Join-Path $pluginDir 'plugin.js') -Force

Write-Host ''
Write-Host "Installed Theme Picker into: $pluginDir" -ForegroundColor Green
Write-Host 'Now open the Command Palette (Ctrl+K) in Hermes Desktop and run: Reload desktop plugins'
Write-Host '(or fully quit and relaunch Hermes Desktop).'
