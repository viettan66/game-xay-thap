@echo off
rem Chay game voi ho so %1 (production hoac test). Duoc goi tu start.bat / start-test.bat.
rem Tu cai thu vien lan dau, tu khoi dong lai server neu bi loi bat ngo.
setlocal
cd /d "%~dp0..\.."
set "GAME_PROFILE=%~1"
if "%GAME_PROFILE%"=="" set "GAME_PROFILE=test"
title Bao Thap Thien Phuc - %GAME_PROFILE%

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [LOI] Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai.
  echo.
  pause
  exit /b 1
)

node scripts\check-env.mjs
if errorlevel 3 (
  pause
  exit /b 1
)
if errorlevel 2 (
  echo Dang cai thu vien, vui long cho 1-2 phut...
  call npm install
  if errorlevel 1 (
    echo [LOI] Cai thu vien that bai. Kiem tra mang Internet roi chay lai.
    pause
    exit /b 1
  )
)

set "OPEN_FLAG=--open"
:loop
node --import tsx server\main.ts --profile=%GAME_PROFILE% %OPEN_FLAG%
set "CODE=%ERRORLEVEL%"
set "OPEN_FLAG="
if "%CODE%"=="0" goto done
if "%CODE%"=="3" (
  pause
  goto done
)
echo.
echo Server dung bat thuong (ma %CODE%). Tu khoi dong lai sau 5 giay... (dong cua so nay de thoat)
timeout /t 5 /nobreak >nul
goto loop

:done
endlocal
