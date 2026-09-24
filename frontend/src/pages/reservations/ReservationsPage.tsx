import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BedDouble,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Filter,
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
import { cancelReservation, listReservations } from '../../services/reservations/reservationsService'
import { NewReservationModal } from '../../components/reception/NewReservationModal'
import { ModifyReservationModal } from '../../components/reception/ModifyReservationModal'
import type { Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation, ReservationStatus } from '../../types/reservations'
import './ReservationsPage.css'



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
      setSuccessMessage('Reserva eliminada exitosamente.')
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
                    {reservation.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCancelClick(reservation)
                          }}
                          className="danger-button compact-button"
                          style={{ padding: '4px 10px', fontSize: '12px', minHeight: 'auto' }}
                        >
                          Eliminar reserva
                        </button>
                      )}
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
        <NewReservationModal
          establishmentId={establishmentId}
          rooms={rooms}
          guests={guests}
          onClose={() => setEditor(false)}
          onSuccess={(msg) => {
            setEditor(false)
            setSuccessMessage(msg)
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
                <h2>¿Eliminar esta reserva?</h2>
              </div>
              <button type="button" onClick={() => setCancelingReservation(null)}>
                <X size={19} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
              Esta acción liberará la disponibilidad reservada. La reserva dejará de aparecer como activa.
              <br /><br />
              ¿Seguro que deseas continuar?
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
                {canceling ? 'Eliminando...' : 'Eliminar reserva'}
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
              Eliminar reserva
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


