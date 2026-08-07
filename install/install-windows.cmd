@echo off
setlocal

REM Double-click this file in Explorer to install the Theme Picker.
REM The policy bypass applies only to this one PowerShell process.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
set "exitCode=%ERRORLEVEL%"

if not "%exitCode%"=="0" (
  echo.
  echo Installation failed. See the message above.
  pause
)

exit /b %exitCode%
