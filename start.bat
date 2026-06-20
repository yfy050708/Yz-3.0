@echo off
cd /d %~dp0
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
node server.js
pausenpm install   # 安装依赖（只需一次）
node server.js