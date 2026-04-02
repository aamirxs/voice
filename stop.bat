@echo off
echo Stopping Google Meet Clone Servers...
taskkill /F /IM node.exe /T 2>nul
taskkill /FI "WINDOWTITLE eq Signaling Server (Backend)*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Vite Dev Server (Frontend)*" /F 2>nul
echo All related Node.js processes and windows have been closed.
