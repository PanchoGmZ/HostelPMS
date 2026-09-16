import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowDownAZ,
  BedDouble,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Eye,
  Filter,
  Lock,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'

import { useAuth } from '../../context/useAuth'
import { checkInGuest, checkOutGuest, listStays } from '../../services/stays/staysService'
import { listRooms } from '../../services/rooms/roomsService'
import { searchGuests } from '../../services/guests/guestsService'
import { listReservations } from '../../services/reservations/reservationsService'
import { checkInSchema } from '../../schemas/staysSchema'
import type { Stay, StayStatus } from '../../types/stays'
import type { Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation } from '../../types/reservations'
import './StaysPage.css'

function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getTodayString(): string {
  return toLocalDateString(new Date())
}

function getTomorrowString(fromDateStr?: string): string {
  const base = fromDateStr ? new Date(`${fromDateStr}T00:00:00`) : new Date()
  base.setDate(base.getDate() + 1)
  return toLocalDateString(base)
}

function formatDate(value?: { seconds: number } | null) {
  if (!value?.seconds) return '-'
  return new Date(value.seconds * 1000).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDayMonthYearSplit(value?: { seconds: number } | null) {
  if (!value?.seconds) return { dayMonth: '-', year: '' }
  const d = new Date(value.seconds * 1000)
  return {
    dayMonth: d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }),
    year: d.getFullYear().toString()
  }
}

