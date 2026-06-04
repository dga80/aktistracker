@echo off
title AktisTracker - Buscador de Pedidos Pendientes
echo =======================================================
echo                 AKTIS TRACKER v1.0
echo          Buscador de Pedidos Pendientes 2026
echo =======================================================
pushd "%~dp0"

:: Check if node_modules exists, install if missing
if not exist node_modules (
  echo.
  echo [INFO] Carpeta node_modules no encontrada. Instalando dependencias...
  call npm install
)

echo.
echo [OK] Abriendo el navegador en http://localhost:3000...
start http://localhost:3000

echo.
echo [OK] Iniciando el servidor... Para detener la aplicacion, cierra esta ventana.
echo.
node server.js
popd

pause
