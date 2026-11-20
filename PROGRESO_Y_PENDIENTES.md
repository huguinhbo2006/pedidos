# Estado del Proyecto — Sistema de Pedidos Taquería Mary

**Última actualización:** 19 de noviembre de 2026 (Cierre de jornada — Listo para continuar en la oficina)

---

## 1. Información General del Repositorio y Despliegues

- **Repositorio GitHub Principal:** `https://github.com/huguinhbo2006/pedidos.git` (rama `main`)
- **Frontend (Angular 20):** Carpeta `admin/` → Despliegue automatizado en Hostinger (`https://pedidos.taqueriamary.com`) mediante `.github/workflows/deploy-admin.yml`.
- **Backend (Laravel 12 + SQLite + Sanctum + DomPDF):** Carpeta `api/` → Despliegue automatizado en Hostinger (`https://api-pedidos.taqueriamary.com`) mediante `.github/workflows/deploy-api.yml` (migraciones aditivas sin alterar datos de producción).
- **Microservicio WhatsApp (Node.js + Baileys + Express):** Repositorio `whatsapp-api` desplegado en Railway (`https://whatsapp-api-production-80b7.up.railway.app`).
- **Usuario de Acceso:** `hugo.perez` / `12345`

### Cómo levantarlo localmente
```powershell
# Backend (Laravel)
cd api
composer install
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8000

# Frontend (Angular)
cd admin
npm install
npm start
```
*(O ejecutar directamente los scripts `iniciar-backend.bat` e `iniciar-frontend.bat` desde la raíz)*.

---

## 2. Lo que se ha realizado y está terminado al 100%

### A. Catálogo, Paquetes y Clientes
- **Catálogo de productos:** CRUD completo, filtros por categorías, activación/desactivación y protección contra borrado accidental de productos en pedidos existentes.
- **Paquetes configurables:** Grupos de selección con cantidades mínimas y máximas (`min_quantity`, `max_quantity`) y opciones vinculadas a productos con precios extra opcionales (`extra_price`).
- **Clientes y múltiples domicilios:** Detección automática por número celular, historial de direcciones y autocompletado con Google Maps Places & Geocoding.

### B. Promociones y Descuentos
- **3 Tipos de promociones automáticas:** `free_product` (regalo de producto/bebida), `discount` (% o monto fijo al cumplir reglas) y `fixed_price_combo` (precio fijo por combinación de productos).
- **Descuentos manuales:** Soporte en pesos (`$`) o porcentaje (`%`) con motivo opcional.

### C. Pedidos Programados y Control de Fechas
- **Columna `delivery_date` indexada:** Filtro para pedidos de `Hoy` vs `📅 Próximos Programados` (`GET /api/orders/upcoming`).
- **Comprobante de compra:** Ticket en PDF oficial con fecha y hora claramente identificadas.
- **Edición y Cancelación:** Edición completa en el wizard de pedidos (`/pedidos/editar/:id`) y cancelación segura con modal de confirmación.

### D. Módulo de Dispositivos WhatsApp Multiusuario (Baileys en Railway)
- **Multi-dispositivo:** Conexión de múltiples números de WhatsApp identificados por `session_id`.
- **Vinculación por QR en tiempo real:** Generación de QR en vivo dentro del modal, con auto-detección y confirmación visual inmediata al escanear.
- **Modal de Testeo:** Botón en cada línea para enviar mensajes de prueba a cualquier número con reporte en vivo de entrega.
- **Configuración dinámica:** Gestión del endpoint de Railway desde la interfaz con guardado en `app_settings`.

### E. Catálogo de Empleados
- **CRUD de Colaboradores:** Registro de empleados (`/empleados`) con nombre, teléfono celular, rol (`🛵 Repartidor`, `👨‍🍳 Cocina`, `💵 Caja`, `🌮 Mostrador`), notas y switch de activación.

### F. Envío de Ticket Oficial en PDF por WhatsApp
- **Soporte Base64 en Baileys:** Microservicio actualizado para recibir documentos codificados en Base64 (`mediaBase64`), evitando exponer URLs públicas de almacenamiento.
- **Generación en Backend:** `OrderController` genera el ticket oficial con logotipo de Taquería Mary en base64 y lo despacha como archivo adjunto `ticket-PED-XXX.pdf` vía WhatsApp.
- **Botón directo `📎 Enviar PDF`:** En cada tarjeta de Pedidos del Día para abrir el modal con el envío de PDF preseleccionado.
- **Casilla de alternancia:** En el modal de WhatsApp para decidir en cualquier momento si se adjunta o no el ticket PDF.

