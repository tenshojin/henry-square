@echo off
chcp 65001 >nul
cd /d "%~dp0"
"tools\node\node.exe" build.mjs
pause
