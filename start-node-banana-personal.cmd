@echo off
setlocal EnableExtensions

title Start Node Banana Personal

cd /d "%~dp0"

if not exist package.json (
  echo [ERROR] Run this file from inside the node-banana-personal folder.
  pause
  exit /b 1
)

if not exist .env.local (
  echo [WARNING] .env.local was not found.
  echo Creating it from .env.example if possible...
  if exist .env.example (
    copy /Y .env.example .env.local >nul
  ) else (
    > .env.local echo GEMINI_API_KEY=
  )
  echo Edit .env.local and add your API key before using the app.
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  pause
  exit /b 1
)

echo Starting dev server...
echo Open http://localhost:3000 in Chrome
call npm run dev

pause
