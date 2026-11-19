# Estado del Proyecto — Sistema de Pedidos Taquería Mary

Última actualización: **19 de noviembre de 2026** (último commit de funcionalidad: `9a8d3d8`)

---

## 1. Información general del repositorio y despliegue

- **Repositorio GitHub:** `https://github.com/huguinhbo2006/pedidos.git` (rama principal: `main`)
- **Frontend (Angular 20):** carpeta `admin/` → despliega automático a `https://pedidos.taqueriamary.com` vía `.github/workflows/deploy-admin.yml` cuando hay cambios en `admin/**`.
- **Backend (Laravel 12 + SQLite + Sanctum + DomPDF):** carpeta `api/` → despliega automático a `https://api-pedidos.taqueriamary.com` vía `.github/workflows/deploy-api.yml` cuando hay cambios en `api/**` (ejecuta `php artisan migrate --force` sin borrar la base de datos SQLite de producción).
- **Usuario de acceso:** `hugo.perez` / `12345`

### Cómo retomarlo en otra computadora (en casa)

1. Clonar o descargar el repositorio:
   ```powershell
   git clone https://github.com/huguinhbo2006/pedidos.git
   cd pedidos
   ```
   *(Si ya lo habías clonado antes, solo ejecuta `git pull origin main`.)*
2. **Backend (`api/`):**
   ```powershell
   cd api
   composer install
   # Si es instalación limpia local:
   # copiar .env.example a .env (si aplica) y generar database/database.sqlite
   php artisan migrate
   php artisan serve --host=127.0.0.1 --port=8000
   ```
3. **Frontend (`admin/`):**
   ```powershell
   cd admin
   npm install
   npm start
   ```
   También puedes usar `iniciar-backend.bat` e `iniciar-frontend.bat` desde la raíz una vez instaladas las dependencias.

> ⚠️ **Regla importante de base de datos:** No usar `migrate:fresh` ni borrar tablas en producción. Todas las nuevas columnas deben hacerse mediante migraciones aditivas (`Schema::table(...)`).

---

## 2. Lo que YA se ha hecho y está desplegado en producción

### A. Catálogo, Paquetes y Clientes
- **Catálogo de productos** (`api/app/Http/Controllers/Api/ProductController.php`, `admin/src/app/features/catalog/catalog.component.*`): CRUD completo, activación/desactivación y protección para no eliminar productos en uso.
- **Paquetes configurables con opciones del catálogo** (`api/app/Http/Controllers/Api/PackageController.php`, `admin/src/app/features/packages/packages-admin.component.ts`, `admin/src/app/shared/package-builder-modal/package-builder-modal.component.ts`):
  - Grupos de selección por paquete (`min_quantity`, `max_quantity`).
  - Las opciones dentro de cada grupo se eligen desde **productos existentes del catálogo** (no creados desde cero) con campo de **incremento extra (`extra_price`)** (por ejemplo, tacos de requesón con costo adicional).
- **Clientes y múltiples domicilios** (`api/app/Http/Controllers/Api/CustomerController.php`, `admin/src/app/features/customers/customers.component.ts`): búsqueda rápida por teléfono y guardado automático de cliente + direcciones usadas.

### B. Sistema completo de Promociones (3 tipos) y Descuentos Manuales
- **Migración aditiva aplicada:** `api/database/migrations/2026_11_19_230000_upgrade_promotions_and_order_discounts.php`
- **Backend:** `PromotionController.php`, `OrderController.php`, modelos `Promotion.php`, `Order.php`, `OrderItem.php`.
- **Tipos de promociones configurables desde "Paquetes y Promociones → Promociones":**
  1. **`free_product` (Producto gratis):** Regala productos seleccionados del catálogo hasta `max_quantity` unidades según condición (`all_packages`, `packages`, `products` o `order_total`).
  2. **`discount` (Descuento `%` o `$`):** Descuento configurable en porcentaje o pesos fijos aplicable sobre todos los paquetes, paquetes específicos, productos específicos (con cantidad mínima) o monto mínimo del pedido (`min_order_amount`), calculado y validado en servidor.
  3. **`fixed_price_combo` (Combo a precio fijo):** Armado con productos existentes del catálogo + cantidades + `fixed_price` final. Aparece directo en **Nuevo Pedido → Paso 3 → pestaña `🎁 Promos Precio Fijo`**.
