# Estado del Proyecto — Sistema de Pedidos Taquería Mary

Última actualización: **19 de noviembre de 2026** (Implementación de Fecha Programada, Modificar Pedido y Eliminar con Confirmación)

---

## 1. Información general del repositorio y despliegue

- **Repositorio GitHub:** `https://github.com/huguinhbo2006/pedidos.git` (rama principal: `main`)
- **Frontend (Angular 20):** carpeta `admin/` → despliega automático a `https://pedidos.taqueriamary.com` vía `.github/workflows/deploy-admin.yml` cuando hay cambios en `admin/**`.
- **Backend (Laravel 12 + SQLite + Sanctum + DomPDF):** carpeta `api/` → despliega automático a `https://api-pedidos.taqueriamary.com` vía `.github/workflows/deploy-api.yml` cuando hay cambios en `api/**` (ejecuta `php artisan migrate --force` sin borrar la base de datos SQLite de producción).
- **Usuario de acceso:** `hugo.perez` / `12345`

### Cómo levantarlo localmente

1. **Backend (`api/`):**
   ```powershell
   cd api
   composer install
   php artisan migrate
   php artisan serve --host=127.0.0.1 --port=8000
   ```
2. **Frontend (`admin/`):**
   ```powershell
   cd admin
   npm install
   npm start
   ```
   También puedes usar `iniciar-backend.bat` e `iniciar-frontend.bat` desde la raíz.

> ⚠️ **Regla importante de base de datos:** No usar `migrate:fresh` ni borrar tablas en producción. Todas las nuevas columnas deben hacerse mediante migraciones aditivas (`Schema::table(...)`).

---

## 2. Lo que YA se ha hecho y está terminado

### A. Catálogo, Paquetes y Clientes
- **Catálogo de productos:** CRUD completo, activación/desactivación y protección contra borrado accidental en pedidos.
- **Paquetes configurables:** Grupos de selección con límites (`min_quantity`, `max_quantity`) y opciones enlazadas a productos del catálogo con costos extra (`extra_price`).
- **Clientes y múltiples domicilios:** Búsqueda rápida por teléfono y guardado automático de direcciones.

### B. Sistema de Promociones y Descuentos
- **3 Tipos de Promociones:**
  1. `free_product` (Producto gratis condicionado).
  2. `discount` (Descuento `%` o `$` con validación de requisitos en servidor).
  3. `fixed_price_combo` (Combo a precio fijo directo en nuevo pedido).
- **Descuentos manuales:** En `$ Pesos` o `% Porc.` con motivo opcional.
- **Alertas proactivas y toasts:** Al desbloquear promociones en el carrito.

### C. Fecha de Entrega Completa (`delivery_date`), Hora y Pedidos Programados
- **Migración aditiva aplicada:** `2026_11_20_010000_add_delivery_date_to_orders_table.php` (agrega columna `delivery_date` indexada a `orders`).
- **Backend (`OrderController.php`):**
  - `store()` y `update()`: Aceptan `delivery_date` (guarda fecha elegida o por defecto hoy).
  - `today()`: Filtra pedidos pendientes a entregar hoy (`delivery_date = hoy` o fallback a `created_at` hoy).
  - Devuelve `upcoming_orders` con todos los pedidos pendientes programados para fechas futuras (`delivery_date > hoy`).
  - Endpoint dedicado `GET /api/orders/upcoming`.
  - En `index()` (Historial): Soporta filtrado por `delivery_date`.
- **Frontend Angular (`today-orders`, `new-order`, `history`):**
  - **Selector de Fecha:** Botones rápidos `📅 Hoy`, `⏩ Mañana` y selector de fecha `<input type="date">` en Nuevo Pedido.
  - **Pestañas en Pedidos del Día:** Pestaña `🌮 Pedidos de Hoy` vs `📅 Próximos Programados`.
  - **Resumen y KPI:** Tarjeta dedicada de pedidos programados con montos totales.
  - **PDF y comprobantes:** Muestra claramente la fecha y hora programada (`Entrega programada: DD/MM/YYYY · HH:MM`).

### D. Modificar Pedido (Edición Completa)
- **Ruta Angular:** `/pedidos/editar/:id`.
- **Endpoint Backend:** `PUT /api/orders/{id}` con recalculo de subtotales, promociones, descuentos e integridad de cliente/direcciones.
- **Acceso:** Botón `✏️ Modificar` directamente desde las tarjetas de **Pedidos del Día** y del **Historial**.
- Carga completa del pedido en el wizard: teléfono, cliente, domicilio, fecha/hora programada, notas, paquetes, productos y promociones aplicadas.

### E. Eliminar Pedido (con Confirmación Obligatoria)
- **Endpoint Backend:** `DELETE /api/orders/{id}` con borrado en cascada seguro dentro de transacción (`DB::transaction`).
- **Frontend:** Botón `🗑️` en las tarjetas con **Modal de Confirmación**:
  - Muestra folio, cliente, domicilio, fecha/hora y total a cobrar.
  - Alerta de acción irreversible.
  - Al confirmar, elimina el pedido inmediatamente, actualiza los contadores/KPIs y muestra un toast de éxito.

### F. Estado de Pruebas y Compilación
- **Laravel (`php artisan test`):** `9 passed (101 assertions)` en `api/tests/Feature/TacosDoradosApiTest.php`.
- **Angular (`npm run build`):** compila en 3.8s con `0` errores y `0` advertencias.
