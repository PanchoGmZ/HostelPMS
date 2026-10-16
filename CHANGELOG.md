# Changelog — Pata y Perro PMS

## v1.20
Fecha: 2026-10-16

### Fase 5 — Check-out Retroactivo y Estadías Vencidas
- **Check-out Retroactivo**: El modal de Check-out ahora permite registrar la salida real incluso si ocurrió días atrás. Fecha inicial automática: si la estadía ya venció, se pre-carga la fecha prevista de salida (no la de hoy), facilitando la operación correcta.
- **Sin bloqueo por deuda ni por fecha vencida**: El backend ya no rechaza el check-out cuando el folio tiene saldo pendiente (el cobro se gestiona en el frontend mediante `IntegratedPayment`). La fecha elegida puede ser retroactiva sin necesidad de extender primero.
- **Distinción clara de casos**: El modal distingue entre (a) salida retroactiva dentro del rango previsto (aviso informativo), y (b) fecha elegida posterior a la prevista (ofrece Extender estadía).
- **Extensión Retroactiva (Regularización)**: El modal `ExtendStayModal` ahora acepta estadías vencidas, mostrando un aviso de regularización. El mínimo de nueva fecha es el día siguiente al previsto (puede ser en el pasado).
- **Estadías Vencidas Visibles**: Las estadías vencidas se destacan con badge rojo en Recepción, Estadías y el panel `DashboardStaysPanel`, con acciones directas de Cobrar, Extender y Registrar salida atrasada.
- **Panel de Salidas ampliado**: `DeparturesPanel` ahora muestra estadías con salida vencida (no solo las de hoy), con badge "Vencida" por fila.
- **`DashboardStaysPanel` mejorado**: Nuevo filtro "Vencidas", contador de estadías vencidas, y botones de acción directa (Extender / Check-out) para estadías vencidas.
- **`GuestStayDrawer` mejorado**: Badge y kicker de "Estadía Vencida" para estadías activas con fecha superada; botón "Extender Estadía ⚠" prominente.
- **Preservación de cargos históricos**: No se crean ni eliminan cargos automáticamente por registrar salida tardía. Cualquier ajuste es explícito mediante Extensión.
- **Disponibilidad y summaries**: El checkout retroactivo libera la disponibilidad y regenera daily summaries para las fechas afectadas, sin tocar ocupaciones de otros huéspedes.

### Fase 2 — Prevención de Reservas Duplicadas y Cambio de Cama
- **Idempotencia de Creación**: Clave `idempotencyKey` (UUID por sesión) que impide la creación de reservas duplicadas ante doble clic o reintentos de red.
- **Guardia de Doble Envío (Frontend)**: `isSubmittingRef` en `WalkInModal` y `NewReservationModal` bloquea el segundo envío simultáneo antes de contactar el backend.
- **Cambio de Cama con Fecha Editable**: La operación de cambio de cama pasa la fecha actual por defecto y permite retroactividad con validación de disponibilidad.
- **Historial de Disponibilidad**: La disponibilidad de camas/habitaciones refleja cambios en tiempo real para evitar conflictos de asignación.

### Fase 3 — Tarifas Flexibles y Formularios Numéricos
- **Tarifas Normales Editables**: El administrador puede modificar la tarifa base de habitaciones y camas (`basePriceRoom`, `basePriceBed`, `priceByGuestCount`) sin afectar reservas ni folios históricos.
- **Precio Negociado por Operación**: En Walk-in, Nueva Reserva, Extensión y Modificación, el recepcionista puede establecer un precio por noche o total diferente a la tarifa catálogo. El PMS lo registra como `pricingMode: 'manual'` con traza auditada.
- **Distribución Exacta de Centavos**: El total pactado (`manualTotalAmount`) se distribuye entre noches por división entera de centavos (`floor + remainder`), garantizando que la suma sea exactamente el total acordado (sin errores de coma flotante).
- **Tarifas Privadas por Huéspedes**: Habitaciones privadas usan `priceByGuestCount` para escalonar el precio según la ocupación.
- **Inputs Numéricos sin Ceros Iniciales**: Nuevo componente `NumericInput` que elimina `0250 → 250`, permite el campo vacío durante edición y normaliza al desenfocar.
- **Precios Históricos Congelados**: Las reservas, folios y cierres de caja anteriores quedan inmutables al cambiar tarifas generales.

### Fase 4 — Modales Arrastrables
- **Hook `useDraggableModal`**: Implementación de arrastre por referencia DOM sin dependencias externas. Activo en desktop (hover+pointer:fine), desactivado en móviles/touch.
- **Arrastre desde el Encabezado**: Todos los modales principales permiten reposicionamiento arrastrando el `modal-header`. Los botones e inputs internos no interfieren con el arrastre.
- **Clamping de Viewport**: El modal no puede arrastrase más allá de los límites de la pantalla (margen mínimo de 8 px en todos los lados).
- **Scroll Interno Preservado**: El formulario mantiene `overflow-y: auto` y el `max-height` se recalcula al arrastrar.
- **Modales Cubiertos**: WalkInModal, CheckInModal, NewReservationModal, ModifyReservationModal, ExtendStayModal, PaymentModal, CheckoutModal, ChangeRoomModal.

