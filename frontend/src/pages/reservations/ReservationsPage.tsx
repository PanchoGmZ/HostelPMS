import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  BedDouble,
  Building,
  CalendarDays,
  CheckCircle2,
  Filter,
  Info,
  Plus,
  Search,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { listRooms } from '../../services/rooms/roomsService'
import { searchGuests } from '../../services/guests/guestsService'
import { cancelReservation, createReservation, listReservations } from '../../services/reservations/reservationsService'
import { createReservationSchema } from '../../schemas/reservationsSchema'
import type { Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation, ReservationStatus } from '../../types/reservations'

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
  const [cancelingReservation, setCancelingReservation] = useState<Reservation | null>(null)
  const [canceling, setCanceling] = useState(false)

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
        <div className="reservation-list">
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
              <article className="reservation-row" key={reservation.id}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '15px' }}>
                      {guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped no asignado'}
                    </strong>
                    {guest?.documentNumber && (
                      <small style={{ color: 'var(--muted)', background: 'var(--paper)', padding: '2px 6px', borderRadius: '4px' }}>
                        Doc: {guest.documentNumber}
                      </small>
                    )}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>
                      <CalendarDays size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      {formatDateDisplay(reservation.checkInDate)} → {formatDateDisplay(reservation.checkOutDate)} ({nights} {nights === 1 ? 'noche' : 'noches'})
                    </span>
                    {room && (
                      <span>
                        <BedDouble size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        {room.name} ({reservation.bedIds?.length ?? 0} {reservation.bedIds?.length === 1 ? 'cama' : 'camas'})
                      </span>
                    )}
                    {reservation.channel && (
                      <span style={{ textTransform: 'capitalize', background: '#f0f4f2', padding: '1px 6px', borderRadius: '4px' }}>
                        Canal: {reservation.channel}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ textTransform: 'capitalize' }}>
                  <StatusBadge status={reservation.status} />
                </div>

                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: '15px', color: 'var(--teal)' }}>
                    {reservation.totalAmount ?? 0} {reservation.currency ?? 'BOB'}
                  </strong>
                </div>

                <div>
                  {reservation.status !== 'cancelled' ? (
                    <button
                      type="button"
                      onClick={() => handleCancelClick(reservation)}
                      className="danger-button compact-button"
                      title="Cancelar reserva"
                    >
                      Cancelar
                    </button>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cancelada</span>
                  )}
                </div>
              </article>
            )
          })}
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
    </div>
  )
}

function StatusBadge({ status }: { status: ReservationStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="status-badge available">
        <CheckCircle2 size={12} /> Confirmada
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="status-badge occupied">
        <XCircle size={12} /> Cancelada
      </span>
    )
  }
  return (
      <span className="status-badge inactive">
      Completada
    </span>
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
      return (room.basePriceRoom ?? 0) * nights
    }
    const selectedBeds = room.beds.filter((b) => beds.includes(b.id))
    const pricePerNightSum = selectedBeds.reduce((sum, b) => sum + (b.basePriceBed ?? room.basePriceRoom ?? 0), 0)
    return pricePerNightSum * nights
  }, [nights, room, saleMode, beds])

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

    const pricePerNight = Object.fromEntries(
      beds.map((bedId) => [
        bedId,
        Object.fromEntries(
          dates.map((date) => [
            date,
            room.beds.find((b) => b.id === bedId)?.basePriceBed ?? room.basePriceRoom,
          ])
        ),
      ])
    )

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

        {/* Modo de venta */}
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

        {/* Habitación */}
        <label>
          Habitación
          <select
            value={roomId}
            onChange={(event) => {
              setRoomId(event.target.value)
              setBeds([])
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
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="reception">Recepción (Directo)</option>
            <option value="direct">Sitio Web / Directo</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="ota">OTA / Agencia Externa</option>
          </select>
        </label>

        {/* Selección de Camas */}
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
            <span>Camas: {beds.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '4px' }}>
            <strong>Precio total estimado:</strong>
            <strong style={{ color: 'var(--teal)' }}>{estimatedTotal} BOB</strong>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={11} />
            El backend server-side es la autoridad final para validar precios y disponibilidad.
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