function formatDateTime(value?: { seconds: number } | null) {
  if (!value?.seconds) return '-'
  return new Date(value.seconds * 1000).toLocaleString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StaysPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [stays, setStays] = useState<Stay[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | StayStatus>('active')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [selectedStayDetail, setSelectedStayDetail] = useState<Stay | null>(null)
  const [stayToCheckout, setStayToCheckout] = useState<Stay | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [nextStays, nextRooms, nextGuests, nextReservations] = await Promise.all([
        listStays(establishmentId),
        listRooms(establishmentId),
        searchGuests(establishmentId, ''),
        listReservations(establishmentId),
      ])
      setStays(nextStays)
      setRooms(nextRooms)
      setGuests(nextGuests)
      setReservations(nextReservations)
    } catch {
      setError('No se pudieron cargar las estadías. Verifica tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredStays = useMemo(() => {
    return stays.filter((stay) => {
      const matchesStatus = statusFilter === 'all' || stay.status === statusFilter
      const primaryGuest = guests.find((g) => stay.guestIds.includes(g.id))
      const room = rooms.find((r) => r.id === stay.roomId)
      const q = searchQuery.toLowerCase().trim()
      const matchesQuery =
        q === '' ||
        stay.id.toLowerCase().includes(q) ||
        (primaryGuest && `${primaryGuest.firstName} ${primaryGuest.lastName}`.toLowerCase().includes(q)) ||
        (primaryGuest && primaryGuest.documentNumber?.toLowerCase().includes(q)) ||
        (room && room.name.toLowerCase().includes(q))
      return matchesStatus && matchesQuery
    })
  }, [stays, statusFilter, searchQuery, guests, rooms])

  const confirmCheckOut = async () => {
    if (!stayToCheckout || !establishmentId) return
    setCheckingOut(true)
    setError(null)
    try {
      await checkOutGuest({
        establishmentId,
        stayId: stayToCheckout.id,
      })
      setSuccessMessage('Check-out procesado exitosamente.')
      setStayToCheckout(null)
      setSelectedStayDetail(null)
      void load()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error al procesar check-out'
      setError(
        `No se pudo completar el Check-out: ${errMsg}. Nota: La Cloud Function 'checkOutGuest' debe estar desplegada en el backend.`
      )
      setStayToCheckout(null)
    } finally {
      setCheckingOut(false)
    }
  }

  const activeStaysCount = stays.filter((s) => s.status === 'active').length

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <CircleAlert size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento activo para controlar estadías.</p>
      </div>
    )
  }

  return (
    <div className="stays-page-container">
      {/* Header */}
      <header className="stays-top-header-wrapper">
        <div>
          <div className="stays-breadcrumb-row">
            <span className="breadcrumb-muted">HUÉSPEDES ALOJADOS</span>
            <span className="breadcrumb-dot">•</span>
            <span className="breadcrumb-active-pill">
              <span className="dot" /> {activeStaysCount} Activas ahora
            </span>
          </div>
          <h1>Estadías</h1>
          <p>Flujo de estadía: Reserva → Check-in → <strong>Estadía activa</strong> → Check-out</p>
        </div>
        <button
          className="btn-checkin"
          type="button"
          onClick={() => setShowCheckInModal(true)}
        >
          <LogIn size={18} />
          Realizar Check-in
        </button>
      </header>

      {error && (
        <div className="form-error">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success">
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      {/* Banner Sincronización */}
      <div className="stays-sync-banner">
        <div className="stays-sync-banner-content">
          <span className="sync-shield-icon-stays">
            <ShieldCheck size={20} />
          </span>
          <div className="stays-sync-texts">
            <strong>Validación y Procesamiento Seguro</strong>
            <span>Las transacciones de check-in y check-out son procesadas y validadas por el backend (Cloud Functions).</span>
          </div>
        </div>
        <span className="sync-atomic-badge">
          <Lock size={12} /> Transacción atómica
        </span>
      </div>

      {/* Toolbar */}
      <div className="stays-toolbar-row">
        <div className="stays-search-box">
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Buscar por huésped, doc o habitación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="stays-filters-group">
          <div className="stays-filter-select-wrapper">
            <Filter size={14} color="#64748b" />
            <label style={{ margin: '0 4px', fontSize: 13 }}>Estado:</label>
            <select
              className="stays-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | StayStatus)}
            >
              <option value="active">Activas ({activeStaysCount})</option>
              <option value="checked_out">Finalizadas (Check-out)</option>
              <option value="all">Todas las estadías</option>
            </select>
          </div>
          <button className="btn-recents" type="button">
            <ArrowDownAZ size={14} /> Recientes
          </button>
        </div>
      </div>

      {/* Listado de Estadías */}
      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando estadías...
        </div>
      ) : stays.length === 0 ? (
        <div className="empty-state compact">
          <CalendarCheck size={32} />
          <h2>No hay estadías registradas</h2>
          <p>Realiza un check-in desde una reserva confirmada o walk-in para iniciar una estadía.</p>
        </div>
      ) : filteredStays.length === 0 ? (
        <div className="empty-state compact">
          <Search size={28} />
          <h2>Sin resultados</h2>
          <p>No se encontraron estadías con el filtro seleccionado.</p>
        </div>
      ) : (
        <div className="stays-list-container">
          {filteredStays.map((stay) => {
            const primaryGuest = guests.find((g) => stay.guestIds.includes(g.id))
            const room = rooms.find((r) => r.id === stay.roomId)
            const bedLabels = room?.beds
              .filter((b) => stay.bedIds.includes(b.id))
              .map((b) => b.label)
              .join(', ')

            const checkIn = formatDayMonthYearSplit(stay.checkInDate)
            
            // Determinar si mostrar fecha de salida prevista o real
            const outDateSource = stay.status === 'checked_out' ? stay.actualCheckOutDate : stay.expectedCheckOutDate
            const checkOut = formatDayMonthYearSplit(outDateSource)

            // Calcular noches
            const tIn = stay.checkInDate?.seconds ? stay.checkInDate.seconds * 1000 : 0
            const tOut = outDateSource?.seconds ? outDateSource.seconds * 1000 : 0
            const diffDays = tIn && tOut ? Math.max(1, Math.ceil((tOut - tIn) / (1000 * 3600 * 24))) : 1

            return (
              <article
                className={`stay-item-card ${stay.status !== 'active' ? 'is-inactive-card' : ''}`}
                key={stay.id}
              >
                {/* Izquierda: Huésped info */}
                <div className="stay-item-guest-col">
                  <div className="stay-icon-box">
                    <BedDouble size={24} />
                  </div>
                  <div className="stay-guest-info">
                    <div className="stay-guest-name-row">
                      <span className="stay-guest-name">
                        {primaryGuest ? `${primaryGuest.firstName} ${primaryGuest.lastName}` : 'Huésped sin identificar'}
                        {stay.guestIds.length > 1 && ` (+${stay.guestIds.length - 1})`}
                      </span>
                      <span
                        className={`stay-status-pill ${
                          stay.status === 'active' ? 'status-active' : 'status-inactive'
                        }`}
                      >
                        <span className="dot" /> {stay.status === 'active' ? 'Activa' : 'Finalizada'}
                      </span>
                    </div>
                    <div className="stay-guest-subinfo">
                      <span className="room-name">
                        Hab. {room?.name ?? stay.roomId}
                      </span>
                      {bedLabels && (
                        <>
                          <span className="dot-sep">•</span>
                          <span className="bed-name">Camas: {bedLabels}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Medio: Fechas y noches */}
                <div className="stay-item-dates-col">
                  <div className="date-block">
                    <small>
                      <Calendar size={13} /> CHECK-IN
                    </small>
                    <strong>
                      {checkIn.dayMonth}<br />{checkIn.year}
                    </strong>
                  </div>

                  <div className="nights-bubble">
                    <span className="nights-bubble-text">{diffDays} noches</span>
                    <ChevronRight size={14} />
                  </div>

                  <div className="date-block">
                    <small>
                      <Calendar size={13} /> {stay.status === 'checked_out' ? 'SALIDA REALIZADA' : 'SALIDA PREVISTA'}
                    </small>
                    <strong>
                      {checkOut.dayMonth}<br />{checkOut.year}
                    </strong>
                  </div>
                </div>

                {/* Derecha: Acciones */}
                <div className="stay-item-actions-col">
                  <button
                    className="btn-detalle"
                    type="button"
                    title="Ver detalle"
                    onClick={() => setSelectedStayDetail(stay)}
                  >
                    <Eye size={16} /> Detalle
                  </button>
                  <button className="btn-folio" type="button" disabled>
                    Folio & Consumos
                  </button>

                  {stay.status === 'active' && (
                    <button
                      className="btn-checkout"
                      type="button"
                      title="Realizar check-out"
                      onClick={() => setStayToCheckout(stay)}
                    >
                      <LogOut size={16} /> Check-out
                      <span className="btn-subtext">Finalizar</span>
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="stays-page-footer">
        <div>
          Mostrando <strong>{filteredStays.length}</strong> estadía{filteredStays.length !== 1 ? 's' : ''}{' '}
          {statusFilter === 'active' ? 'activas' : ''} registrada{filteredStays.length !== 1 ? 's' : ''}
        </div>
        <div className="stays-footer-links">
          <span className="stable-badge">
            <span className="green-dot" /> Sincronizado con Cloud Functions
          </span>
        </div>
      </footer>

      {/* Modal de Check-In */}
      {showCheckInModal && (
        <CheckInModal
          establishmentId={establishmentId}
          rooms={rooms}
          guests={guests}
          reservations={reservations.filter((r) => r.status === 'confirmed')}
          onClose={() => setShowCheckInModal(false)}
          onSaved={() => {
            setShowCheckInModal(false)
            setSuccessMessage('Check-in completado exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal de Detalle de Estadía */}
      {selectedStayDetail && (
        <StayDetailModal
          stay={selectedStayDetail}
          rooms={rooms}
          guests={guests}
          reservations={reservations}
          onClose={() => setSelectedStayDetail(null)}
          onCheckOutRequest={(stay) => {
            setStayToCheckout(stay)
          }}
        />
      )}

      {/* Modal de Confirmación de Check-Out */}
      {stayToCheckout && (
        <div className="modal-backdrop">
          <div className="modal-form" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <span className="kicker" style={{ color: 'var(--coral)' }}>Finalizar estadía</span>
                <h2>Confirmar Check-out</h2>
              </div>
              <button type="button" onClick={() => setStayToCheckout(null)}>
                <X size={19} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
              ¿Deseas registrar el Check-out para el huésped{' '}
              <strong>
                {guests.find((g) => stayToCheckout.guestIds.includes(g.id))?.firstName ?? 'titular'}
              </strong>
              ? Se liberará(n) la(s) cama(s) en la recepción.
            </p>
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setStayToCheckout(null)}
                disabled={checkingOut}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ background: 'var(--coral)' }}
                onClick={confirmCheckOut}
                disabled={checkingOut}
              >
                {checkingOut ? 'Procesando...' : 'Confirmar Check-out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface CheckInModalProps {
  establishmentId: string
  rooms: Room[]
  guests: Guest[]
  reservations: Reservation[]
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function CheckInModal({
  establishmentId,
  rooms,
  guests,
  reservations,
  onClose,
  onSaved,
  onError,
}: CheckInModalProps) {
  const [selectedResId, setSelectedResId] = useState<string>('')
  const [guestId, setGuestId] = useState<string>(guests[0]?.id ?? '')
  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? '')
  const [beds, setBeds] = useState<string[]>([])
  const [expectedCheckOut, setExpectedCheckOut] = useState<string>(getTomorrowString())
  const [deposit, setDeposit] = useState<number>(0)
  const [documentVerified, setDocumentVerified] = useState<boolean>(true)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const room = rooms.find((r) => r.id === roomId)
  const eligibleBeds = useMemo(() => {
    return room?.beds.filter((b) => b.status === 'active') ?? []
  }, [room])

  // When a reservation is selected, auto-fill fields
  useEffect(() => {
    if (!selectedResId) return
    const res = reservations.find((r) => r.id === selectedResId)
    if (res) {
      if (res.primaryGuestId) setGuestId(res.primaryGuestId)
      if (res.roomId) setRoomId(res.roomId)
      if (res.bedIds && res.bedIds.length > 0) setBeds(res.bedIds)
      if (res.checkOutDate?.seconds) {
        setExpectedCheckOut(toLocalDateString(new Date(res.checkOutDate.seconds * 1000)))
      }
    }
  }, [selectedResId, reservations])

  const toggleBed = (bedId: string) => {
    setBeds((prev) => (prev.includes(bedId) ? prev.filter((id) => id !== bedId) : [...prev, bedId]))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!selectedResId) {
      setFormError('Debes seleccionar una reserva confirmada. Para walk-ins, primero crea la reserva en el módulo Reservas.')
      return
    }

    if (!guestId) {
      setFormError('Selecciona un huésped para el check-in.')
      return
    }

    if (!roomId || beds.length === 0) {
      setFormError('Selecciona una habitación y al menos una cama asignada.')
      return
    }

    const validation = checkInSchema.safeParse({
      reservationId: selectedResId,
      guestIds: [guestId],
      roomId,
      bedIds: beds,
      expectedCheckOutDate: expectedCheckOut,
      deposit: Number(deposit),
      documentVerified,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de check-in inválidos.')
      return
    }

    setSubmitting(true)
    try {
      await checkInGuest({
        establishmentId,
        reservationId: selectedResId,
        guestIds: [guestId],
        roomId,
        bedIds: beds,
        expectedCheckOutDate: expectedCheckOut,
        deposit: Number(deposit),
        documentVerified,
      })
      onSaved()
    } catch {
      const msg =
        'El Check-in no pudo procesarse. La Cloud Function "checkInGuest" debe ser ejecutada por el backend server-side.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '520px', width: '90%' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Recepción</span>
            <h2>Procesar Check-in</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        {/* Vincular Reserva Confirmada (Obligatoria para Backend) */}
        <label style={{ background: '#f4f8f6', padding: '10px', borderRadius: '6px', border: '1px solid #cce3d8' }}>
          <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 700 }}>
            Reserva Confirmada (Obligatoria)
          </span>
          <select
            value={selectedResId}
            onChange={(e) => setSelectedResId(e.target.value)}
            required
          >
            <option value="">Selecciona una reserva confirmada...</option>
            {reservations
              .filter((r) => r.status === 'confirmed')
              .map((r) => {
                const g = guests.find((item) => item.id === r.primaryGuestId)
                return (
                  <option key={r.id} value={r.id}>
                    Reserva #{r.id.slice(0, 6)} · {g ? `${g.firstName} ${g.lastName}` : 'Huésped'} ({formatDate(r.checkInDate)})
                  </option>
                )
              })}
          </select>
          {reservations.filter((r) => r.status === 'confirmed').length === 0 && (
            <small style={{ color: 'var(--coral)', display: 'block', marginTop: '4px', fontSize: '11px' }}>
              No hay reservas confirmadas disponibles. Crea primero la reserva en el módulo Reservas.
            </small>
          )}
        </label>


        {/* Huésped */}
        <label>
          Huésped Titular
          <select value={guestId} onChange={(e) => setGuestId(e.target.value)} required>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.firstName} {g.lastName} {g.documentNumber ? `(Doc: ${g.documentNumber})` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* Habitación y Camas */}
        <label>
          Habitación asignada
          <select
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value)
              setBeds([])
            }}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.type === 'dorm' ? 'Compartida' : 'Privada'})
              </option>
            ))}
          </select>
        </label>

        <div className="bed-choice" style={{ display: 'grid', gap: '6px' }}>
          <span className="eyebrow">Camas a ocupar</span>
          <div style={{ display: 'grid', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
            {eligibleBeds.map((bed) => (
              <label key={bed.id} className="bed-check">
                <input
                  type="checkbox"
                  checked={beds.includes(bed.id)}
                  onChange={() => toggleBed(bed.id)}
                />
                {bed.label}
              </label>
            ))}
          </div>
        </div>

        {/* Fecha Salida Prevista */}
        <label>
          Salida Prevista
          <input
            type="date"
            min={getTodayString()}
            value={expectedCheckOut}
            onChange={(e) => setExpectedCheckOut(e.target.value)}
            required
          />
        </label>

        {/* Depósito y Documento */}
        <div className="form-row">
          <label>
            Depósito de garantía (BOB)
            <input
              type="number"
              min="0"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '22px' }}>
            <input
              type="checkbox"
              checked={documentVerified}
              onChange={(e) => setDocumentVerified(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span style={{ fontSize: '12px' }}>Documento de identidad verificado</span>
          </label>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting || guests.length === 0}>
            {submitting ? 'Ejecutando Check-in...' : 'Confirmar Check-in'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface StayDetailModalProps {
  stay: Stay
  rooms: Room[]
  guests: Guest[]
  reservations: Reservation[]
  onClose: () => void
  onCheckOutRequest: (stay: Stay) => void
}

function StayDetailModal({
  stay,
  rooms,
  guests,
  reservations,
  onClose,
  onCheckOutRequest,
}: StayDetailModalProps) {
  const room = rooms.find((r) => r.id === stay.roomId)
  const stayGuests = guests.filter((g) => stay.guestIds.includes(g.id))
  const linkedRes = reservations.find((r) => r.id === stay.reservationId)
  const assignedBeds = room?.beds.filter((b) => stay.bedIds.includes(b.id))

  return (
    <div className="modal-backdrop">
      <div className="modal-form" style={{ maxWidth: '520px', width: '90%' }}>
        <div className="modal-header">
          <div>
            <span className="kicker">Detalle de estadía</span>
            <h2>Estadía #{stay.id.slice(0, 8)}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: '14px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper)', padding: '10px 14px', borderRadius: '6px' }}>
            <span>Estado:</span>
            <span
              className="stay-status"
              style={{
                background: stay.status === 'active' ? '#dcece3' : '#eef1f0',
                color: stay.status === 'active' ? '#1b5e30' : '#5a6c66',
              }}
            >
              {stay.status === 'active' ? 'Estadía Activa' : 'Finalizada (Checked-out)'}
            </span>
          </div>

          <div>
            <strong>Huéspedes alojados:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--ink)' }}>
              {stayGuests.length > 0 ? (
                stayGuests.map((g) => (
                  <li key={g.id}>
                    {g.firstName} {g.lastName} {g.documentNumber ? `(Doc: ${g.documentNumber})` : ''}
                  </li>
                ))
              ) : (
                <li>Huésped ID: {stay.guestIds.join(', ')}</li>
              )}
            </ul>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <small style={{ color: 'var(--muted)' }}>Habitación:</small>
              <div><strong>{room?.name ?? stay.roomId}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--muted)' }}>Camas asignadas:</small>
              <div>
                <strong>
                  {assignedBeds && assignedBeds.length > 0
                    ? assignedBeds.map((b) => b.label).join(', ')
                    : stay.bedIds.join(', ')}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <small style={{ color: 'var(--muted)' }}>Fecha de Entrada:</small>
              <div><strong>{formatDateTime(stay.checkInDate)}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--muted)' }}>Salida Prevista:</small>
              <div><strong>{formatDate(stay.expectedCheckOutDate)}</strong></div>
            </div>
          </div>

          {stay.actualCheckOutDate && (
            <div>
              <small style={{ color: 'var(--muted)' }}>Salida Realizada:</small>
              <div><strong>{formatDateTime(stay.actualCheckOutDate)}</strong></div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <small style={{ color: 'var(--muted)' }}>Depósito de garantía:</small>
              <div><strong>{stay.deposit ?? 0} BOB</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--muted)' }}>Documento verificado:</small>
              <div><strong>{stay.documentVerified ? 'Sí ✓' : 'No ✗'}</strong></div>
            </div>
          </div>

          {linkedRes && (
            <div style={{ background: '#f0f4f2', padding: '10px 12px', borderRadius: '6px' }}>
              <small style={{ color: 'var(--muted)' }}>Reserva vinculada:</small>
              <div>
                <strong>Reserva #{linkedRes.id.slice(0, 8)}</strong> ({linkedRes.channel})
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button className="secondary-button" type="button" onClick={onClose}>
            Cerrar
          </button>
          {stay.status === 'active' && (
            <button
              className="primary-button"
              type="button"
              style={{ background: 'var(--coral)' }}
              onClick={() => {
                onClose()
                onCheckOutRequest(stay)
              }}
            >
              <LogOut size={16} /> Realizar Check-out
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
