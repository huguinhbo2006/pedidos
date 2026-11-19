# Sistema de Pedidos — Tacos Dorados

Monorepo completo desarrollado en **Laravel 12 (SQLite + Sanctum)** y **Angular 20** para gestionar pedidos a domicilio de tacos dorados.

## Credenciales de acceso (usuario único)
- **Usuario:** `hugo.perez`
- **Contraseña:** `12345`

## Estructura del monorepo
- `admin/` — Aplicación web SPA en Angular 20 (despliega a `https://pedidos.taqueriamary.com` cuando cambia `admin/**`).
- `api/` — API REST en Laravel 12 + SQLite (despliega a `https://api-pedidos.taqueriamary.com` cuando cambia `api/**`).
- `.github/workflows/deploy-admin.yml` — Workflow independiente para desplegar únicamente `admin/`.
- `.github/workflows/deploy-api.yml` — Workflow independiente para desplegar únicamente `api/`.
- `iniciar-backend.bat` y `iniciar-frontend.bat` — Scripts rápidos para levantar ambos servidores localmente en Windows.

## Despliegue automático a Hostinger (un solo secret)
En GitHub (**Settings → Secrets and variables → Actions**), agrega únicamente:
- `HOSTINGER_SSH_PASSWORD` (o `HOSTINGER_SSH_KEY`)

Al hacer `git push` a `main`:
- Si modificas archivos dentro de `admin/`, solo corre `deploy-admin.yml`.
- Si modificas archivos dentro de `api/`, solo corre `deploy-api.yml`.

## Cómo ejecutarlo localmente
1. **API (`api/`):**
   ```powershell
   cd C:\Users\LENOVO\Desktop\tacos-dorados\api
   php artisan serve --host=127.0.0.1 --port=8000
   ```
2. **Admin (`admin/`):**
   ```powershell
   cd C:\Users\LENOVO\Desktop\tacos-dorados\admin
   npm start
   ```
3. Abre **http://localhost:4200** e inicia sesión con `hugo.perez` / `12345`.