- **Descuento manual directo en el pedido:** En el resumen del pedido se puede aplicar descuento directo en `$ Pesos` o `% Porc.` con motivo opcional aunque no exista promoción.
- **Avisos proactivos de promociones en `NewOrderComponent`:**
  - Tira superior en Paso 3 mostrando todas las promociones activas hoy y su condición (con estado `✓ Califica`).
  - Notificación `toast` automática en cuanto el carrito desbloquea una promoción.
  - Tarjetas fijas dentro de la columna derecha (**Resumen del Pedido**) para agregar regalos en 1 clic o marcar descuentos sin tener que subir el scroll.
  - Modal preventivo antes de guardar el pedido si existe una promoción calificada que aún no se ha aplicado.

### C. Wizard de Nuevo Pedido, Google Maps y Hora de entrega
- **Wizard en 3 pasos** (`admin/src/app/features/orders/new-order.component.*`):
  1. Cliente (teléfono + autocompletado).
  2. Domicilio (guardados o Google Maps) + **Hora de entrega (`delivery_time`)**.
  3. Paquetes, Combos Precio Fijo, Productos Individuales y Regalos + Resumen fijo a la derecha.
- **Google Maps y Places API** (`admin/src/app/core/services/google-maps.service.ts`, `admin/src/app/shared/google-maps-address-input/*`):
  - API Key configurada en `admin/src/environments/environment.ts` y `environment.development.ts`.
  - Corregida la carga asíncrona usando parámetro `callback` + `importLibrary('places')` e `importLibrary('maps')` + manejo de `gm_authFailure` (resolvió `"Google Maps cargó sin la librería Places"`).
- **Hora de entrega inicial (`delivery_time`):**
  - Migración aplicada: `api/database/migrations/2026_11_20_000000_add_delivery_time_to_orders_table.php`.
  - Soporta `⚡ Lo antes posible`, atajos `+30 min` / `+45 min` / `+1 hora` o `<input type="time">`.
  - Se muestra en Nuevo Pedido, Pedidos del Día (`TodayOrdersComponent`), Historial (`HistoryComponent`) y PDF (`api/resources/views/pdf/order.blade.php`).

### D. Estado de pruebas actuales
- **Laravel (`php artisan test`):** `8 passed (81 assertions)` en `api/tests/Feature/TacosDoradosApiTest.php`.
- **Angular (`npm run build`):** compila limpio con `0` errores y `0` advertencias.

---

## 3. Lo que FALTA por hacer (Pendientes)

### Pendiente principal: Fecha de entrega completa (`delivery_date` + hora) para pedidos de cualquier día

**Problema detectado:**
Actualmente el campo `orders.delivery_time` solo guarda la hora (`"Lo antes posible"` o `"2:30 p. m."`), pero **no permite elegir la fecha** cuando un cliente agenda un pedido para otro día (por ejemplo, mañana, el fin de semana o una fecha futura).

Además, en el backend:
- `OrderController::today()` (`api/app/Http/Controllers/Api/OrderController.php`) filtra actualmente por `whereBetween('created_at', [$todayStart, $todayEnd])` (fecha en que se capturó el pedido, **no** fecha en que se debe entregar).
  - Si hoy levantas un pedido para entregar **el sábado**, hoy aparecerá en "Pedidos del Día" y el sábado ya no aparecerá en "Pedidos del Día" porque su `created_at` fue de otro día.
  - Si se agenda un pedido para mañana o dentro de varios días, falta una vista clara de **pedidos próximos / agendados**.

**Plan recomendado para implementarlo:**

1. **Base de datos (Laravel):**
   - Crear migración aditiva (ej. `add_delivery_date_to_orders_table.php`) que agregue:
     - `delivery_date` (`date`, nullable, indexada) a `orders`.
     - *(Opcional backfill suave o fallback en queries usando `COALESCE(delivery_date, DATE(created_at))` para que pedidos viejos sigan funcionando igual.)*
   - Agregar `'delivery_date'` a `$fillable` y `casts()` (`'delivery_date' => 'date:Y-m-d'` o string `Y-m-d`) en `api/app/Models/Order.php`.

