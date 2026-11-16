@echo off
rem ============================================================
rem  Personal Workbench quick launcher (double-click to run)
rem  Dev server: http://localhost:5177  (close this window to stop)
rem ============================================================
cd /d "%~dp0"
start "personal-workbench dev" cmd /k "npm run dev"
%SystemRoot%\System32\timeout.exe /t 3 /nobreak >nul
start "" http://localhost:5177
