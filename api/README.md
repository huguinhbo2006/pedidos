# Taquería Pedidos API (Laravel + SQLite)

API REST en **Laravel 12** con **Laravel Sanctum** y base de datos **SQLite** para el sistema de pedidos de tacos dorados.

## Requisitos
- PHP `>= 8.2` con extensiones `pdo_sqlite`, `mbstring`, `openssl`, `curl`, `tokenizer`, `xml`
- Composer

## Instalación rápida
```bash
cp .env.example .env
composer install --optimize-autoloader
php artisan key:generate
touch database/database.sqlite
php artisan migrate --force
php artisan db:seed --force
php artisan serve --host=127.0.0.1 --port=8000
```

## Usuario único sembrado
- **Usuario:** `hugo.perez`
- **Contraseña:** `12345`

## Variables relevantes en `.env`
- `DB_CONNECTION=sqlite`
- `APP_TIMEZONE=America/Mexico_City`
- `GOOGLE_MAPS_API_KEY=` *(opcional aquí; también puede configurarse desde el panel web)*
- `GOOGLE_MAPS_REGION=mx`

## Endpoints principales (`/api`)
- `GET /api/health` — Estado del servicio
- `POST /api/login` — Autenticación Sanctum (`username`, `password`)
- `GET /api/products` / `POST` / `PUT` / `PATCH /toggle` / `DELETE` — Catálogo de productos
- `GET /api/customers/by-phone?phone=...` — Búsqueda automática de cliente por celular y desglose de domicilios
- `GET /api/orders/today` — Pedidos pendientes del día (`is_delivered = false`)
- `POST /api/orders` — Alta de pedido (crea/actualiza cliente, asigna domicilio, calcula total y promociones gratis)
- `PATCH /api/orders/{id}/deliver` — Confirma entrega del pedido
- `GET|PUT /api/settings/maps` — Configuración de Google Maps API Key
