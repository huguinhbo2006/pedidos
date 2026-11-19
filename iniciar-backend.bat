@echo off
cd /d "%~dp0api"
echo Iniciando Backend Laravel (SQLite) en http://127.0.0.1:8000 ...
php artisan serve --host=127.0.0.1 --port=8000
pause