## v1.19.1

Fecha: 2026-10-12

- **Corrección Transaccional en Check-in y Walk-in (`checkInGuest`)**: Reorganización estricta de la transacción Firestore en dos fases (lecturas completas previas antes de cualquier escritura), resolviendo el error fatal `Firestore transactions require all reads to be executed before all writes`.
- **Saneamiento de `allocations` en Pagos (`recordPayment`, `recordRefund`, `extendStay`)**: Eliminación de propiedades `undefined` en objetos de pago y saneamiento de registros históricos, corrigiendo el error `Cannot use undefined as a Firestore value (found in field payments.X.allocations)`.
- **Cobro y Registro desde Folios y Dashboard (`PaymentModal`, `IntegratedPayment`, `FoliosPage`)**: Corrección del cálculo de saldo deudor negativo (`Math.max(0, -folio.balance)`), soporte para liquidación total y cobro parcial con input único en BOB, e integración directa con el endpoint real de backend capturando mensajes de error auténticos.
- **Resiliencia y Reintento en Walk-in (`WalkInModal`)**: Conservación del ID de reserva y huéspedes creados si el check-in falla posteriormente, permitiendo reintentar el check-in con la misma reserva sin duplicar huéspedes ni bloquear camas innecesariamente.
- **Prevención de Doble Envío**: Adición de guardas de referencia (`isSubmittingRef`) en modales de Check-in, Walk-in, Cobro y Extensión de Estadía.

## v1.19
Fecha: 2026-10-08

- **Control Financiero por Noches**: Motor puro de cálculo (`calculateNightlyStatus`) que determina noches reservadas, noches cubiertas, fecha cubierta ("Pagado hasta"), noches iniciadas adeudadas, noches futuras pactadas y desgloses de saldo en tiempo real.
- **Asignaciones de Pago (`allocations`)**: Persistencia y validación backend en centavos enteros para clasificar cobros entre hospedaje, consumos u otros, evitando duplicidades y descuadres en el Folio.
- **Control de Noches en Dashboard Operativo**: Acceso directo desde el panel operativo (`DashboardStaysPanel` y `NightlyPaymentOverview`) para visualizar noches cubiertas y registrar pagos sin fricción.
- **Idempotencia Transaccional en Pagos**: Claves idempotentes (`idempotencyKey`) en transacciones de Folio y Caja (`recordPayment`, `CheckoutModal`, `PaymentModal`, `ExtendStayModal`) para prevenir dobles cobros ante reintentos de red.
- **Tratamiento Seguro de Depósitos**: Corrección en `checkInGuest` para transferir depósitos previos sin duplicar ingresos en la sesión de caja activa.

## v1.18
Fecha: 2026-10-08

- **Cobro Integrado en Recepción**: Experiencia unificada de pagos en Walk-in, Check-in y Checkout mediante el nuevo componente `IntegratedPayment`.
- **Simplificación de pagos en BOB**: Eliminación del doble campo numérico (Monto Aplicado vs Monto Recibido) cuando la divisa es Bolivianos, previniendo errores de tipeo y descuadres.
- **Normalización Numérica**: Los campos numéricos corrigen formato (elimina ceros iniciales como `01000`) automáticamente al perder foco.
- **Opciones de Cobro unificadas**: Selección rápida entre 'Cobrar todo', 'Pago parcial' y 'Dejar pendiente' durante el alojamiento o salida.

## v1.17.1
Fecha: 2026-10-06

- Acciones de estadía visibles directamente desde Recepción y Estadías.
- Acceso a Cambio de habitación/cama.
- Acceso directo a Extender estadía.
- Acciones financieras y Check-out más accesibles y funcionales, corrigiendo la visibilidad del pago integrado por falta del turno de caja en la página Estadías.
## v1.17
Fecha: 2026-10-06

- **Check-in integrado con pagos**: Permite pagar en efectivo o transferencia inmediatamente sin necesidad de salir del modal (requiere turno de caja).
- **Check-out inteligente**: Modal muestra la deuda completa; permite pagar la deuda allí mismo. Guardián bloquea check-out si es fecha tardía e insta a extender estadía.
- **Extensión de Estadía Controlada**: Nuevo modal que añade cargo transaccional `lodging_extension`, respetando la historia financiera.
- **Cambio de Habitación/Cama Transaccional**: UI para cambiar de cuarto; genera `movement` histórico, libera la disponibilidad anterior y bloquea la nueva, permitiendo incluso cambios retroactivos o inmediatos.
- **Regeneración retroactiva de summaries**: Si un Check-out o Cambio de Cama se hace con fechas pasadas, el sistema recalcula los Daily Summaries para mantener 100% de coherencia en los reportes de ocupación.
- **Historial de Movimientos**: Panel de eventos (creación, cambio de cuarto, extensión) visible dentro de la vista `GuestStayDrawer`.
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
