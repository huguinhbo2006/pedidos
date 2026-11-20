# Estado del Proyecto — Sistema de Pedidos Taquería Mary

Última actualización: **19 de noviembre de 2026** (Integración de Módulo de Dispositivos WhatsApp con Railway)

---

## 1. Información general del repositorio y despliegue

- **Repositorio GitHub:** `https://github.com/huguinhbo2006/pedidos.git` (rama principal: `main`)
- **Frontend (Angular 20):** carpeta `admin/` → despliega automático a `https://pedidos.taqueriamary.com` vía `.github/workflows/deploy-admin.yml` cuando hay cambios en `admin/**`.
- **Backend (Laravel 12 + SQLite + Sanctum + DomPDF):** carpeta `api/` → despliega automático a `https://api-pedidos.taqueriamary.com` vía `.github/workflows/deploy-api.yml` cuando hay cambios en `api/**` (ejecuta `php artisan migrate --force` sin borrar la base de datos SQLite de producción).
- **Usuario de acceso:** `hugo.perez` / `12345`
- **Microservicio WhatsApp (Railway):** `https://whatsapp-api-production-80b7.up.railway.app`

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

---

## 2. Lo que YA se ha hecho y está terminado

### A. Catálogo, Paquetes y Clientes
- **Catálogo de productos:** CRUD completo, activación/desactivación y protección contra borrado accidental en pedidos.
- **Paquetes configurables:** Grupos de selección con límites (`min_quantity`, `max_quantity`) y opciones enlazadas a productos del catálogo con costos extra (`extra_price`).
- **Clientes y múltiples domicilios:** Búsqueda rápida por teléfono y guardado automático de direcciones con autocompletado de Google Maps.

### B. Sistema de Promociones y Descuentos
- **3 Tipos de Promociones:** `free_product`, `discount` y `fixed_price_combo`.
- **Descuentos manuales:** En `$ Pesos` o `% Porc.` con motivo opcional.
- **Alertas proactivas y toasts:** Al desbloquear promociones en el carrito.

### C. Fecha de Entrega Completa (`delivery_date`), Hora y Pedidos Programados
- **Migración aditiva:** `2026_11_20_010000_add_delivery_date_to_orders_table.php` (agrega columna `delivery_date` indexada a `orders`).
- **Backend:** `store()`, `update()`, `today()` con filtro de fecha programada y `upcoming_orders` para pedidos agendados a futuro (`GET /api/orders/upcoming`).
- **Frontend Angular:** Selector de fecha en Nuevo Pedido (`Hoy`, `Mañana`, `<input type="date">`) y pestañas en Pedidos del Día (`Hoy` vs `📅 Próximos Programados`).
- **Comprobante PDF:** Fecha y hora programada claramente visibles.

### D. Modificar y Eliminar Pedidos
- **Modificar:** Ruta `/pedidos/editar/:id` y `PUT /api/orders/{id}` con carga completa del wizard.
- **Eliminar:** Botón `🗑️` con modal de confirmación obligatoria e irreversible y borrado en cascada en `DELETE /api/orders/{id}`.

### E. Módulo de Dispositivos WhatsApp Multiusuario (Conectado a Railway)
- **Base de Datos:** Migración `2026_11_20_020000_create_whatsapp_devices_table.php` y modelo `WhatsAppDevice.php`.
- **Backend:** `WhatsAppDeviceController.php` conectado al microservicio de Railway (`https://whatsapp-api-production-80b7.up.railway.app`):
  - `GET /api/whatsapp/devices`: Lista dispositivos y sincroniza en vivo los estados con Railway.
  - `POST /api/whatsapp/devices`: Crea dispositivo y solicita QR en tiempo real.
  - `POST /api/whatsapp/devices/{id}/test-message`: Enviar mensaje de prueba con número y texto personalizado.
  - `GET /api/whatsapp/devices/{id}/qr`: Consulta QR y auto-detecta estado de vinculación.
  - `GET /api/whatsapp/devices/{id}/sync`: Sincroniza estado de conexión en vivo.
  - `PATCH /api/whatsapp/devices/{id}/default`: Marca la línea como predeterminada/principal.
  - `DELETE /api/whatsapp/devices/{id}`: Desvincula la sesión en Railway y la elimina de la BD.
  - `GET /api/whatsapp/settings` y `PUT /api/whatsapp/settings`: Consulta y actualiza la URL del servidor Railway.
- **Frontend Angular (`/whatsapp`):**
  - Nuevo enlace en el menú de navegación: **💬 WhatsApp**.
  - Pantalla con tarjetas de dispositivos vinculados, estado `🟢 En línea` / `⚪ Desconectado`, badge de `⭐ Principal` y número telefónico vinculado.
  - **Modal interactivo de vinculación:** Escribes el nombre/alias, se genera el código QR en vivo, y al escanearlo con el celular, el modal lo detecta automáticamente cada 2.8s y muestra la confirmación de conexión en verde.
  - **Modal de prueba de envío:** Botón `✉️ Testear Mensaje` en cada línea conectada que abre un modal para ingresar número telefónico destino y mensaje personalizado con reporte en vivo del envío.
  - Modal de configuración para modificar la URL de Railway si fuera necesario.

### F. Catálogo de Empleados y Notificaciones de Pedidos por WhatsApp
- **Base de Datos:**
  - Migración `2026_11_20_030000_create_employees_table.php` (tabla `employees` y columna `assigned_employee_id` en `orders`).
  - Modelos `Employee.php` y relación en `Order.php`.
- **Backend:**
  - `EmployeeController.php`: CRUD completo (`GET /api/employees`, `POST /api/employees`, `PUT /api/employees/{id}`, `PATCH /api/employees/{id}/toggle-active`, `DELETE /api/employees/{id}`).
  - `POST /api/orders/{order}/whatsapp`: Envío automático con plantillas profesionales:
    - **Al Cliente:** Folio, fecha, hora estimada, domicilio, referencias, detalle de productos y total a pagar.
    - **Al Repartidor:** Datos del cliente, teléfono, dirección, enlace con coordenadas a Google Maps, productos y monto exacto a cobrar en la entrega.
- **Frontend Angular:**
  - Módulo `/empleados` con listado de personal, roles (`🛵 Repartidor`, `👨‍🍳 Cocina`, `💵 Caja`, `🌮 Mostrador`), modal para dar de alta/editar, switch de estado activo/inactivo, y botón para enviar WhatsApp directo al empleado.
  - Enlace `🛵 Empleados` en la barra superior de navegación.
  - Selector de repartidor asignado en `Nuevo Pedido` (Paso 2).
  - En `Pedidos del Día`: insignia del repartidor asignado, enlace de llamada en el teléfono del cliente, botón `🗺️ Mapa` para abrir la dirección en Google Maps con un clic, botón `📞 Llamar` para marcar directamente al celular registrado y botón `💬 WhatsApp` para enviar avisos al cliente o al repartidor con vista previa editable.

### G. Estado de Pruebas y Compilación
- **Laravel (`php artisan test`):** `11 passed (141 assertions)` en `api/tests/Feature/TacosDoradosApiTest.php`.
- **Angular (`npm run build`):** compila limpio en 4.3s con `0` errores y `0` advertencias.
- **Despliegues Git:**
  - Microservicio Railway `whatsapp-api`: verificado en producción (`https://whatsapp-api-production-80b7.up.railway.app/health`).
  - Proyecto `pedidos`: subido a GitHub `origin main` (Hostinger).