2. **API (`api/app/Http/Controllers/Api/OrderController.php`):**
   - En `store()`: aceptar `'delivery_date' => ['nullable', 'date']`. Si viene vacía (por ejemplo `"Lo antes posible"`), guardar la fecha de hoy (`Carbon::today()->toDateString()`).
   - En `today()` (y/o crear endpoint dedicado como `GET /api/orders/scheduled` / `upcoming`):
     - **Pedidos a entregar hoy:** filtrar pedidos pendientes donde la fecha de entrega (`delivery_date` o `DATE(created_at)` si es null) sea `Carbon::today()`.
     - **Pedidos agendados para fechas futuras:** devolver también `upcoming_orders` (pendientes con fecha de entrega `> hoy`, ordenados por `delivery_date ASC, delivery_time ASC`) o agregar pestaña **📅 Programados** en la UI.
     - **Resumen KPI del día:** mantener métricas claras separando lo que es para entregar **hoy** vs **programados próximos**.
   - En `index()` (Historial): permitir filtrar tanto por rango/fecha de creación o fecha de entrega, y buscar por texto.

3. **PDF (`api/resources/views/pdf/order.blade.php`):**
   - Mostrar fecha y hora juntas en **Datos del Cliente y Entrega**, por ejemplo:
     - `Entrega programada: Sábado 22/11/2026 · 2:30 p. m.` (o `Hoy 19/11/2026 · Lo antes posible`).

4. **Frontend Angular (`admin/`):**
   - Actualizar interfaces `Order` y `CreateOrderPayload` en `admin/src/app/core/models/api.models.ts` y `admin/src/app/core/services/api.service.ts` para incluir `delivery_date?: string | null`.
   - En **Nuevo Pedido** (`new-order.component.ts` / `.html`):
     - En **Paso 2** (caja de entrega) y en **Resumen del Pedido**: agregar selector de **Fecha de entrega**:
       - Botones rápidos: `Hoy`, `Mañana` y `<input type="date">` (`[min]="todayIsoDate"` para evitar fechas pasadas por error).
       - Si se elige una fecha futura (distinta a hoy), activar automáticamente modo de hora específica si estaba en `"Lo antes posible"` (o permitir indicar hora aproximada).
   - En **Pedidos del Día** (`today-orders.component.*`):
     - Mostrar fecha + hora de entrega claramente en cada tarjeta (destacando visualmente si es para hoy a cierta hora o para otro día).
     - Agregar pestaña o sección **"📅 Próximos Programados (X)"** para visualizar todos los pedidos de fechas futuras y poder imprimir su PDF o marcarlos entregados en su momento.
     - *(Opcional muy útil)* Ordenar los pedidos de hoy poniendo primero los que tienen hora programada más próxima.
   - En **Historial** (`history.component.ts`):
     - Mostrar `Fecha y hora de entrega` en cada tarjeta además de la fecha de creación.

5. **Validación antes de subir cambios en casa:**
   - Agregar casos de prueba en `api/tests/Feature/TacosDoradosApiTest.php` probando:
     - Pedido creado hoy con `delivery_date` futuro (no debe perderse al cambiar de día y debe aparecer en próximos/agendados).
     - Pedido programado para hoy (debe aparecer en `today`).
     - Generación de PDF con fecha y hora programada.
   - Correr `php artisan test` en `api/` y `npm run build` en `admin/`.
   - Hacer `git add`, `git commit` y `git push origin main` para que GitHub Actions despliegue automáticamente a Hostinger.

---

### Posibles mejoras adicionales opcionales (por si decides sumarlas después)
- **Edición de pedidos pendientes** (poder modificar domicilio, fecha/hora o productos de un pedido antes de entregarlo sin cancelarlo y volverlo a capturar).
- **Ordenamiento por prioridad horaria** o alerta visual en **Pedidos del Día** cuando falte menos de 30 minutos para la hora de entrega programada.
