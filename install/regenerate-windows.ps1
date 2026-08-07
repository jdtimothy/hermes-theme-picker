# Rebuild the installed Windows Theme Picker without dropping bundled skins.
# Run from PowerShell: .\install\regenerate-windows.ps1
$ErrorActionPreference = 'Stop'

$bundle = Split-Path -Parent $MyInvocation.MyCommand.Path
$hermesHome = if ($env:HERMES_HOME) {
  $env:HERMES_HOME
} else {
  Join-Path $env:LOCALAPPDATA 'hermes'
}
$bundledSkins = Join-Path $bundle '..\skins'
$liveSkins = Join-Path $hermesHome 'skins'
$pluginPath = Join-Path $hermesHome 'desktop-plugins\theme-picker\plugin.js'
$regenerator = Join-Path $bundle '..\scripts\regenerate.py'
$stagingSkins = Join-Path ([System.IO.Path]::GetTempPath()) "hermes-theme-picker-skins-$PID"

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw 'Python launcher (py) was not found. Install Python 3, then run this script again.'
}

& py -c 'import yaml'
if ($LASTEXITCODE -ne 0) {
  throw 'PyYAML is required. Install it for this Python with: py -m pip install --user PyYAML'
}

try {
  New-Item -ItemType Directory -Force -Path $stagingSkins | Out-Null
  Copy-Item -Path (Join-Path $bundledSkins '*.yaml') -Destination $stagingSkins -Force

  # Local Windows skins override same-named bundled files and are included with
  # the complete bundled catalog in the rebuilt plugin.
  if (Test-Path $liveSkins) {
    Get-ChildItem -Path $liveSkins -Filter '*.yaml' -File | ForEach-Object {
      Copy-Item -Path $_.FullName -Destination $stagingSkins -Force
    }
  }

  & py $regenerator $stagingSkins $pluginPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Theme Picker regeneration failed; the existing plugin was left unchanged.'
  }
} finally {
  Remove-Item -Path $stagingSkins -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "Rebuilt: $pluginPath" -ForegroundColor Green
Write-Host 'In Hermes Desktop, press Ctrl+K and run: Reload desktop plugins (or restart the app).'
