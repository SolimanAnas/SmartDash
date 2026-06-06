@echo off
cd /d "%~dp0proj"
echo === Lint ===
call npm run lint
echo.
echo === Format ===
call npm run format
echo.
echo === Build ===
call npm run build
echo.
cd /d "%~dp0"
start "" "index.html"
