# Taquería Pedidos — Frontend (Angular 20)

Aplicación web SPA en **Angular 20** para la gestión de pedidos de tacos dorados conectada a la API Laravel (`TAQUERIA-PEDIDOS-API`).

## Requisitos
- Node.js `>= 20`
- npm

## Desarrollo local
```bash
npm install
npm start
```
Abre **http://localhost:4200** (el archivo `proxy.conf.json` redirige `/api` hacia `http://127.0.0.1:8000`).

## Compilación para producción (Hostinger)
1. Ajusta `apiUrl` en `src/environments/environment.ts` con la URL pública de tu API (por ejemplo `https://api.tudominio.com/api`).
2. Ejecuta:
   ```bash
   npm run build
   ```
3. Sube el contenido de `dist/tacos-dorados-web/browser/` a la carpeta pública (`public_html`) en Hostinger (incluye `.htaccess` para rutas SPA de Angular).

## Credenciales iniciales
- **Usuario:** `hugo.perez`
- **Contraseña:** `12345`
