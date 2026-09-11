import { useState, useMemo, type FormEvent } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { createReservation } from '../../services/reservations/reservationsService'
import type { Bed, Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'

interface NewReservationModalProps {
  establishmentId: string
  initialBed?: Bed
  initialRoom?: Room
  rooms: Room[]
  guests: Guest[]
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getTomorrowString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return toLocalDateString(d)
}

export function NewReservationModal({
  establishmentId,
  initialBed,
  initialRoom,
  rooms,
  guests,
  onClose,
  onSuccess,
  onError,
}: NewReservationModalProps) {
  const todayStr = toLocalDateString(new Date())
  const tomorrowStr = getTomorrowString(todayStr)

  const [guestId, setGuestId] = useState(guests[0]?.id ?? '')
  const [guestSearch, setGuestSearch] = useState('')
  const [roomId, setRoomId] = useState(initialRoom?.id ?? rooms[0]?.id ?? '')
  const [bedId, setBedId] = useState(initialBed?.id ?? '')
  const [checkIn, setCheckIn] = useState(todayStr)
  const [checkOut, setCheckOut] = useState(tomorrowStr)
  const [channel, setChannel] = useState('direct')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedRoom = useMemo(() => rooms.find((r) => r.id === roomId), [rooms, roomId])

  // Available beds in room
  const availableBeds = useMemo(() => {
    return selectedRoom?.beds.filter((b) => b.status === 'active') ?? []
  }, [selectedRoom])

  // Filter guests
  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return guests
    const q = guestSearch.toLowerCase()
    return guests.filter(
      (g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q)
    )
  }, [guests, guestSearch])

  // Calculate nights
  const nights = useMemo(() => {
    const from = new Date(`${checkIn}T00:00:00`)
    const to = new Date(`${checkOut}T00:00:00`)
    const diff = to.getTime() - from.getTime()
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
  }, [checkIn, checkOut])

  const effectiveBedId = bedId || availableBeds[0]?.id || ''
  const selectedBed = availableBeds.find((b) => b.id === effectiveBedId)
  const pricePerNightNumber = selectedBed?.basePriceBed ?? selectedRoom?.basePriceRoom ?? 50
  const estimatedTotal = nights * pricePerNightNumber

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!guestId) {
      setFormError('Debes seleccionar un huésped para la reserva.')
      return
    }
    if (!effectiveBedId) {
      setFormError('Selecciona una cama válida.')
      return
    }
    if (nights <= 0) {
      setFormError('La fecha de salida debe ser posterior a la fecha de entrada.')
      return
    }

    // Build dates array
    const dates: string[] = []
    for (
      let d = new Date(`${checkIn}T00:00:00Z`);
      d < new Date(`${checkOut}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      dates.push(d.toISOString().slice(0, 10))
    }

    const pricePerNight = {
      [effectiveBedId]: Object.fromEntries(dates.map((d) => [d, pricePerNightNumber])),
    }

    setSubmitting(true)
    try {
      await createReservation({
        establishmentId,
        guestId,
        roomId,
        bedIds: [effectiveBedId],
        saleMode: 'bed',
        checkIn,
        checkOut,
        pricePerNight,
        channel,
      })

      onSuccess('Reserva creada y confirmada exitosamente.')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear reserva'
      setFormError(`No se pudo crear la reserva: ${msg}`)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-form"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">Reservas</span>
            <h2>Nueva Reserva</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* Guest selector */}
        <div style={{ marginBottom: '14px' }}>
          <label>Huésped:</label>
          <input
            type="text"
            placeholder="Buscar por nombre o documento..."
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            style={{ marginBottom: '8px' }}
          />
          <select value={guestId} onChange={(e) => setGuestId(e.target.value)} required>
            {filteredGuests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.firstName} {g.lastName} ({g.documentNumber})
              </option>
            ))}
          </select>
        </div>

        {/* Room & Bed */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Habitación</label>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value)
                setBedId('')
              }}
              required
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (Piso {r.floor})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Cama</label>
            <select
              value={effectiveBedId}
              onChange={(e) => setBedId(e.target.value)}
              required
            >
              {availableBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label || `Cama ${b.id.slice(-3)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Check-in</label>
            <input
              type="date"
              value={checkIn}
              min={todayStr}
              onChange={(e) => {
                setCheckIn(e.target.value)
                if (e.target.value >= checkOut) {
                  setCheckOut(getTomorrowString(e.target.value))
                }
              }}
              required
            />
          </div>
          <div>
            <label>Check-out</label>
            <input
              type="date"
              value={checkOut}
              min={getTomorrowString(checkIn)}
              onChange={(e) => setCheckOut(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Channel & Total */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Canal</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="direct">Directo / Mostrador</option>
              <option value="whatsapp">WhatsApp / Teléfono</option>
              <option value="booking">Booking.com</option>
              <option value="hostelworld">Hostelworld</option>
              <option value="airbnb">Airbnb</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Total ({nights} noches):</span>
            <strong style={{ fontSize: '18px', color: 'var(--teal)' }}>{estimatedTotal} BOB</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Guardando...
              </>
            ) : (
              'Confirmar Reserva'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
