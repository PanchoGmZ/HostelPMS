import { useState, useMemo, useEffect, type FormEvent } from 'react'
import { X, UserPlus, UserCheck, AlertTriangle, Loader2, Info, Clock } from 'lucide-react'
import { saveGuest } from '../../services/guests/guestsService'
import { createReservation } from '../../services/reservations/reservationsService'
import { checkInGuest } from '../../services/stays/staysService'
import type { Bed, Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation } from '../../types/reservations'
import type { Stay } from '../../types/stays'
import { MultiGuestSection, createEmptySlot } from '../guests/MultiGuestSection'
import type { GuestSlot } from '../guests/MultiGuestSection'
import type { CashShift } from '../../types/cash'
import { IntegratedPayment, type PaymentData } from './IntegratedPayment'
import { cleanDraft, countries } from '../guests/GuestInlineForm'

interface WalkInModalProps {
  establishmentId: string
  bed: Bed
  room: Room
  rooms?: Room[]
  reservations?: Reservation[]
  stays?: Stay[]
  existingGuests: Guest[]
  activeCashShift: CashShift | null
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

const SPECIAL_RATE_REASONS = ['Voluntariado', 'Cortesía', 'Acuerdo especial', 'Otro']

export function WalkInModal({
  establishmentId,
  bed,
  room,
  rooms = [],
  reservations = [],
  stays = [],
  existingGuests,
  activeCashShift,
  onClose,
  onSuccess,
  onError,
}: WalkInModalProps) {
  const today = new Date()
  const todayStr = toLocalDateString(today)

  // v1.12: Fecha real de ingreso (retroactivo)
  const [checkInDateStr, setCheckInDateStr] = useState(todayStr)
  const isRetroactive = checkInDateStr < todayStr

  // Selected Room & Bed
  const [selectedRoomId, setSelectedRoomId] = useState(room.id)
  const [selectedBedId, setSelectedBedId] = useState(bed.id)

  // Mode: select existing guest or create new
  const [isNewGuest, setIsNewGuest] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState(existingGuests[0]?.id ?? '')
  const [guestSearch, setGuestSearch] = useState('')

  // New guest form (titular only in single mode)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [docType, setDocType] = useState<string>('ci')
  const [docNumber, setDocNumber] = useState('')
  const [nationality, setNationality] = useState('Boliviana')
  const [birthDate, setBirthDate] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [previousCity, setPreviousCity] = useState('')
  const [nextCity, setNextCity] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [notes, setNotes] = useState('')

  // Stay parameters
  // v1.7-hotfix: number | '' para permitir campo vacío temporalmente sin cerrar modal
  const [nights, setNights] = useState<number | ''>(1)
  const [guestCount, setGuestCount] = useState<number>(1)

  // v1.15: Multi-guest slots (reemplaza guestIds array de strings)
  const [companionSlots, setCompanionSlots] = useState<GuestSlot[]>([])

  // v1.7: pricingMode + tarifa especial
  const [pricingMode, setPricingMode] = useState<'standard' | 'manual'>('standard')
  const [manualPricePerNight, setManualPricePerNight] = useState<number>(0)
  const [specialRateReason, setSpecialRateReason] = useState('Voluntariado')
  const [specialRateNote, setSpecialRateNote] = useState('')
  // precio estándar calculado (para display)
  const [standardPricePerNight, setStandardPricePerNight] = useState(0)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdReservationId, setCreatedReservationId] = useState<string | null>(null)

  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)

  // v1.12: checkOutDateStr ahora parte desde checkInDateStr (no siempre desde hoy)
  const checkOutDateStr = useMemo(() => {
    const n = typeof nights === 'number' && nights >= 1 ? nights : 1
    // Usar T12:00:00 para evitar boundary issues al sumar días
    const d = new Date(`${checkInDateStr}T12:00:00.000-04:00`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }, [nights, checkInDateStr])

  // Availability logic
  // v1.12: disponibilidad ahora usa checkInDateStr (puede ser retroactivo)
  const occupiedBedIds = useMemo(() => {
    const ids = new Set<string>()
    stays.forEach(s => {
      if (s.status === 'active') {
        s.bedIds?.forEach(id => ids.add(id))
      }
    })
    const rangeStart = new Date(`${checkInDateStr}T00:00:00.000-04:00`);
    const rangeEnd = new Date(`${checkOutDateStr}T00:00:00.000-04:00`);
    reservations.forEach(r => {
      if (r.status !== 'confirmed') return;
      if (!r.checkInDate || !r.checkOutDate) return;
      const rIn = new Date(r.checkInDate.seconds * 1000);
      const rOut = new Date(r.checkOutDate.seconds * 1000);
      if (rIn < rangeEnd && rOut > rangeStart) {
        r.bedIds?.forEach(id => ids.add(id))
      }
    })
    return ids
  }, [stays, reservations, checkInDateStr, checkOutDateStr])

  const selectedRoomObj = useMemo(() => rooms.find((r) => r.id === selectedRoomId) || room, [rooms, selectedRoomId, room])
  const isPrivate = selectedRoomObj.type === 'private'
  
  const availableBeds = useMemo(() => {
    return selectedRoomObj.beds.filter((b) => b.status === 'active' && !occupiedBedIds.has(b.id))
  }, [selectedRoomObj, occupiedBedIds])

  const isRoomFullyAvailable = useMemo(() => {
    const activeBeds = selectedRoomObj.beds.filter(b => b.status === 'active')
    return activeBeds.every(b => !occupiedBedIds.has(b.id))
  }, [selectedRoomObj, occupiedBedIds])

  const effectiveBedIds = isPrivate
    ? selectedRoomObj.beds.filter(b => b.status === 'active').map(b => b.id)
    : [selectedBedId || availableBeds[0]?.id || '']

  const effectiveBedId = effectiveBedIds[0] || ''
  const effectiveBedObj = availableBeds.find((b) => b.id === effectiveBedId)
  
  const bedDisplayName = isPrivate 
    ? `Habitación completa (${selectedRoomObj.name})`
    : (effectiveBedObj?.label || (effectiveBedId ? `Cama ${effectiveBedId.slice(-3)}` : 'Sin asignar'))

  // Set default standard price when bed changes
  useEffect(() => {
    if (isPrivate) {
      setStandardPricePerNight(selectedRoomObj.priceByGuestCount?.[String(guestCount)] ?? selectedRoomObj.basePriceRoom ?? 0)
    } else if (effectiveBedObj) {
      setStandardPricePerNight(effectiveBedObj.basePriceBed ?? selectedRoomObj.basePriceRoom ?? 50)
    }
  }, [effectiveBedObj, selectedRoomObj, isPrivate, guestCount])

  // v1.15: Sincronizar companionSlots cuando cambia guestCount
  useEffect(() => {
    const companionCount = Math.max(0, guestCount - 1)
    setCompanionSlots(prev => {
      if (companionCount > prev.length) {
        return [...prev, ...Array(companionCount - prev.length).fill(null).map(() => createEmptySlot())]
      }
      return prev.slice(0, companionCount)
    })
  }, [guestCount])

  // El precio por noche efectivo para el total estimado
  const effectivePricePerNight = pricingMode === 'manual' ? manualPricePerNight : standardPricePerNight

  const totalEstimate = useMemo(() => {
    // v1.7-hotfix: '' cuenta como 1 solo para el preview
    const n = typeof nights === 'number' && nights >= 1 ? nights : 1
    return n * Math.max(0, effectivePricePerNight)
  }, [nights, effectivePricePerNight])

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

  const effectiveReason = specialRateReason === 'Otro'
    ? (specialRateNote.trim() || 'Otro')
    : specialRateReason

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    let finalGuestId = selectedGuestId

    // Validate guest
    if (isNewGuest) {
      if (!firstName.trim() || !lastName.trim() || !docNumber.trim() || !birthDate.trim()) {
        setFormError('Por favor completa los campos obligatorios del huésped (Nombre, Apellido, Doc y Nacimiento).')
        return
      }
    } else {
      if (!finalGuestId) {
        setFormError('Selecciona un huésped o crea uno nuevo.')
        return
      }
    }

    if (isPrivate) {
      if (!isRoomFullyAvailable) {
        setFormError('La habitación seleccionada no está disponible completa para estas fechas.')
        return
      }
    } else {
      if (!effectiveBedId) {
        setFormError('No hay camas disponibles en la habitación seleccionada para estas fechas.')
        return
      }
    }

    // v1.7-hotfix: validación explícita — '' o 0 no cierran modal, muestran error amigable
    if (typeof nights !== 'number' || nights < 1) {
      setFormError('Ingresa al menos 1 noche para continuar.')
      return
    }

    // v1.7: validar precio manual
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

    // v1.15: Validar slots de acompañantes que tengan datos nuevos incompletos
    for (let i = 0; i < companionSlots.length; i++) {
      const slot = companionSlots[i]
      if (slot.mode === 'new' && !slot.validated) {
        if (slot.draft.firstName) {
          setFormError(`Acompañante ${i + 1}: completa todos los campos obligatorios.`)
          return
        }
      }
    }

    if (paymentData && paymentData.intent !== 'none' && paymentData.receivedAmount > 0) {
      if (!activeCashShift || activeCashShift.status !== 'open') {
        setFormError('No hay turno de caja abierto. Seleccione "Dejar pendiente" o abra un turno de caja primero.')
        return
      }
    }

    setSubmitting(true)
    try {
      let currentResId = createdReservationId

      if (!currentResId) {
        // 1. If new guest, save to Firestore and get ID properly!
        if (isNewGuest) {
          finalGuestId = await saveGuest(
            establishmentId,
            {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              documentType: docType,
              // v1.7: documentNumber siempre STRING — no convertir a number
              documentNumber: docNumber.trim(),
              nationality: nationality.trim(),
              birthDate: birthDate || null,
              whatsapp: whatsapp.trim(),
              email: email.trim() || null,
              occupation: null,
              previousCity: previousCity.trim() || null,
              nextCity: nextCity.trim() || null,
              emergencyContact: emergencyContact.trim() || null,
              notes: notes.trim() || null,
            }
          )
        }

        // v1.15: Guardar acompañantes nuevos y recolectar IDs
        const companionGuestIds: string[] = []
        for (const slot of companionSlots) {
          if (slot.mode === 'empty') continue
          if (slot.mode === 'existing' && slot.existingGuestId) {
            if (slot.existingGuestId !== finalGuestId) {
              companionGuestIds.push(slot.existingGuestId)
            }
          } else if (slot.mode === 'new' && slot.validated) {
            const cleaned = cleanDraft(slot.draft)
            const newCompanionId = await saveGuest(establishmentId, cleaned)
            companionGuestIds.push(newCompanionId)
          }
        }

        // 2. Build dates array for pricePerNight (v1.12: desde checkInDateStr)
        const dates: string[] = []
        for (
          let d = new Date(`${checkInDateStr}T12:00:00.000-04:00`);
          d < new Date(`${checkOutDateStr}T12:00:00.000-04:00`);
          d.setUTCDate(d.getUTCDate() + 1)
        ) {
          dates.push(d.toISOString().slice(0, 10))
        }

        // v1.7: para la matriz pricePerNight enviamos precio estándar como placeholder
        // El backend usará el pricingMode para determinar el precio real
        const placeholderPrice = pricingMode === 'standard' ? standardPricePerNight : 0
        const pricePerNightMatrix = Object.fromEntries(
          effectiveBedIds.map((bId) => [
            bId,
            Object.fromEntries(dates.map((date) => [date, isPrivate ? (bId === effectiveBedIds[0] ? placeholderPrice : 0) : placeholderPrice])),
          ])
        )

        // 3. Create instant reservation (will fail if availability conflicts in backend)
        // v1.7: guestCount siempre número — bed=1, full_room=guestCount explícito
        const resolvedGuestCount = isPrivate ? guestCount : 1

        // v1.12: checkIn usa checkInDateStr (puede ser retroactivo)
        const resResult = await createReservation({
          establishmentId,
          guestId: finalGuestId,
          roomId: selectedRoomObj.id,
          bedIds: effectiveBedIds,
          saleMode: isPrivate ? 'full_room' : 'bed',
          checkIn: checkInDateStr,
          checkOut: checkOutDateStr,
          pricePerNight: pricePerNightMatrix,
          channel: 'direct',
          // v1.7: guestCount siempre número, nunca undefined
          guestCount: resolvedGuestCount,
          // v1.15: usar companionGuestIds en lugar de dropdown IDs
          guestIds: isPrivate ? companionGuestIds : undefined,
          // v1.7: pricingMode y precio manual
          pricingMode,
          ...(pricingMode === 'manual' ? {
            manualPricePerNight,
            specialRateReason: effectiveReason,
          } : {}),
        })

        if (!resResult?.reservationId) {
          throw new Error('No se pudo generar la reserva para el check-in.')
        }
        currentResId = resResult.reservationId
        setCreatedReservationId(currentResId)
      }

      // 4. Perform immediate check-in
      try {
        await checkInGuest({
          establishmentId,
          reservationId: currentResId,
          guestIds: isPrivate ? [finalGuestId, ...companionSlots.map(s => s.mode === 'existing' ? s.existingGuestId : s.validated ? 'new' : null).filter(Boolean) as string[]] : [finalGuestId],
          roomId: selectedRoomObj.id,
          bedIds: effectiveBedIds,
          expectedCheckOutDate: checkOutDateStr,
          deposit: 0,
          documentVerified: true,
          initialPayment: (paymentData && paymentData.intent !== 'none' && paymentData.receivedAmount > 0) ? {
            amount: paymentData.amount,
            method: paymentData.method,
            currencyCode: paymentData.currencyCode,
            receivedAmount: paymentData.receivedAmount,
            reference: paymentData.reference || undefined
          } : undefined
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al procesar check-in'
        throw new Error(`Se creó la reserva pero no se completó el Check-in. Motivo: ${msg}`)
      }

      onSuccess(`¡Walk-in registrado con éxito! Huésped alojado en ${bedDisplayName}.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar walk-in'
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
        style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">Llegada Inmediata (Mostrador)</span>
            <h2>Walk-in: Recepción</h2>
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
              Buscar o seleccionar huésped titular:
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
              {/* v1.7: type="text" — documentos alfanuméricos como AT117122 */}
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                required
                placeholder="12345678 o AT117122"
              />
            </div>
            <div>
              <label>Nacionalidad</label>
              <input
                type="text"
                list="countries-walkin"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="Ej. Boliviana"
              />
              <datalist id="countries-walkin">
                {countries.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label>Fecha de Nacimiento *</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
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
            <div>
              <label>Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label>Ciudad Anterior</label>
              <input
                type="text"
                value={previousCity}
                onChange={(e) => setPreviousCity(e.target.value)}
              />
            </div>
            <div>
              <label>Siguiente Destino</label>
              <input
                type="text"
                value={nextCity}
                onChange={(e) => setNextCity(e.target.value)}
              />
            </div>
            <div>
              <label>Contacto Emergencia</label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Nombre y teléfono"
              />
            </div>
            <div>
              <label>Notas</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alergias, etc."
              />
            </div>
          </div>
        )}

        <hr style={{ margin: '14px 0', borderTop: '1px solid var(--line)' }} />

        {/* v1.12: Fecha real de ingreso */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
            <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Fecha de ingreso
          </label>
          <input
            type="date"
            value={checkInDateStr}
            max={todayStr}
            onChange={(e) => {
              const val = e.target.value
              if (val && val <= todayStr) {
                setCheckInDateStr(val)
              }
            }}
            style={{
              width: '100%',
              borderColor: isRetroactive ? '#f59e0b' : undefined,
            }}
          />
          {isRetroactive && (
            <div style={{
              marginTop: '8px',
              padding: '10px 12px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              lineHeight: 1.5,
              color: '#92400e',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}>
              <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '2px' }}>Ingreso retroactivo</strong>
                Este ingreso será registrado con fecha anterior.
                Verifica que la habitación realmente estuvo ocupada desde esa fecha.
              </div>
            </div>
          )}
        </div>

        {/* Room and Bed Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Habitación</label>
            <select
              value={selectedRoomId}
              onChange={(e) => {
                setSelectedRoomId(e.target.value)
                setSelectedBedId('')
                setGuestCount(1)
                setCompanionSlots([])
              }}
              required
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {!isPrivate ? (
            <div>
              <label>Cama (Libre todo el rango)</label>
              <select
                value={effectiveBedId}
                onChange={(e) => setSelectedBedId(e.target.value)}
                required
                disabled={availableBeds.length === 0}
              >
                {availableBeds.length === 0 && <option value="">Ninguna disponible</option>}
                {availableBeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label || `Cama ${b.id.slice(-3)}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Ocupantes (Privada)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button type="button" className="secondary-button compact-button" onClick={() => setGuestCount((c) => Math.max(1, c - 1))} style={{ padding: '4px 8px' }}>-</button>
                  <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 600 }}>{guestCount}</span>
                  <button type="button" className="secondary-button compact-button" onClick={() => setGuestCount((c) => Math.min(selectedRoomObj.maxGuests || 99, c + 1))} style={{ padding: '4px 8px' }}>+</button>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* v1.15: Sección de acompañantes inline con acordeones */}
        {isPrivate && guestCount > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <MultiGuestSection
              guestCount={guestCount - 1}
              slots={companionSlots}
              onSlotsChange={setCompanionSlots}
              existingGuests={existingGuests}
              usedGuestIds={selectedGuestId ? [selectedGuestId] : []}
              disabled={submitting}
              titularIndex={-1}
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
              El titular ya fue seleccionado arriba. Aquí se registran los acompañantes (opcionales).
            </div>
          </div>
        )}

        {/* Noches */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Noches</label>
          <input
            id="walk-in-nights"
            type="number"
            min="1"
            value={nights}
            onChange={(e) => {
              // v1.7-hotfix: permitir '' temporalmente — no colapsar a 1 mientras el usuario edita
              const val = e.target.value
              if (val === '') {
                setNights('')
              } else {
                const n = parseInt(val, 10)
                if (!isNaN(n) && n >= 0) setNights(n)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
              }
            }}
            style={{ width: '100px' }}
          />
        </div>

        {/* v1.7: Selector de Tarifa */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block', fontSize: '13px' }}>Tarifa</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: `2px solid ${pricingMode === 'standard' ? 'var(--teal)' : 'var(--line)'}`,
                background: pricingMode === 'standard' ? 'var(--mint)' : 'transparent',
                fontWeight: pricingMode === 'standard' ? 600 : 400, flex: 1, justifyContent: 'center',
                fontSize: '13px',
              }}
            >
              <input type="radio" name="pricingModeWalkin" value="standard" checked={pricingMode === 'standard'} onChange={() => setPricingMode('standard')} style={{ display: 'none' }} />
              Tarifa normal
            </label>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: `2px solid ${pricingMode === 'manual' ? 'var(--coral)' : 'var(--line)'}`,
                background: pricingMode === 'manual' ? '#fff0eb' : 'transparent',
                fontWeight: pricingMode === 'manual' ? 600 : 400, flex: 1, justifyContent: 'center',
                fontSize: '13px',
              }}
            >
              <input type="radio" name="pricingModeWalkin" value="manual" checked={pricingMode === 'manual'} onChange={() => setPricingMode('manual')} style={{ display: 'none' }} />
              Tarifa especial
            </label>
          </div>

          {pricingMode === 'standard' ? (
            <div style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>Precio por noche (calculado):</span>
              <strong>{standardPricePerNight} BOB</strong>
            </div>
          ) : (
            <div style={{ padding: '12px', background: '#fff8f5', borderRadius: 'var(--radius-sm)', border: '1px solid #f9d5c5' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: specialRateReason === 'Otro' ? '10px' : '0' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', display: 'block' }}>Precio por noche (BOB)</label>
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
                  <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', display: 'block' }}>Motivo</label>
                  <select value={specialRateReason} onChange={(e) => setSpecialRateReason(e.target.value)}>
                    {SPECIAL_RATE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {specialRateReason === 'Otro' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', display: 'block' }}>Nota adicional</label>
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
        </div>

        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--ink)' }}>Pago del Hospedaje</h3>
          <IntegratedPayment
            totalCharges={totalEstimate}
            alreadyPaid={0}
            isShiftOpen={!!activeCashShift && activeCashShift.status === 'open'}
            defaultCurrency="BOB"
            onChange={setPaymentData}
          />
        </div>

        {/* Summary Card */}
        <div style={{ padding: '10px 14px', background: isRetroactive ? '#fffbeb' : 'var(--mint)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '13px', border: isRetroactive ? '1px solid #fde68a' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Fecha de Ingreso:</span>
            <strong style={{ color: isRetroactive ? '#d97706' : undefined }}>
              {checkInDateStr}{isRetroactive ? ' (retroactivo)' : ''}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Fecha de Salida Prevista:</span>
            <strong>{checkOutDateStr}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Total Estimado del Alojamiento:</span>
            <strong style={{ fontSize: '15px', color: totalEstimate === 0 ? 'var(--muted)' : 'var(--teal-deep)' }}>
              {totalEstimate} BOB
              {totalEstimate === 0 && pricingMode === 'manual' && (
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400, marginLeft: '6px' }}>
                  (gratuito)
                </span>
              )}
            </strong>
          </div>
          {pricingMode === 'manual' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start', color: 'var(--muted)', fontSize: '11px' }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Tarifa especial: {effectiveReason}. El backend registrará el precio y motivo.</span>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting || !effectiveBedId}>
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Procesando ingreso...
              </>
            ) : createdReservationId ? (
              'Reintentar Check-in'
            ) : (
              'Confirmar Check-in Inmediato'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
