import { useState, useMemo, type FormEvent } from 'react'
import { X, UserPlus, UserCheck, AlertTriangle, Loader2 } from 'lucide-react'
import { collection, doc } from 'firebase/firestore'
import { db } from '../../services/firebase/config'
import { saveGuest } from '../../services/guests/guestsService'
import { createReservation } from '../../services/reservations/reservationsService'
import { checkInGuest } from '../../services/stays/staysService'
import type { Bed, Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'

interface WalkInModalProps {
  establishmentId: string
  bed: Bed
  room: Room
  existingGuests: Guest[]
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

export function WalkInModal({
  establishmentId,
  bed,
  room,
  existingGuests,
  onClose,
  onSuccess,
  onError,
}: WalkInModalProps) {
  const today = new Date()
  const todayStr = toLocalDateString(today)
  const bedDisplayName = bed.label || `Cama ${bed.id.slice(-3)}`

  // Mode: select existing guest or create new
  const [isNewGuest, setIsNewGuest] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState(existingGuests[0]?.id ?? '')
  const [guestSearch, setGuestSearch] = useState('')

  // New guest form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [docType, setDocType] = useState<string>('ci')
  const [docNumber, setDocNumber] = useState('')
  const [nationality, setNationality] = useState('Boliviana')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')

  // Stay parameters
  const [nights, setNights] = useState(1)
  const basePrice = bed.basePriceBed ?? room.basePriceRoom ?? 50
  const [pricePerNight, setPricePerNight] = useState(basePrice)
  const [deposit, setDeposit] = useState(0)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Calculated checkout date
  const checkOutDateStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + Math.max(1, nights))
    return toLocalDateString(d)
  }, [nights])

  const totalEstimate = useMemo(() => {
    return Math.max(1, nights) * Math.max(0, pricePerNight)
  }, [nights, pricePerNight])

  // Filter existing guests
  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return existingGuests
    const q = guestSearch.toLowerCase()
    return existingGuests.filter(
      (g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q)
    )
  }, [existingGuests, guestSearch])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    let finalGuestId = selectedGuestId

    // Validate guest
    if (isNewGuest) {
      if (!firstName.trim() || !lastName.trim() || !docNumber.trim()) {
        setFormError('Por favor completa nombre, apellido y documento del huésped.')
        return
      }
    } else {
      if (!finalGuestId) {
        setFormError('Selecciona un huésped o crea uno nuevo.')
        return
      }
    }

    if (nights <= 0) {
      setFormError('La estadía debe ser de al menos 1 noche.')
      return
    }

    setSubmitting(true)
    try {
      // 1. If new guest, save to Firestore and get ID
      if (isNewGuest) {
        const newRef = doc(collection(db, `establishments/${establishmentId}/guests`))
        finalGuestId = newRef.id
        await saveGuest(
          establishmentId,
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            documentType: docType,
            documentNumber: docNumber.trim(),
            nationality: nationality.trim(),
            birthDate: null,
            whatsapp: whatsapp.trim(),
            email: email.trim() || null,
            occupation: null,
            previousCity: null,
            nextCity: null,
            emergencyContact: null,
            notes: null,
          },
          finalGuestId
        )
      }

      // 2. Build dates array for pricePerNight
      const dates: string[] = []
      for (
        let d = new Date(`${todayStr}T00:00:00Z`);
        d < new Date(`${checkOutDateStr}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        dates.push(d.toISOString().slice(0, 10))
      }

      const pricePerNightMatrix = {
        [bed.id]: Object.fromEntries(dates.map((date) => [date, pricePerNight])),
      }

      // 3. Create instant reservation
      const resResult = await createReservation({
        establishmentId,
        guestId: finalGuestId,
        roomId: room.id,
        bedIds: [bed.id],
        saleMode: 'bed',
        checkIn: todayStr,
        checkOut: checkOutDateStr,
        pricePerNight: pricePerNightMatrix,
        channel: 'direct',
      })

      if (!resResult?.reservationId) {
        throw new Error('No se pudo generar la reserva para el check-in.')
      }

      // 4. Perform immediate check-in
      await checkInGuest({
        establishmentId,
        reservationId: resResult.reservationId,
        guestIds: [finalGuestId],
        roomId: room.id,
        bedIds: [bed.id],
        expectedCheckOutDate: checkOutDateStr,
        deposit,
        documentVerified: true,
      })

      onSuccess(`¡Walk-in registrado con éxito! Huésped alojado en ${bedDisplayName}.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar walk-in'
      setFormError(`No se pudo completar el walk-in: ${msg}`)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-form"
        style={{ maxWidth: '540px' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">Llegada Inmediata (Mostrador)</span>
            <h2>Walk-in: {bedDisplayName} ({room.name})</h2>
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

        {/* Guest selector mode */}
        <div className="walkin-guest-toggle" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`filter-chip ${!isNewGuest ? 'active' : ''}`}
              onClick={() => setIsNewGuest(false)}
            >
              <UserCheck size={14} /> Huésped Registrado
            </button>
            <button
              type="button"
              className={`filter-chip ${isNewGuest ? 'active' : ''}`}
              onClick={() => setIsNewGuest(true)}
            >
              <UserPlus size={14} /> Nuevo Huésped
            </button>
          </div>
        </div>

        {!isNewGuest ? (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '5px' }}>
              Buscar o seleccionar huésped:
            </label>
            <input
              type="text"
              placeholder="Buscar por nombre o documento..."
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <select
              value={selectedGuestId}
              onChange={(e) => setSelectedGuestId(e.target.value)}
              required
            >
              {filteredGuests.length === 0 ? (
                <option value="">No hay huéspedes que coincidan</option>
              ) : (
                filteredGuests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.firstName} {g.lastName} — Doc: {g.documentNumber} ({g.nationality ?? 'N/A'})
                  </option>
                ))
              )}
            </select>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label>Nombre *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Juan"
              />
            </div>
            <div>
              <label>Apellido *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Pérez"
              />
            </div>
            <div>
              <label>Tipo Documento</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="ci">Cédula de Identidad (CI)</option>
                <option value="passport">Pasaporte</option>
                <option value="dni">DNI / Extranjero</option>
              </select>
            </div>
            <div>
              <label>Nº Documento *</label>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                required
                placeholder="12345678"
              />
            </div>
            <div>
              <label>Nacionalidad</label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="Argentina, Boliviana, etc."
              />
            </div>
            <div>
              <label>WhatsApp / Teléfono</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+591 ..."
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label>Correo Electrónico (opcional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>
        )}

        {/* Stay details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Noches</label>
            <input
              type="number"
              min="1"
              value={nights}
              onChange={(e) => setNights(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label>Precio / Noche (BOB)</label>
            <input
              type="number"
              min="0"
              value={pricePerNight}
              onChange={(e) => setPricePerNight(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>Garantía / Depósito</label>
            <input
              type="number"
              min="0"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Summary Card */}
        <div style={{ padding: '10px 14px', background: 'var(--mint)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Fecha de Salida Prevista:</span>
            <strong>{checkOutDateStr}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Total Estimado del Alojamiento:</span>
            <strong style={{ fontSize: '15px', color: 'var(--teal-deep)' }}>{totalEstimate} BOB</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Procesando ingreso...
              </>
            ) : (
              'Confirmar Check-in Inmediato'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
