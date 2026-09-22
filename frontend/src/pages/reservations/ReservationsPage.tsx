import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  BedDouble,
  Building,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Filter,
  Info,
  Plus,
  Search,
  User,
  X,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { listRooms } from '../../services/rooms/roomsService'
import { searchGuests } from '../../services/guests/guestsService'
import { cancelReservation, createReservation, listReservations } from '../../services/reservations/reservationsService'
import { ModifyReservationModal } from '../../components/reception/ModifyReservationModal'
import { createReservationSchema } from '../../schemas/reservationsSchema'
import type { Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation, ReservationStatus } from '../../types/reservations'
import './ReservationsPage.css'

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

function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const d1 = new Date(`${checkIn}T00:00:00`)
  const d2 = new Date(`${checkOut}T00:00:00`)
  const diffTime = d2.getTime() - d1.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

function formatDateDisplay(timestamp?: { seconds: number } | null): string {
  if (!timestamp || !timestamp.seconds) return '-'
  return new Date(timestamp.seconds * 1000).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function ReservationsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [guests, setGuests] = useState<Guest[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [editor, setEditor] = useState(false)
  const [selectedReservationDetails, setSelectedReservationDetails] = useState<Reservation | null>(null)
  const [cancelingReservation, setCancelingReservation] = useState<Reservation | null>(null)
  const [canceling, setCanceling] = useState(false)
  // v1.7: modificar reserva
  const [modifyingReservation, setModifyingReservation] = useState<Reservation | null>(null)

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | ReservationStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [nextReservations, nextRooms, nextGuests] = await Promise.all([
        listReservations(establishmentId),
        listRooms(establishmentId),
        searchGuests(establishmentId, ''),
      ])
      setReservations(nextReservations)
      setRooms(nextRooms)
      setGuests(nextGuests)
    } catch {
      setError('No se pudieron cargar las reservas. Verifica tu conexión con el backend.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredReservations = useMemo(() => {
    return reservations.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const guest = guests.find((g) => g.id === item.primaryGuestId)
      const guestName = guest ? `${guest.firstName} ${guest.lastName}`.toLowerCase() : 'huésped'
      const matchesQuery =
        searchQuery.trim() === '' ||
        guestName.includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesQuery
    })
  }, [reservations, statusFilter, searchQuery, guests])

  const handleCancelClick = (res: Reservation) => {
    setCancelingReservation(res)
  }

  const confirmCancel = async () => {
    if (!cancelingReservation || !establishmentId) return
    setCanceling(true)
    setError(null)
    try {
      await cancelReservation({
        establishmentId,
        reservationId: cancelingReservation.id,
      })
      setSuccessMessage('Reserva cancelada exitosamente.')
      setCancelingReservation(null)
      void load()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido'
      setError(`No se pudo cancelar la reserva: ${errMsg}. Nota: Si la Cloud Function no está desplegada en Blaze, identifícala en el reporte.`)
      setCancelingReservation(null)
    } finally {
      setCanceling(false)
    }
  }

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <CalendarDays size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento activo para ver las reservas.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page reservations-page">
      <header className="page-header">
        <div>
          <span className="kicker">Operación</span>
          <h1>Reservas</h1>
          <p>Gestiona disponibilidad, noches y confirmaciones server-side de recepción.</p>
        </div>
        <button className="primary-button compact-button" type="button" onClick={() => setEditor(true)}>
          <Plus size={18} />
          Nueva reserva
        </button>
      </header>

      {error && <div className="form-error">{error}</div>}
      {successMessage && (
        <div className="stay-notice success">
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="guest-toolbar">
        <div className="toolbar-search">
          <Search size={16} color="var(--muted)" />
          <input
            type="text"
            placeholder="Buscar por huésped o ID de reserva..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-search" style={{ flex: '0 0 auto' }}>
          <Filter size={16} color="var(--muted)" />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ReservationStatus)}
          >
            <option value="all">Todos los estados</option>
            <option value="confirmed">Confirmadas</option>
            <option value="completed">Completadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando reservas...
        </div>
      ) : reservations.length === 0 ? (
        <div className="empty-state compact">
          <CalendarDays size={32} />
          <h2>No hay reservas registradas</h2>
          <p>Las reservas confirmadas por el backend aparecerán aquí.</p>
        </div>
      ) : filteredReservations.length === 0 ? (
        <div className="empty-state compact">
          <Search size={28} />
          <h2>Sin resultados</h2>
          <p>No se encontraron reservas con el filtro aplicado.</p>
        </div>
      ) : (
        <div className="reservations-layout">
          <div>
            <MiniCalendar
              reservations={reservations}
              guests={guests}
              rooms={rooms}
              onSelectReservation={(res) => setSelectedReservationDetails(res)}
            />
          </div>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredReservations.map((reservation) => {
              const guest = guests.find((g) => g.id === reservation.primaryGuestId)
              const room = rooms.find((r) => r.id === reservation.roomId)
              const nights =
                reservation.checkInDate && reservation.checkOutDate
                  ? Math.round(
                      (reservation.checkOutDate.seconds - reservation.checkInDate.seconds) / (60 * 60 * 24)
                    )
                  : 0

              return (
                <article
                  className="reservation-card"
                  key={reservation.id}
                  onClick={() => setSelectedReservationDetails(reservation)}
                  title="Click para ver detalles de la reserva"
                >
                  <div className="res-card-top">
                    <div>
                      <div className="res-card-dates">
                        <span>
                          <CalendarDays size={14} color="var(--muted)" />
                          {formatDateDisplay(reservation.checkInDate)} → {formatDateDisplay(reservation.checkOutDate)}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
                          ({nights} {nights === 1 ? 'noche' : 'noches'})
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={reservation.status} />
                  </div>

                  <div className="res-card-guest">
                    {guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped no asignado'}
                    {guest?.documentNumber && (
                      <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500, marginLeft: '8px' }}>
                        Doc: {guest.documentNumber}
                      </span>
                    )}
                  </div>

                  <div className="res-card-meta">
                    {room && (
                      <span className="res-card-meta-item">
                        <BedDouble size={14} />
                        {room.name} ({reservation.bedIds?.length ?? 0} {reservation.bedIds?.length === 1 ? 'cama' : 'camas'})
                      </span>
                    )}
                  </div>

                  <div className="res-card-bottom">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {reservation.channel && (
                        <span className="res-channel">
                          {reservation.channel}
                        </span>
                      )}
                      {/* v1.7: botón Modificar — solo reservas confirmadas (pre-check-in) */}
                    {reservation.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setModifyingReservation(reservation)
                          }}
                          className="secondary-button compact-button"
                          style={{ padding: '4px 10px', fontSize: '12px', minHeight: 'auto' }}
                        >
                          Modificar
                        </button>
                      )}
                    {reservation.status !== 'cancelled' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCancelClick(reservation)
                          }}
                          className="danger-button compact-button"
                          style={{ padding: '4px 10px', fontSize: '12px', minHeight: 'auto' }}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                    <div className="res-amount">
                      {reservation.totalAmount ?? 0} {reservation.currency ?? 'BOB'}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal Nueva Reserva */}
      {editor && (
        <ReservationModal
          establishmentId={establishmentId}
          rooms={rooms}
          guests={guests}
          onClose={() => setEditor(false)}
          onSaved={() => {
            setEditor(false)
            setSuccessMessage('Reserva creada y confirmada exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Confirmación de Cancelación */}
      {cancelingReservation && (
        <div className="modal-backdrop">
          <div className="modal-form" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <div>
                <span className="kicker" style={{ color: 'var(--coral)' }}>Acción crítica</span>
                <h2>Cancelar reserva</h2>
              </div>
              <button type="button" onClick={() => setCancelingReservation(null)}>
                <X size={19} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
              ¿Estás seguro de que deseas cancelar la reserva de{' '}
              <strong>
                {guests.find((g) => g.id === cancelingReservation.primaryGuestId)?.firstName ?? 'este huésped'}
              </strong>
              ? Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCancelingReservation(null)}
                disabled={canceling}
              >
                Volver
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ background: 'var(--coral)' }}
                onClick={confirmCancel}
                disabled={canceling}
              >
                {canceling ? 'Cancelando...' : 'Sí, cancelar reserva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalles de Reserva (Mini Ventana) */}
      {selectedReservationDetails && (
        <ReservationDetailsModal
          reservation={selectedReservationDetails}
          guest={guests.find((g) => g.id === selectedReservationDetails.primaryGuestId)}
          room={rooms.find((r) => r.id === selectedReservationDetails.roomId)}
          onClose={() => setSelectedReservationDetails(null)}
          onCancelRequest={(res) => {
            setSelectedReservationDetails(null)
            handleCancelClick(res)
          }}
          onModifyRequest={(res) => {
            setSelectedReservationDetails(null)
            setModifyingReservation(res)
          }}
        />
      )}

      {/* v1.7: Modal Modificar Reserva */}
      {modifyingReservation && (
        <ModifyReservationModal
          establishmentId={establishmentId}
          reservation={modifyingReservation}
          guests={guests}
          rooms={rooms}
          onClose={() => setModifyingReservation(null)}
          onSuccess={(msg) => {
            setModifyingReservation(null)
            setSuccessMessage(msg)
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ReservationStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="res-status-badge confirmed">
        <CheckCircle2 size={12} /> Confirmada
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="res-status-badge cancelled">
        <XCircle size={12} /> Cancelada
      </span>
    )
  }
  return (
      <span className="res-status-badge completed">
      <CheckCircle size={12} /> Completada
    </span>
  )
}

function MiniCalendar({
  reservations,
  guests,
  rooms,
  onSelectReservation,
}: {
  reservations: Reservation[]
  guests: Guest[]
  rooms: Room[]
  onSelectReservation?: (res: Reservation) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const today = new Date()

  // Generate calendar grid
  const calendarCells = []
  
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarCells.push({ empty: true })
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d)
    const dayOfWeek = dayDate.getDay()
    
    const dayReservations = reservations.filter(res => {
      if (res.status === 'cancelled') return false
      if (!res.checkInDate || !res.checkOutDate) return false
      
      const inDate = new Date(res.checkInDate.seconds * 1000)
      const outDate = new Date(res.checkOutDate.seconds * 1000)
      
      const dayStart = new Date(year, month, d).getTime()
      const inStart = new Date(inDate.getFullYear(), inDate.getMonth(), inDate.getDate()).getTime()
      const outStart = new Date(outDate.getFullYear(), outDate.getMonth(), outDate.getDate()).getTime()

      return dayStart >= inStart && dayStart < outStart
    })
    
    calendarCells.push({ 
      empty: false, 
      date: dayDate, 
      dayNum: d, 
      dayOfWeek,
      reservations: dayReservations,
      isToday: dayDate.getDate() === today.getDate() && dayDate.getMonth() === today.getMonth() && dayDate.getFullYear() === today.getFullYear()
    })
  }

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <h3>{monthNames[month]} {year}</h3>
        <div className="calendar-nav">
          <button type="button" onClick={prevMonth} className="secondary-button" style={{ padding: '4px', minHeight: 'auto' }}><ChevronLeft size={16} /></button>
          <button type="button" onClick={nextMonth} className="secondary-button" style={{ padding: '4px', minHeight: 'auto' }}><ChevronRight size={16} /></button>
        </div>
      </div>
      
      <div className="calendar-grid">
        {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map(day => (
          <div key={day} className="calendar-day-header">{day}</div>
        ))}
        
        {calendarCells.map((cell, i) => {
          if (cell.empty) return <div key={`empty-${i}`} className="calendar-day other-month"></div>
          
          const hasRes = cell.reservations && cell.reservations.length > 0
          const alignClass =
            cell.dayOfWeek !== undefined && cell.dayOfWeek <= 1
              ? 'align-left'
              : cell.dayOfWeek !== undefined && cell.dayOfWeek >= 5
              ? 'align-right'
              : 'align-center'
          
          return (
            <div
              key={cell.dayNum}
              className={`calendar-day ${cell.isToday ? 'today' : ''} ${hasRes ? 'has-reservations' : ''}`}
              onClick={() => {
                if (hasRes && cell.reservations && cell.reservations.length === 1 && onSelectReservation) {
                  onSelectReservation(cell.reservations[0])
                }
              }}
            >
              {cell.dayNum}
              
              {hasRes && (
                <div className="res-indicators">
                  {cell.reservations!.slice(0, 3).map((res, idx) => (
                    <div key={idx} className={`res-dot ${res.status}`}></div>
                  ))}
                  {cell.reservations!.length > 3 && <span style={{ fontSize: '8px', color: 'var(--teal)', lineHeight: 1 }}>+</span>}
                </div>
              )}

              {hasRes && (
                <div className={`day-tooltip ${alignClass}`}>
                  <div className="day-tooltip-header">
                    <span>{cell.dayNum} de {monthNames[month]}</span>
                    <span className="tooltip-count">
                      {cell.reservations!.length} {cell.reservations!.length === 1 ? 'reserva' : 'reservas'}
                    </span>
                  </div>
                  <div className="tooltip-list">
                    {cell.reservations!.map(res => {
                      const guest = guests.find(g => g.id === res.primaryGuestId)
                      const room = rooms.find(r => r.id === res.roomId)
                      return (
                        <div
                          key={res.id}
                          className="tooltip-item"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectReservation?.(res)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              onSelectReservation?.(res)
                            }
                          }}
                          title="Click para ver detalles"
                        >
                          <div className="tooltip-item-top">
                            <span className="tooltip-item-name">
                              {guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped no asignado'}
                            </span>
                            <span className={`tooltip-status-pill ${res.status}`}>
                              {res.status === 'confirmed' ? 'Conf.' : res.status === 'completed' ? 'Compl.' : 'Canc.'}
                            </span>
                          </div>
                          <div className="tooltip-item-meta">
                            <span>{room?.name || 'Habitación'}</span>
                            <span>·</span>
                            <span className="tooltip-item-price">{res.totalAmount} {res.currency || 'BOB'}</span>
                          </div>
                          <div className="tooltip-item-action">
                            Ver detalle →
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ReservationDetailsModalProps {
  reservation: Reservation
  guest?: Guest
  room?: Room
  onClose: () => void
  onCancelRequest?: (res: Reservation) => void
  onModifyRequest?: (res: Reservation) => void
}

function ReservationDetailsModal({
  reservation,
  guest,
  room,
  onClose,
  onCancelRequest,
  onModifyRequest,
}: ReservationDetailsModalProps) {
  const nights =
    reservation.checkInDate && reservation.checkOutDate
      ? Math.round(
          (reservation.checkOutDate.seconds - reservation.checkInDate.seconds) / (60 * 60 * 24)
        )
      : 0

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-form reservation-details-modal"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="kicker" style={{ margin: 0 }}>Detalle de Reserva</span>
              <StatusBadge status={reservation.status} />
            </div>
            <h2 style={{ margin: 0, fontSize: '20px' }}>
              {guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped no asignado'}
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'monospace' }}>
              ID: {reservation.id}
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-close-button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Fechas & Estadía Card */}
        <div className="res-detail-highlight-card">
          <div className="res-detail-date-block">
            <span className="res-detail-label">Check-in</span>
            <strong className="res-detail-value">
              <CalendarDays size={14} color="var(--teal)" />
              {formatDateDisplay(reservation.checkInDate)}
            </strong>
          </div>
          <div className="res-detail-arrow">
            <span className="res-detail-nights-badge">
              {nights} {nights === 1 ? 'noche' : 'noches'}
            </span>
          </div>
          <div className="res-detail-date-block" style={{ textAlign: 'right' }}>
            <span className="res-detail-label">Check-out</span>
            <strong className="res-detail-value" style={{ justifyContent: 'flex-end' }}>
              <CalendarDays size={14} color="var(--teal)" />
              {formatDateDisplay(reservation.checkOutDate)}
            </strong>
          </div>
        </div>

        {/* Grid de Secciones */}
        <div className="res-detail-grid">
          {/* Huésped */}
          <div className="res-detail-section">
            <h4>
              <User size={14} /> Huésped
            </h4>
            <div className="res-detail-rows">
              <div className="res-detail-row">
                <span className="text-muted">Documento:</span>
                <span>
                  {guest?.documentNumber
                    ? `${guest.documentType === 'passport' ? 'Pasaporte' : 'Doc'}: ${guest.documentNumber}`
                    : 'Sin registrar'}
                </span>
              </div>
              {guest?.nationality && (
                <div className="res-detail-row">
                  <span className="text-muted">Nacionalidad:</span>
                  <span>{guest.nationality}</span>
                </div>
              )}
              {guest?.whatsapp && (
                <div className="res-detail-row">
                  <span className="text-muted">WhatsApp:</span>
                  <span>{guest.whatsapp}</span>
                </div>
              )}
              {guest?.email && (
                <div className="res-detail-row">
                  <span className="text-muted">Email:</span>
                  <span>{guest.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Habitación y Camas */}
          <div className="res-detail-section">
            <h4>
              <BedDouble size={14} /> Habitación & Camas
            </h4>
            <div className="res-detail-rows">
              <div className="res-detail-row">
                <span className="text-muted">Habitación:</span>
                <strong>{room?.name || 'No especificada'}</strong>
              </div>
              <div className="res-detail-row">
                <span className="text-muted">Tipo:</span>
                <span>{room?.type === 'dorm' ? 'Dorm / Compartida' : 'Hab. Privada'}</span>
              </div>
              <div className="res-detail-row">
                <span className="text-muted">Camas:</span>
                <span>
                  {reservation.bedIds?.length ?? 0}{' '}
                  {reservation.bedIds?.length === 1 ? 'cama asignada' : 'camas asignadas'}
                </span>
              </div>
            </div>
          </div>

          {/* Tarifa y Canal */}
          <div className="res-detail-section full-width">
            <h4>
              <CreditCard size={14} /> Tarifa & Operación
            </h4>
            <div className="res-detail-rows">
              <div className="res-detail-row">
                <span className="text-muted">Canal de origen:</span>
                <span className="res-channel">{reservation.channel || 'reception'}</span>
              </div>
              <div className="res-detail-row">
                <span className="text-muted">Total a cobrar:</span>
                <strong style={{ fontSize: '16px', color: 'var(--teal)' }}>
                  {reservation.totalAmount ?? 0} {reservation.currency ?? 'BOB'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: '14px', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          {reservation.status === 'confirmed' && (
            <button
              type="button"
              className="danger-button compact-button"
              style={{ marginRight: 'auto', padding: '6px 12px', fontSize: '12px', minHeight: 'auto' }}
              onClick={() => {
                onClose()
                onCancelRequest?.(reservation)
              }}
            >
              Cancelar reserva
            </button>
          )}
          {/* v1.7: botón Modificar Reserva en modal de detalles */}
          {reservation.status === 'confirmed' && (
            <button
              type="button"
              className="secondary-button compact-button"
              style={{ padding: '6px 12px', fontSize: '12px', minHeight: 'auto' }}
              onClick={() => {
                onClose()
                onModifyRequest?.(reservation)
              }}
            >
              Modificar reserva
            </button>
          )}
          <button type="button" className="primary-button compact-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

interface ReservationModalProps {
  establishmentId: string
  rooms: Room[]
  guests: Guest[]
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}

function ReservationModal({
  establishmentId,
  rooms,
  guests,
  onClose,
  onSaved,
  onError,
}: ReservationModalProps) {
  const todayStr = getTodayString()
  const tomorrowStr = getTomorrowString(todayStr)

  const [guestId, setGuestId] = useState(guests[0]?.id ?? '')
  const [guestSearch, setGuestSearch] = useState('')
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '')
  const [saleMode, setSaleMode] = useState<'bed' | 'full_room'>('bed')
  const [checkIn, setCheckIn] = useState(todayStr)
  const [checkOut, setCheckOut] = useState(tomorrowStr)
  const [beds, setBeds] = useState<string[]>([])
  const [channel, setChannel] = useState('reception')
  const [commissionPercent, setCommissionPercent] = useState<number | ''>('')
  const [guestCount, setGuestCount] = useState<number>(1)
  const [guestIds, setGuestIds] = useState<string[]>([])
  // v1.7: pricingMode + tarifa especial
  const [pricingMode, setPricingMode] = useState<'standard' | 'manual'>('standard')
  const [manualPricePerNight, setManualPricePerNight] = useState<number>(0)
  const [specialRateReason, setSpecialRateReason] = useState('Voluntariado')
  const [specialRateNote, setSpecialRateNote] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const room = rooms.find((item) => item.id === roomId)
  const eligibleBeds = useMemo(() => {
    return room?.beds.filter((bed) => bed.status === 'active' && bed.isAvailable !== false) ?? []
  }, [room])

  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return guests
    const q = guestSearch.toLowerCase()
    return guests.filter(
      (g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q)
    )
  }, [guests, guestSearch])

  // Automatic full room bed selection
  useEffect(() => {
    if (room?.type === 'private') {
      setSaleMode('full_room')
    }
    if (saleMode === 'full_room' && room) {
      const allActiveBedIds = room.beds.filter((b) => b.status === 'active').map((b) => b.id)
      setBeds(allActiveBedIds)
    }
  }, [saleMode, room])

  // Minimum check-out date is checkIn + 1 day
  const minCheckOut = useMemo(() => getTomorrowString(checkIn), [checkIn])

  const handleCheckInChange = (newIn: string) => {
    setCheckIn(newIn)
    if (new Date(`${checkOut}T00:00:00`) <= new Date(`${newIn}T00:00:00`)) {
      setCheckOut(getTomorrowString(newIn))
    }
  }

  // Price calculations for preview
  const nights = useMemo(() => calculateNights(checkIn, checkOut), [checkIn, checkOut])

  const estimatedTotal = useMemo(() => {
    if (nights <= 0 || !room) return 0
    if (saleMode === 'full_room') {
      if (room.type === 'private') {
        const base = room.priceByGuestCount?.[String(guestCount)] ?? room.basePriceRoom ?? 0
        return base * nights
      }
      return (room.basePriceRoom ?? 0) * nights
    }
    const selectedBeds = room.beds.filter((b) => beds.includes(b.id))
    const pricePerNightSum = selectedBeds.reduce((sum, b) => sum + (b.basePriceBed ?? room.basePriceRoom ?? 0), 0)
    return pricePerNightSum * nights
  }, [nights, room, saleMode, beds, guestCount])

  const toggleBed = (bedId: string) => {
    if (saleMode === 'full_room') return
    setBeds((prev) => (prev.includes(bedId) ? prev.filter((id) => id !== bedId) : [...prev, bedId]))
  }

  const selectAllBeds = () => {
    setBeds(eligibleBeds.map((b) => b.id))
  }

  const deselectAllBeds = () => {
    setBeds([])
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!room) {
      setFormError('Selecciona una habitación válida.')
      return
    }

    if (!guestId) {
      setFormError('Debes seleccionar un huésped. Si no hay huéspedes registrados, primero créalo en el módulo de huéspedes.')
      return
    }

    if (beds.length === 0) {
      setFormError('Debes seleccionar al menos una cama.')
      return
    }

    const validation = createReservationSchema.safeParse({
      guestId,
      roomId,
      saleMode,
      bedIds: beds,
      checkIn,
      checkOut,
      channel,
      commissionPercent: commissionPercent === '' ? undefined : commissionPercent,
      guestCount,
      guestIds: guestIds.filter(id => id.trim() !== ''),
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de reserva no válidos.')
      return
    }

    // Build pricePerNight date matrix
    const dates: string[] = []
    for (
      let date = new Date(`${checkIn}T00:00:00Z`);
      date < new Date(`${checkOut}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      dates.push(date.toISOString().slice(0, 10))
    }

    const commRate = (channel === 'booking' || channel === 'airbnb') && commissionPercent !== '' 
      ? Number(commissionPercent) / 100 
      : 0

    const pricePerNight = Object.fromEntries(
      beds.map((bedId) => [
        bedId,
        Object.fromEntries(
          dates.map((date) => {
            let basePrice = 0;
            if (saleMode === 'full_room' && room.type === 'private') {
              basePrice = room.priceByGuestCount?.[String(guestCount)] ?? room.basePriceRoom ?? 0
            } else {
              basePrice = room.beds.find((b) => b.id === bedId)?.basePriceBed ?? room.basePriceRoom ?? 0
            }
            return [date, basePrice * (1 + commRate)]
          })
        ),
      ])
    )

    // v1.7: validar precio manual
    const effectiveReason = specialRateReason === 'Otro' ? (specialRateNote.trim() || 'Otro') : specialRateReason
    if (pricingMode === 'manual') {
      if (typeof manualPricePerNight !== 'number' || manualPricePerNight < 0 || !isFinite(manualPricePerNight)) {
        setFormError('El precio manual debe ser un número mayor o igual a 0.')
        return
      }
      if (!effectiveReason.trim()) {
        setFormError('Ingresa un motivo para la tarifa especial.')
        return
      }
    }

    setSubmitting(true)
    try {
      await createReservation({
        establishmentId,
        guestId,
        saleMode,
        roomId,
        bedIds: beds,
        checkIn,
        checkOut,
        pricePerNight,
        channel,
        // v1.7: guestCount siempre número
        guestCount: saleMode === 'bed' ? 1 : guestCount,
        guestIds,
        ...(commissionPercent !== '' ? { commissionPercent } : {}),
        // v1.7: pricingMode
        pricingMode,
        ...(pricingMode === 'manual' ? {
          manualPricePerNight,
          specialRateReason: effectiveReason,
        } : {}),
      })
      onSaved()
    } catch {
      const err = 'La reserva no pudo confirmarse. El backend server-side verificó que la cama o fecha ya no está disponible.'
      setFormError(err)
      onError(err)
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
            <h2>Nueva reserva</h2>
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

        {/* Huésped */}
        <div style={{ display: 'grid', gap: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Huésped titular</span>
            {guests.length > 5 && (
              <input
                type="text"
                placeholder="Filtrar por nombre o doc..."
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                style={{ width: '180px', padding: '4px 8px', fontSize: '11px' }}
              />
            )}
          </label>
          {guests.length === 0 ? (
            <div className="stay-notice" style={{ background: '#fff0eb', borderColor: '#f0b4a4', color: '#a94635' }}>
              <User size={16} />
              No hay huéspedes registrados en el sistema. Debes crear un huésped primero.
            </div>
          ) : (
            <select value={guestId} onChange={(event) => setGuestId(event.target.value)} required>
              {filteredGuests.length === 0 ? (
                <option value="">No hay huéspedes que coincidan con la búsqueda</option>
              ) : (
                filteredGuests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.firstName} {g.lastName} {g.documentNumber ? `(Doc: ${g.documentNumber})` : ''}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        {room?.type === 'private' && (
          <div style={{ display: 'grid', gap: '6px', background: 'var(--paper)', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text)' }}>Grupo (Habitación Privada)</h4>
            
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>Cantidad de ocupantes ({room.maxGuests ? `Máx ${room.maxGuests}` : 'Sin límite'})</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => setGuestCount((c) => Math.max(1, c - 1))}
                  style={{ padding: '4px 8px' }}
                >
                  -
                </button>
                <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 600 }}>{guestCount}</span>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => setGuestCount((c) => Math.min(room.maxGuests || 99, c + 1))}
                  style={{ padding: '4px 8px' }}
                >
                  +
                </button>
              </div>
            </label>

            <span className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Acompañantes registrados (opcional):</span>
            {guestIds.map((companionId, idx) => {
              return (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <select
                    value={companionId}
                    onChange={(e) => {
                      const newIds = [...guestIds]
                      newIds[idx] = e.target.value
                      setGuestIds(newIds)
                    }}
                    style={{ flex: 1, margin: 0, fontSize: 12, padding: '4px 8px' }}
                  >
                    <option value="">Selecciona un huésped...</option>
                    {filteredGuests.map((g) => (
                      <option key={g.id} value={g.id} disabled={g.id === guestId || guestIds.includes(g.id)}>
                        {g.firstName} {g.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const newIds = [...guestIds]
                      newIds.splice(idx, 1)
                      setGuestIds(newIds)
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
            
            {guestIds.length < guestCount - 1 && (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => setGuestIds([...guestIds, ''])}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              >
                + Añadir acompañante
              </button>
            )}
          </div>
        )}

        {/* Modo de venta */}
        {room?.type !== 'private' && (
        <div style={{ display: 'grid', gap: '6px' }}>
          <label>Modo de venta</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className={saleMode === 'bed' ? 'primary-button compact-button' : 'secondary-button'}
              onClick={() => {
                setSaleMode('bed')
                setBeds([])
              }}
              style={{ justifyContent: 'center' }}
            >
              <BedDouble size={16} /> Reserva por cama
            </button>
            <button
              type="button"
              className={saleMode === 'full_room' ? 'primary-button compact-button' : 'secondary-button'}
              onClick={() => setSaleMode('full_room')}
              style={{ justifyContent: 'center' }}
            >
              <Building size={16} /> Habitación completa
            </button>
          </div>
        </div>
        )}

        {/* Habitación */}
        <label>
          Habitación
          <select
            value={roomId}
            onChange={(event) => {
              setRoomId(event.target.value)
              setBeds([])
              setGuestCount(1)
              setGuestIds([])
            }}
          >
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.type === 'dorm' ? 'Compartida/Dorm' : 'Privada'}) · {item.bedCount} camas
              </option>
            ))}
          </select>
        </label>

        {/* Fechas */}
        <div className="form-row">
          <label>
            Entrada
            <input
              type="date"
              min={todayStr}
              value={checkIn}
              onChange={(event) => handleCheckInChange(event.target.value)}
              required
            />
          </label>
          <label>
            Salida (Mínimo 1 noche)
            <input
              type="date"
              min={minCheckOut}
              value={checkOut}
              onChange={(event) => setCheckOut(event.target.value)}
              required
            />
          </label>
        </div>

        {/* Canal */}
        <label>
          Canal de reserva
          <select value={channel} onChange={(event) => {
            setChannel(event.target.value)
            if (event.target.value !== 'booking' && event.target.value !== 'airbnb') {
              setCommissionPercent('')
            }
          }}>
            <option value="reception">Recepción</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="booking">Booking</option>
            <option value="airbnb">Airbnb</option>
            <option value="direct">Directo</option>
          </select>
        </label>

        {(channel === 'booking' || channel === 'airbnb') && (
          <label>
            Comisión de la plataforma (%)
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ej. 15"
              required
            />
          </label>
        )}

        {/* Selección de Camas */}
        {room?.type !== 'private' && (
        <div className="bed-choice" style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="eyebrow">
              Camas de la habitación {saleMode === 'full_room' ? '(Todas seleccionadas)' : ''}
            </span>
            {saleMode === 'bed' && eligibleBeds.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={selectAllBeds}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '11px', cursor: 'pointer' }}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={deselectAllBeds}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}
                >
                  Ninguna
                </button>
              </div>
            )}
          </div>

          {eligibleBeds.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px', background: 'var(--paper)', borderRadius: '5px' }}>
              No hay camas activas disponibles en esta habitación.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
              {eligibleBeds.map((bed) => (
                <label key={bed.id} className="bed-check" style={{ cursor: saleMode === 'full_room' ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    disabled={saleMode === 'full_room'}
                    checked={beds.includes(bed.id)}
                    onChange={() => toggleBed(bed.id)}
                  />
                  {bed.label} · {bed.basePriceBed ?? room?.basePriceRoom} BOB / noche
                </label>
              ))}
            </div>
          )}
        </div>
        )}

        {/* v1.7: Selector de Tarifa */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block', fontSize: '13px' }}>Tarifa</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
              padding: '7px 12px', borderRadius: 'var(--radius-sm)', flex: 1, justifyContent: 'center',
              border: `2px solid ${pricingMode === 'standard' ? 'var(--teal)' : 'var(--line)'}`,
              background: pricingMode === 'standard' ? 'var(--mint)' : 'transparent',
              fontWeight: pricingMode === 'standard' ? 600 : 400, fontSize: '13px',
            }}>
              <input type="radio" name="resPricingMode" value="standard" checked={pricingMode === 'standard'} onChange={() => setPricingMode('standard')} style={{ display: 'none' }} />
              Tarifa normal
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
              padding: '7px 12px', borderRadius: 'var(--radius-sm)', flex: 1, justifyContent: 'center',
              border: `2px solid ${pricingMode === 'manual' ? 'var(--coral)' : 'var(--line)'}`,
              background: pricingMode === 'manual' ? '#fff0eb' : 'transparent',
              fontWeight: pricingMode === 'manual' ? 600 : 400, fontSize: '13px',
            }}>
              <input type="radio" name="resPricingMode" value="manual" checked={pricingMode === 'manual'} onChange={() => setPricingMode('manual')} style={{ display: 'none' }} />
              Tarifa especial
            </label>
          </div>
          {pricingMode === 'manual' && (
            <div style={{ padding: '10px 12px', background: '#fff8f5', borderRadius: 'var(--radius-sm)', border: '1px solid #f9d5c5' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: specialRateReason === 'Otro' ? '8px' : '0' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Precio por noche (BOB)
                  <input type="number" min={0} step={0.5} value={manualPricePerNight}
                    onChange={(e) => setManualPricePerNight(Number(e.target.value))} placeholder="0"
                    style={{ marginTop: '4px', borderColor: 'var(--coral)' }} />
                </label>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Motivo
                  <select value={specialRateReason} onChange={(e) => setSpecialRateReason(e.target.value)} style={{ marginTop: '4px' }}>
                    <option>Voluntariado</option>
                    <option>Cortesía</option>
                    <option>Acuerdo especial</option>
                    <option>Otro</option>
                  </select>
                </label>
              </div>
              {specialRateReason === 'Otro' && (
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Nota adicional
                  <input type="text" value={specialRateNote} onChange={(e) => setSpecialRateNote(e.target.value)} placeholder="Describir brevemente..." maxLength={100} style={{ marginTop: '4px' }} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Resumen de Tarifas & Total Estimado */}
        <div
          style={{
            padding: '12px 14px',
            background: '#f4f8f6',
            border: '1px solid #cce3d8',
            borderRadius: '6px',
            fontSize: '13px',
            display: 'grid',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Noches: {nights}</span>
            <span>{room?.type === 'private' ? `Ocupantes: ${guestCount}` : `Camas: ${beds.length}`}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Precio base hospedaje:</span>
            <span>{estimatedTotal} BOB</span>
          </div>
          
          {(channel === 'booking' || channel === 'airbnb') && commissionPercent !== '' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Markup {channel === 'booking' ? 'Booking' : 'Airbnb'} ({commissionPercent}%):</span>
              <span style={{ color: '#d97706' }}>
                {(estimatedTotal * (Number(commissionPercent) / 100)).toFixed(1)} BOB
              </span>
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #cce3d8' }}>
            <strong>Precio total estimado:</strong>
            <strong style={{ color: 'var(--teal)' }}>
              {((channel === 'booking' || channel === 'airbnb') && commissionPercent !== '' 
                ? estimatedTotal * (1 + Number(commissionPercent) / 100) 
                : estimatedTotal).toFixed(1)} BOB
            </strong>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>Este es el monto final de la reserva que incluye el cargo de la plataforma. La tarifa por noche se ajustará automáticamente al guardar.</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting || guests.length === 0}>
            {submitting ? 'Confirmando con backend...' : 'Confirmar reserva'}
          </button>
        </div>
      </form>
    </div>
  )
}
