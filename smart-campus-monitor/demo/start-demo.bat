@echo off
rem One-click demo: seed demo data, regenerate credentials doc, start backend + frontend.
setlocal
set ROOT=%~dp0..
cd /d "%ROOT%\backend"
call npm run demo || (echo Seed failed - is MongoDB reachable? & pause & exit /b 1)
python "%~dp0make_credentials_doc.py" "%~dp0demo-credentials.json" "%~dp0Demo_Credentials.docx"
start "Backend" cmd /k "cd /d %ROOT%\backend && npm run dev"
start "Frontend" cmd /k "cd /d %ROOT%\frontend && npm run dev"
timeout /t 8 >nul
start http://localhost:5173/
echo Demo credentials: %~dp0Demo_Credentials.docx
