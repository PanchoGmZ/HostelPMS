import { useState, type FormEvent } from 'react'
import { X, AlertTriangle, Loader2, Info } from 'lucide-react'
import { modifyReservation } from '../../services/reservations/reservationsService'
import type { Reservation } from '../../types/reservations'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'

interface ModifyReservationModalProps {
  establishmentId: string
  reservation: Reservation
  guests: Guest[]
  rooms: Room[]
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

const SPECIAL_RATE_REASONS = [
  'Voluntariado',
  'Cortesía',
  'Acuerdo especial',
  'Otro',
]

export function ModifyReservationModal({
  establishmentId,
  reservation,
  guests,
  rooms,
  onClose,
  onSuccess,
  onError,
}: ModifyReservationModalProps) {
  const room = rooms.find((r) => r.id === reservation.roomId)
  const isPrivate = room?.type === 'private'

  // Identificar huésped titular actual
  const currentGuest = guests.find((g) => g.id === reservation.primaryGuestId)

  // Estado inicial desde la reserva existente
  const [primaryGuestId, setPrimaryGuestId] = useState(reservation.primaryGuestId ?? '')
  const [guestIds, setGuestIds] = useState<string[]>(
    (reservation.guestIds ?? []).filter((id) => id !== reservation.primaryGuestId)
  )
  const [channel, setChannel] = useState(reservation.channel ?? 'direct')
  const [commissionPercent, setCommissionPercent] = useState<number | ''>(
    reservation.commissionPercent ?? ''
  )
  const [guestCount, setGuestCount] = useState<number>(reservation.guestCount ?? 1)
  const [pricingMode, setPricingMode] = useState<'standard' | 'manual'>(
    reservation.pricingMode ?? 'standard'
  )
  const [manualPricePerNight, setManualPricePerNight] = useState<number>(
    reservation.manualPricePerNight ?? 0
  )
  const [specialRateReason, setSpecialRateReason] = useState(
    SPECIAL_RATE_REASONS.includes(reservation.specialRateReason ?? '')
      ? (reservation.specialRateReason ?? 'Voluntariado')
      : 'Voluntariado'
  )
  const [specialRateNote, setSpecialRateNote] = useState(
    SPECIAL_RATE_REASONS.includes(reservation.specialRateReason ?? '') && reservation.specialRateReason !== 'Otro'
      ? ''
      : (reservation.specialRateReason ?? '')
  )

  const [guestSearch, setGuestSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Noches para preview de total
  const nights = reservation.checkInDate && reservation.checkOutDate
    ? Math.round((reservation.checkOutDate.seconds - reservation.checkInDate.seconds) / (60 * 60 * 24))
    : 0

  // Preview de total estimado (orientativo, el servidor recalcula)
  const previewTotal = (() => {
    if (pricingMode === 'manual') {
      const base = manualPricePerNight
      const commRate = (channel === 'booking' || channel === 'airbnb') && commissionPercent !== ''
        ? Number(commissionPercent) / 100
        : 0
      return base * (1 + commRate) * nights
    }
    // standard: solo referencial
    return reservation.totalAmount
  })()

  const filteredGuests = guestSearch.trim()
    ? guests.filter((g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(guestSearch.toLowerCase()) ||
        g.documentNumber.toLowerCase().includes(guestSearch.toLowerCase())
      )
    : guests

  const effectiveReason = specialRateReason === 'Otro'
    ? (specialRateNote.trim() || 'Otro')
    : specialRateReason

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!primaryGuestId) {
      setFormError('Selecciona un huésped titular.')
      return
    }

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

    if (isPrivate && guestCount < 1) {
      setFormError('La cantidad de ocupantes debe ser al menos 1.')
      return
    }

    if (isPrivate && room?.maxGuests && guestCount > room.maxGuests) {
      setFormError(`La cantidad de ocupantes no puede superar el máximo de la habitación (${room.maxGuests}).`)
      return
    }

    setSubmitting(true)
    try {
      const payload: Parameters<typeof modifyReservation>[0] = {
        establishmentId,
        reservationId: reservation.id,
        primaryGuestId: primaryGuestId || undefined,
        guestIds: [primaryGuestId, ...guestIds.filter((id) => id.trim() !== '')],
        channel,
        pricingMode,
        ...(pricingMode === 'manual'
          ? {
              manualPricePerNight,
              specialRateReason: effectiveReason,
            }
          : {}),
        ...(isPrivate ? { guestCount } : {}),
        ...((channel === 'booking' || channel === 'airbnb') && commissionPercent !== ''
          ? { commissionPercent: Number(commissionPercent) }
          : { commissionPercent: 0 }),
      }

      await modifyReservation(payload)
      onSuccess('Reserva modificada exitosamente.')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al modificar la reserva'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-form"
        style={{ maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <span className="kicker">Reserva #{reservation.id.slice(-6).toUpperCase()}</span>
            <h2>Modificar Reserva</h2>
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

        {/* Huésped Titular */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>
            Huésped Titular
          </label>
          {guests.length > 5 && (
            <input
              type="text"
              placeholder="Buscar por nombre o documento..."
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              style={{ marginBottom: '6px' }}
            />
          )}
          <select
            value={primaryGuestId}
            onChange={(e) => setPrimaryGuestId(e.target.value)}
            required
          >
            <option value="">— Seleccionar huésped —</option>
            {filteredGuests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.firstName} {g.lastName} — Doc: {g.documentNumber}
              </option>
            ))}
          </select>
          {currentGuest && primaryGuestId !== reservation.primaryGuestId && (
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Antes: {currentGuest.firstName} {currentGuest.lastName}
            </p>
          )}
        </div>

        {/* Acompañantes (privada) */}
        {isPrivate && (
          <div
            style={{
              marginBottom: '14px',
              padding: '12px',
              background: 'var(--paper)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontWeight: 600 }}>
                Ocupantes (máx. {room?.maxGuests ?? '–'})
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => setGuestCount((c) => Math.max(1, c - 1))}
                  style={{ padding: '4px 10px' }}
                >
                  −
                </button>
                <span style={{ minWidth: '28px', textAlign: 'center', fontWeight: 700 }}>
                  {guestCount}
                </span>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => setGuestCount((c) => Math.min(room?.maxGuests ?? 99, c + 1))}
                  style={{ padding: '4px 10px' }}
                >
                  +
                </button>
              </div>
            </label>

            <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
              Acompañantes (opcional):
            </p>
            {guestIds.map((id, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                <select
                  value={id}
                  onChange={(e) => {
                    const next = [...guestIds]
                    next[idx] = e.target.value
                    setGuestIds(next)
                  }}
                  style={{ flex: 1, margin: 0, fontSize: '12px', padding: '4px 8px' }}
                >
                  <option value="">— Acompañante —</option>
                  {guests
                    .filter((g) => g.id !== primaryGuestId && !guestIds.includes(g.id) || g.id === id)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.firstName} {g.lastName}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => setGuestIds(guestIds.filter((_, i) => i !== idx))}
                  style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {guestIds.length < guestCount - 1 && (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => setGuestIds([...guestIds, ''])}
                style={{ marginTop: '4px', alignSelf: 'flex-start' }}
              >
                + Añadir acompañante
              </button>
            )}
          </div>
        )}

        {/* Canal y Comisión */}
        <div style={{ display: 'grid', gridTemplateColumns: isPrivate || (channel !== 'booking' && channel !== 'airbnb') ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>Canal</label>
            <select
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value)
                if (e.target.value !== 'booking' && e.target.value !== 'airbnb') {
                  setCommissionPercent('')
                }
              }}
            >
              <option value="direct">Directo / Mostrador</option>
              <option value="reception">Recepción</option>
              <option value="whatsapp">WhatsApp / Teléfono</option>
              <option value="booking">Booking.com</option>
              <option value="airbnb">Airbnb</option>
            </select>
          </div>
          {(channel === 'booking' || channel === 'airbnb') && (
            <div>
              <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                Comisión (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commissionPercent}
                onChange={(e) =>
                  setCommissionPercent(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="Ej. 15"
              />
            </div>
          )}
        </div>

        {/* Tarifa */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Tarifa</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: `2px solid ${pricingMode === 'standard' ? 'var(--teal)' : 'var(--line)'}`,
                background: pricingMode === 'standard' ? 'var(--mint)' : 'transparent',
                fontWeight: pricingMode === 'standard' ? 600 : 400,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <input
                type="radio"
                name="pricingMode"
                value="standard"
                checked={pricingMode === 'standard'}
                onChange={() => setPricingMode('standard')}
                style={{ display: 'none' }}
              />
              Tarifa normal
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: `2px solid ${pricingMode === 'manual' ? 'var(--coral)' : 'var(--line)'}`,
                background: pricingMode === 'manual' ? '#fff0eb' : 'transparent',
                fontWeight: pricingMode === 'manual' ? 600 : 400,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <input
                type="radio"
                name="pricingMode"
                value="manual"
                checked={pricingMode === 'manual'}
                onChange={() => setPricingMode('manual')}
                style={{ display: 'none' }}
              />
              Tarifa especial
            </label>
          </div>
        </div>

        {/* Precio manual */}
        {pricingMode === 'manual' && (
          <div style={{ marginBottom: '14px', padding: '12px', background: '#fff8f5', borderRadius: 'var(--radius-sm)', border: '1px solid #f9d5c5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block', fontSize: '13px' }}>
                  Precio por noche (BOB)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={manualPricePerNight}
                  onChange={(e) => setManualPricePerNight(Number(e.target.value))}
                  placeholder="0"
                  style={{ borderColor: 'var(--coral)' }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, marginBottom: '6px', display: 'block', fontSize: '13px' }}>
                  Motivo
                </label>
                <select
                  value={specialRateReason}
                  onChange={(e) => setSpecialRateReason(e.target.value)}
                >
                  {SPECIAL_RATE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            {specialRateReason === 'Otro' && (
              <div>
                <label style={{ fontWeight: 600, marginBottom: '4px', display: 'block', fontSize: '13px' }}>
                  Nota adicional
                </label>
                <input
                  type="text"
                  value={specialRateNote}
                  onChange={(e) => setSpecialRateNote(e.target.value)}
                  placeholder="Describir brevemente el motivo..."
                  maxLength={100}
                />
              </div>
            )}
          </div>
        )}

        {/* Resumen */}
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--mint)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '14px',
            fontSize: '13px',
            display: 'grid',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Noches:</span>
            <strong>{nights}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Total actual:</span>
            <span style={{ textDecoration: pricingMode === 'manual' ? 'line-through' : 'none', color: 'var(--muted)' }}>
              {reservation.totalAmount} {reservation.currency ?? 'BOB'}
            </span>
          </div>
          {pricingMode === 'manual' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', paddingTop: '4px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <strong>Nuevo total estimado:</strong>
              <strong style={{ color: manualPricePerNight === 0 ? 'var(--muted)' : 'var(--teal)' }}>
                {previewTotal.toFixed(1)} BOB
              </strong>
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start', color: 'var(--muted)', marginTop: '4px', fontSize: '11px' }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>El backend recalculará el total de forma segura al guardar.</span>
          </div>
        </div>

        {/* Acciones */}
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
              'Guardar cambios'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