### G. Desglose Completo de Paquetes en WhatsApp
- **Detalle de guisos y complementos:** Al enviar el mensaje de WhatsApp (tanto a empleados como a clientes y por WhatsApp Web), si el pedido tiene paquetes, se desglosa exactamente lo ordenado:
  ```text
  • 1x Paquete 20 Tacos
     - 10x Taco de Papa
     - 5x Taco de Frijol
     - 5x Taco de Barbacoa
  • 1x Consomé Grande
  ```
- **Plantilla para Empleados estructurada:** Mapa (con enlace directo y referencias), Celular del cliente, Fecha en palabras y hora, Total exacto a cobrar y Detalle completo del pedido.

### H. Botones Rápidos en Pedidos del Día
- **`🗺️ Mapa`:** Abre la ubicación en Google Maps en una nueva pestaña con un solo toque.
- **`📞 Llamar`:** Lanza llamada telefónica inmediata con el protocolo `tel:`.

### I. Inputs Modernos y Corrección Total del Scroll en Modales
- **Diseño de Inputs:** Halo de enfoque dorado/taquería (`#D97706`), íconos en etiquetas, asteriscos de obligatoriedad, prefijo de bandera mexicana (`🇲🇽 +52`) y tarjetas interactivas de selección.
- **Scroll Responsivo:** Modales con encabezado y botones de acción fijos, cuerpo central con `overflow-y: auto`, `max-height: calc(100vh - 2.5rem)` y desplazamiento táctil suave (`-webkit-overflow-scrolling: touch`), garantizando que nunca se corten botones en pantallas pequeñas, laptops o celulares.

### J. Pruebas y Compilación
- **Tests de Backend (PHPUnit / Pest):** `11 passed (148 assertions)` sin ningún error.
- **Compilación Angular:** `Application bundle generation complete` con 0 errores.
- **Despliegues en Producción:** Todo sincronizado en GitHub `origin main`.

---

## 3. Hoja de Ruta / Mejoras Propuestas para Continuar Mañana en la Oficina

A continuación se listan las mejoras analizadas y recomendadas para implementar en la siguiente sesión de trabajo:

### 🛵 Fase 1: Operación Rápida y Ahorro de Tiempo (Prioridad Alta)
1. **Botón de WhatsApp "🛵 En camino":**
   - Mensaje de 1 solo clic en la tarjeta del pedido para avisar al cliente:
     *«¡Hola [Nombre]! Tu pedido ya va en camino hacia tu domicilio. Llegamos en aproximadamente 15-20 minutos. ¡Ten tu pago listo! 🌮»*
2. **Botón de WhatsApp "✅ Entregado":**
   - Mensaje de agradecimiento automático que invita al cliente a calificar el servicio o dejar una reseña en Google Maps.
3. **Formato para Impresora Térmica (Tickets de rollo 58mm / 80mm):**
   - Botón de impresión directa tipo comanda de rollo para grapar a las bolsas de entrega y para el comalero, sin descargar hojas tamaño carta.
4. **Alerta Sonora de Pedidos Próximos:**
   - Notificación sonora tipo chime cuando falten 30 o 45 minutos para la hora de entrega de un pedido agendado.

### 🌮 Fase 2: Ventas y Autoservicio
5. **Menú Digital Web para Clientes (`pedidos.taqueriamary.com` o link público):**
   - Un catálogo en línea donde los clientes armen su pedido desde su celular, elijan su dirección en el mapa y envíen el pedido directo al sistema o por WhatsApp, liberando al dueño de capturar manualmente.
6. **Difusión de Promociones a Clientes Frecuentes:**
   - Módulo para enviar ofertas especiales del día (ej. *Viernes de Consomé*) a clientes que han comprado en las últimas semanas.
7. **Programa de Cliente Frecuente (Tacos o Puntos Acumulados):**
   - Contador de pedidos por cliente con recompensas automáticas al llegar a 10 pedidos.

### 📊 Fase 3: Control Financiero y Producción de Cocina
8. **Corte de Caja Diario y Turno:**
   - Resumen al cierre de jornada: Total cobrado en Efectivo vs Transferencia/Tarjeta.
   - **Conteo exacto para producción de cocina:** Cuántos tacos de barbacoa, papa, frijol o requesón se vendieron en el día para saber cuántos kilos de carne y masa preparar para el día siguiente sin merma.
9. **Modo Pantalla de Cocina / KDS:**
   - Vista en tablet o pantalla para cocina donde solo se ven guisos, cantidades y notas (sin precios ni datos de cobro), con botón grande de "Preparado".

### 🔒 Fase 4: Seguridad y Respaldo
10. **Respaldo Automático de Base de Datos:**
    - Cron diario que envíe una copia de seguridad de la base de datos SQLite a un correo o almacenamiento en la nube para garantizar cero pérdidas de información.
