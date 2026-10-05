# Changelog — Pata y Perro PMS

## v1.16
Fecha: 2026-10-05

- Hospedaje registrado correctamente como cargo de Folio.
- Saldo pendiente incluye alojamiento y consumos.
- Checkout utiliza deuda completa.
- Reportes separan facturación de cobros.
- Nuevas métricas de hospedaje y deuda.
- Herramientas seguras de auditoría/backfill histórico.

## v1.15
Fecha: 2026-10-05

- Registro múltiple de huéspedes dentro de Reservas.
- Registro múltiple de huéspedes en Walk-in.
- Acompañantes pueden registrarse sin abandonar el flujo.
- Reserva rápida permite completar grupos durante Check-in.
- Componente reutilizable GuestInlineForm (sin duplicar schemas ni reglas).
- MultiGuestSection con acordeones para registro de grupos.
- Buscar existente o registrar nuevo por cada persona del grupo.
- Validaciones compartidas entre GuestModal y formularios inline.

## v1.14
Fecha: 2026-10-02

- Nueva visualización gráfica de camas.
- Estados de disponibilidad identificables por color y etiqueta.
- Habitaciones y Dashboard usan el mismo mapa visual.
- Mejor visualización de habitaciones privadas completas.
- Gestión de camas más compacta e intuitiva.

## v1.13
Fecha: 2026-10-02

- Rediseño completo de Reportes.
- Nuevas métricas operativas.
- Gráficos reales de ingresos y ocupación.
- Pagos agrupados por moneda.
- Distribución por canal y método de pago.
- Ocupación por habitación.
- Métricas de nacionalidad y duración de estadía.
- Exportación PDF actualizada.

## v1.12
Fecha: 2026-09-30

- Registro retroactivo de ingresos (check-in / walk-in).
- Walk-in permite seleccionar fecha real de ingreso anterior a hoy.
- Validación histórica de disponibilidad server-side para todo el rango retroactivo.
- Cobros y noches calculados desde la fecha real de ingreso.
- Reportes respetan fecha real (checkInDate) sin manipular createdAt.
- Auditoría: createdAt refleja cuándo se cargó al PMS, checkInDate la fecha real.
- Check-in de reservas existentes preserva la fecha original de la reserva.
- Indicadores visuales claros para operaciones retroactivas.

## v1.11
Fecha: 2026-09-29

- Reserva rápida sin ficha completa.
- Datos del huésped pueden completarse al check-in.
- Vinculación posterior con huésped registrado.

## v1.10
Fecha: 2026-09-24

- Ajuste de campos obligatorios y opcionales en registro de huéspedes.
- WhatsApp, email, contacto de emergencia y notas ahora son opcionales.
- Validación unificada entre Huéspedes y Nueva Reserva.
## v1.9
Fecha: 2026-09-24

- Paridad de interfaz en la pantalla principal de Reservas, unificando el modal de creación con el Dashboard.
- Botón y Modal de confirmación "Eliminar reserva" (soft-delete, libera camas y preserva historia).
- Flujo de Nuevo Huésped inline dentro de la ventana de Nueva Reserva.
- Campo de Precio Acordado (total de reserva) para recalculo inteligente de tarifa por noche sin requerir matemáticas manuales.

## v1.8
Fecha: 2026-09-24

- Registro explícito de moneda recibida (USD, EUR, BOB, etc.) en Folios de Check-in y movimientos de caja.
- Resumen y desglose de caja por divisa al cerrar turno.
- Refactor para asegurar persistencia en variables de estado sin generar errores en cierres de turno.
## v1.7
Fecha: 2026-09-22

- Corregido error de Walk-in por `guestCount` indefinido (causa del 500 en Firestore).
- Walk-in y reservas permiten tarifa 0 BOB (voluntariado, cortesía, acuerdos especiales).
- Soporte explícito para `pricingMode: standard | manual` en backend.
- Nuevo botón **Modificar Reserva** (página Reservas y Kanban de Llegadas).
- Modificación segura de precios antes del check-in con recalculo server-side.
- Historial de modificaciones guardado en subcollección `history` de cada reserva.
- Mejoras en validación de precios — precio 0 es válido en todos los flujos.
- Documentos alfanuméricos (ej. AT117122) funcionan correctamente.
- Consola: `Pata y Perro PMS — v1.7`

## v1.6
Fecha: 2026-09-17

- Implementada lógica de venta completa para habitaciones privadas (`full_room`).
- La configuración de habitaciones privadas incluye cantidad máxima de huéspedes y tarifa según cantidad de ocupantes.
- En una reserva de habitación privada, todas las camas se bloquean automáticamente.
- UI rediseñada en Walk-in y Reservas para habitaciones privadas, pidiendo cantidad de ocupantes y acompañantes de forma nativa.
- Dashboard Operativo consolidado para las llegadas y salidas de habitaciones privadas.
- Persistencia estricta del histórico de `guestCount` e IDs en los modelos Reservation y Stay.
- Cálculos y validaciones de comisiones transferidos y blindados al backend.

## v1.0
Fecha: 2026-09-17

- Versión inicial de producción.
- PMS desplegado y operativo.
- Reservas, estadías, habitaciones, huéspedes, folios, POS, inventario, caja y reportes funcionando.
- Backend migrado a Netlify Functions.
- Base Firestore preparada con datos reales del hostel.
- 10 habitaciones y 28 camas configuradas.
- Cuentas administrativas creadas.

## v1.5
Fecha: 2026-09-17

- Se agregó campo de comisión manual para plataformas (Booking/Airbnb) al crear reservas.
- La comisión se aplica como un markup al precio base, sumándose al total de la reserva y reflejándose automáticamente en el saldo del huésped y los reportes.

## v1.4
Fecha: 2026-09-17

- Configuración adaptada a móvil.
- Gestión de promociones habilitada.
- Creación, edición y activación de promociones.

## v1.3
Fecha: 2026-09-17

- Responsive de Huéspedes.
- Responsive de Inventario.
- Responsive de Reportes.
- Exportación de reportes a PDF.

## v1.2
Fecha: 2026-09-17

- Responsive de Caja y Turnos.
- Responsive de Reservas.
- Responsive de Folios.
- Botón “Nuevo movimiento” de Folios conectado a acciones financieras válidas.

## v1.1
Fecha: 2026-09-17

- Menú responsive/sidebar móvil.
- Navegación móvil corregida.
- Versión de aplicación visible en consola.
