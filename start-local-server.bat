@echo off
cd /d "%~dp0"
set PORT=5500

echo Starting local server for Assignment 3...
echo.
echo Open this address in your browser:
echo http://localhost:%PORT%
echo.
echo Keep this window open while testing the site.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%"
  python -m http.server %PORT%
  pause
  exit /b
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%"
  py -3 -m http.server %PORT%
  pause
  exit /b
)

if exist "E:\python\python3.11.7\python.exe" (
  start "" "http://localhost:%PORT%"
  "E:\python\python3.11.7\python.exe" -m http.server %PORT%
  pause
  exit /b
)

echo Python was not found. Open index.html directly, or install Python.
pause
