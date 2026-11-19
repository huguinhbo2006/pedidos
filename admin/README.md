# Taquería Pedidos — Frontend (Angular 20)

Aplicación web SPA en **Angular 20** para la gestión de pedidos de tacos dorados conectada a la API Laravel (`api/`).

## Requisitos
- Node.js `>= 20`
- npm

## Desarrollo local
```bash
npm install
npm start
```
Abre **http://localhost:4200** (el archivo `proxy.conf.json` redirige `/api` hacia `http://127.0.0.1:8000`).

## Compilación y despliegue en producción (Hostinger)
1. `src/environments/environment.ts` apunta a `https://api-pedidos.taqueriamary.com/api`.
2. Al hacer `git push` a `main` con cambios en `admin/`, el workflow `.github/workflows/deploy-admin.yml` compila y publica automáticamente en `/home/u111559603/domains/taqueriamary.com/public_html/pedidos` (`https://pedidos.taqueriamary.com`).
3. Para compilar manualmente:
   ```bash
   npm run build
   ```
   *(El resultado en `dist/tacos-dorados-web/browser/` incluye `.htaccess` para rutas SPA de Angular).*

## Credenciales iniciales
- **Usuario:** `hugo.perez`
- **Contraseña:** `12345`
