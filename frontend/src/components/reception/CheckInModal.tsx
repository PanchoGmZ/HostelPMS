import { useState, useMemo, useEffect, type FormEvent } from 'react'
import { X, AlertTriangle, Loader2, UserCheck, UserPlus, Search, CheckCircle2, Clock } from 'lucide-react'
import { checkInGuest } from '../../services/stays/staysService'
import { modifyReservation } from '../../services/reservations/reservationsService'
import { saveGuest, searchGuests } from '../../services/guests/guestsService'
import { GuestModal, type Draft, emptyDraft } from '../guests/GuestModal'
import { MultiGuestSection, createEmptySlot, createExistingSlot } from '../guests/MultiGuestSection'
import type { GuestSlot } from '../guests/MultiGuestSection'
import { cleanDraft } from '../guests/GuestInlineForm'
import type { Reservation } from '../../types/reservations'
import type { Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'

import type { CashShift } from '../../types/cash'
import { CURRENCIES } from '../../utils/currencies'

interface CheckInModalProps {
  establishmentId: string
  reservation?: Reservation | null
  reservations: Reservation[]
  rooms: Room[]
  guests: Guest[]
  activeCashShift: CashShift | null
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
  onReservationUpdated?: (updatedRes: Reservation) => void
}

function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateDisplay(timestamp?: { seconds: number } | null): string {
  if (!timestamp) return '–'
  const date = new Date(timestamp.seconds * 1000)
  return date.toLocaleDateString('es-ES', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function CheckInModal({
  establishmentId,
  reservation,
  reservations,
  rooms,
  guests,
  activeCashShift,
  onClose,
  onSuccess,
  onError,
  onReservationUpdated,
}: CheckInModalProps) {
  const confirmedReservations = useMemo(() => {
    return reservations.filter((r) => r.status === 'confirmed')
  }, [reservations])

  const [selectedResId, setSelectedResId] = useState<string>(
    reservation?.id ?? confirmedReservations[0]?.id ?? ''
  )
  const [localGuests, setLocalGuests] = useState<Guest[]>(guests)
  const [localReservations, setLocalReservations] = useState<Reservation[]>(
    reservation ? [reservation, ...confirmedReservations.filter((r) => r.id !== reservation.id)] : confirmedReservations
  )

  // Current active reservation being checked in
  const currentRes = useMemo(() => {
    return localReservations.find((r) => r.id === selectedResId) ?? reservation ?? null
  }, [localReservations, selectedResId, reservation])

  // Titular guest ID
  const [guestId, setGuestId] = useState<string>(currentRes?.primaryGuestId ?? '')
  const [deposit, setDeposit] = useState<number>(0)
  const [documentVerified, setDocumentVerified] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState(false)
  const [linkingGuest, setLinkingGuest] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Mode for completing guest details when quick booking
  const [showSearchRegistered, setShowSearchRegistered] = useState(false)
  const [guestSearchQuery, setGuestSearchQuery] = useState('')
  const [searchSelectedGuestId, setSearchSelectedGuestId] = useState<string>(localGuests[0]?.id ?? '')
  const [showNewGuestModal, setShowNewGuestModal] = useState(false)
  const [newGuestDraft, setNewGuestDraft] = useState<{ draft: Draft }>({ draft: emptyDraft })

  // v1.15: Multi-guest slots para check-in con múltiples personas
  const multiGuestCount = currentRes?.guestCount ?? 1
  const [multiGuestSlots, setMultiGuestSlots] = useState<GuestSlot[]>([])
  const [showMultiGuest, setShowMultiGuest] = useState(false)

  // v1.17: Pago integrado en Check-in
  const lodgingTotal = currentRes?.totalAmount ?? 0
  const defaultCurrency = currentRes?.currency ?? 'BOB'
  
  const [payNow, setPayNow] = useState(false)
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')
  const [payCurrency, setPayCurrency] = useState(defaultCurrency)
  const [payReceived, setPayReceived] = useState<number>(0)
  
  const isShiftOpen = !!activeCashShift && activeCashShift.status === 'open'

  // v1.15: Inicializar slots cuando cambia la reserva o los huéspedes
  useEffect(() => {
    if (!currentRes) return
    const count = currentRes.guestCount ?? 1
    if (count <= 1) {
      setShowMultiGuest(false)
      setMultiGuestSlots([])
      return
    }

    // Construir slots desde los guestIds existentes de la reserva
    const slots: GuestSlot[] = []
    // Slot 0 = titular (se maneja por separado)
    // Slots 1..n = acompañantes
    const existingCompanionIds = (currentRes.guestIds || []).filter(
      id => id !== currentRes.primaryGuestId
    )
    for (let i = 0; i < count - 1; i++) {
      if (i < existingCompanionIds.length) {
        slots.push(createExistingSlot(existingCompanionIds[i]))
      } else {
        slots.push(createEmptySlot())
      }
    }
    setMultiGuestSlots(slots)
  }, [currentRes?.id, currentRes?.guestCount])

  // Keep guestId in sync if currentRes changes
  useEffect(() => {
    if (currentRes?.primaryGuestId) {
      setGuestId(currentRes.primaryGuestId)
    } else {
      setGuestId('')
    }
  }, [currentRes])

  const room = useMemo(() => {
    return rooms.find((r) => r.id === currentRes?.roomId)
  }, [rooms, currentRes])

  const titularGuest = useMemo(() => {
    return localGuests.find((g) => g.id === (guestId || currentRes?.primaryGuestId))
  }, [localGuests, guestId, currentRes])

  const filteredSearchGuests = useMemo(() => {
    if (!guestSearchQuery.trim()) return localGuests
    const q = guestSearchQuery.toLowerCase()
    return localGuests.filter(
      (g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q)
    )
  }, [localGuests, guestSearchQuery])

  // Calculated check-out date
  const expectedCheckOut = useMemo(() => {
    if (currentRes?.checkOutDate?.seconds) {
      return toLocalDateString(new Date(currentRes.checkOutDate.seconds * 1000))
    }
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toLocalDateString(d)
  }, [currentRes])

  // v1.12: detectar check-in retroactivo (reserva con fecha de entrada en el pasado)
  const isRetroactiveCheckIn = useMemo(() => {
    if (!currentRes?.checkInDate?.seconds) return false
    const checkInMs = currentRes.checkInDate.seconds * 1000
    const nowStr = toLocalDateString(new Date())
    const checkInStr = toLocalDateString(new Date(checkInMs))
    return checkInStr < nowStr
  }, [currentRes])

  // Is this reservation a quick booking without guest file?
  const isQuickReservation = !currentRes?.primaryGuestId

  // Handler: open GuestModal with prefilled info from bookingContact
  const handleOpenNewGuestModal = () => {
    const contactName = currentRes?.bookingContact?.name?.trim() || ''
    const parts = contactName.split(/\s+/)
    const fName = parts[0] || ''
    const lName = parts.slice(1).join(' ') || ''
    const phone = currentRes?.bookingContact?.phone?.trim() || ''
    const note = currentRes?.bookingContact?.note?.trim() || ''

    setNewGuestDraft({
      draft: {
        ...emptyDraft,
        firstName: fName,
        lastName: lName,
        whatsapp: phone,
        notes: note ? `Nota de reserva rápida: ${note}` : '',
      },
    })
    setShowNewGuestModal(true)
  }

  // Handler: Save new guest and immediately link to this reservation
  const handleSaveNewGuest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!currentRes) return
    setSubmitting(true)
    setFormError(null)

    try {
      const newGuestId = await saveGuest(establishmentId, newGuestDraft.draft)
      const freshGuests = await searchGuests(establishmentId, '')
      setLocalGuests(freshGuests)

      // Link to existing reservation without duplicating anything
      await modifyReservation({
        establishmentId,
        reservationId: currentRes.id,
        primaryGuestId: newGuestId,
      })

      const updatedRes: Reservation = {
        ...currentRes,
        primaryGuestId: newGuestId,
        guestIds: [newGuestId],
      }

      setLocalReservations((prev) =>
        prev.map((r) => (r.id === currentRes.id ? updatedRes : r))
      )
      setGuestId(newGuestId)
      setShowNewGuestModal(false)
      setShowSearchRegistered(false)
      onReservationUpdated?.(updatedRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar huésped.'
      setFormError(`No se pudo completar el registro: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Handler: Link existing registered guest to this reservation
  const handleLinkRegisteredGuest = async () => {
    if (!currentRes || !searchSelectedGuestId) {
      setFormError('Selecciona un huésped registrado.')
      return
    }

    setLinkingGuest(true)
    setFormError(null)

    try {
      await modifyReservation({
        establishmentId,
        reservationId: currentRes.id,
        primaryGuestId: searchSelectedGuestId,
      })

      const updatedRes: Reservation = {
        ...currentRes,
        primaryGuestId: searchSelectedGuestId,
        guestIds: [searchSelectedGuestId],
      }

      setLocalReservations((prev) =>
        prev.map((r) => (r.id === currentRes.id ? updatedRes : r))
      )
      setGuestId(searchSelectedGuestId)
      setShowSearchRegistered(false)
      onReservationUpdated?.(updatedRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al vincular huésped.'
      setFormError(`No se pudo vincular el huésped: ${msg}`)
    } finally {
      setLinkingGuest(false)
    }
  }

  // Handler: Confirm Check-In
  const handleSubmitCheckIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!currentRes) {
      setFormError('Debes seleccionar una reserva confirmada.')
      return
    }

    const effectiveTitular = guestId || currentRes.primaryGuestId
    if (!effectiveTitular) {
      setFormError('No se puede realizar check-in sin un huésped titular. Completa la ficha del huésped primero.')
      return
    }

    if (!currentRes.roomId || !currentRes.bedIds || currentRes.bedIds.length === 0) {
      setFormError('La reserva no tiene habitación o camas asignadas.')
      return
    }

    // v1.15: Validar slots de acompañantes que tengan datos nuevos incompletos
    for (let i = 0; i < multiGuestSlots.length; i++) {
      const slot = multiGuestSlots[i]
      if (slot.mode === 'new' && !slot.validated && slot.draft.firstName) {
        setFormError(`Acompañante ${i + 1}: completa todos los campos obligatorios.`)
        return
      }
    }

    setSubmitting(true)
    try {
      // v1.15: Guardar acompañantes nuevos y recolectar IDs
      const companionIds: string[] = []
      for (const slot of multiGuestSlots) {
        if (slot.mode === 'empty') continue
        if (slot.mode === 'existing' && slot.existingGuestId) {
          if (slot.existingGuestId !== effectiveTitular) {
            companionIds.push(slot.existingGuestId)
          }
        } else if (slot.mode === 'new' && slot.validated) {
          const cleaned = cleanDraft(slot.draft)
          const newCompanionId = await saveGuest(establishmentId, cleaned)
          companionIds.push(newCompanionId)
        }
      }

      // v1.15: Si hay acompañantes, actualizar la reserva con los guestIds
      if (companionIds.length > 0) {
        await modifyReservation({
          establishmentId,
          reservationId: currentRes.id,
          guestIds: companionIds,
        })
      }

      await checkInGuest({
        establishmentId,
        reservationId: currentRes.id,
        guestIds: [effectiveTitular, ...companionIds],
        roomId: currentRes.roomId,
        bedIds: currentRes.bedIds,
        expectedCheckOutDate: expectedCheckOut,
        deposit: Number(deposit) || 0,
        documentVerified,
        // v1.17: Pago inicial integrado
        initialPayment: (payNow && payReceived > 0) ? {
          amount: lodgingTotal,
          method: payMethod,
          currencyCode: payCurrency,
          receivedAmount: payReceived,
        } : undefined,
      })

      onSuccess(`Check-in completado exitosamente para ${titularGuest ? `${titularGuest.firstName} ${titularGuest.lastName}` : 'el huésped'}${companionIds.length > 0 ? ` y ${companionIds.length} acompañante(s)` : ''}.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el check-in'
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
        style={{ maxWidth: '560px', width: '90%', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmitCheckIn}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">
              {isQuickReservation ? 'Reserva rápida · Datos pendientes' : 'Recepción'}
            </span>
            <h2>Procesar Check-in</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ marginBottom: '12px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        {/* Selector de reserva confirmada (si no fue pre-fijada) */}
        {!reservation && (
          <label style={{ background: '#f4f8f6', padding: '10px', borderRadius: '6px', border: '1px solid #cce3d8', marginBottom: '12px', display: 'block' }}>
            <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Reserva Confirmada
            </span>
            <select
              value={selectedResId}
              onChange={(e) => {
                setSelectedResId(e.target.value)
                setFormError(null)
              }}
              required
            >
              <option value="">Selecciona una reserva...</option>
              {localReservations.map((r) => {
                const g = localGuests.find((item) => item.id === r.primaryGuestId)
                const name = g
                  ? `${g.firstName} ${g.lastName}`
                  : (r.bookingContact?.name ? `${r.bookingContact.name} ⚠️ (Datos pendientes)` : 'Huésped no asignado')
                return (
                  <option key={r.id} value={r.id}>
                    Reserva #{r.id.slice(0, 6)} · {name} ({formatDateDisplay(r.checkInDate)})
                  </option>
                )
              })}
            </select>
          </label>
        )}

        {/* CASO A: Reserva Rápida (Sin titular registrado) */}
        {isQuickReservation ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <AlertTriangle size={18} color="#d97706" />
              <h3 style={{ margin: 0, fontSize: '14px', color: '#92400e', fontWeight: 700 }}>
                Completar datos del huésped
              </h3>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#78350f', lineHeight: 1.5 }}>
              Esta reserva fue creada como <strong>Reserva rápida</strong>. Para realizar el Check-in, debes vincular un huésped titular con su ficha registrada.
            </p>

            {/* Datos de contacto de la reserva rápida */}
            <div style={{ background: '#ffffff', border: '1px solid #fef3c7', borderRadius: '6px', padding: '10px', marginBottom: '12px', fontSize: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '4px' }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Nombre de referencia:</span>{' '}
                  <strong>{currentRes?.bookingContact?.name || 'Lucía'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Teléfono / contacto:</span>{' '}
                  <strong>{currentRes?.bookingContact?.phone || 'No registrado'}</strong>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Personas:</span>{' '}
                  <strong>{currentRes?.guestCount ?? 1} huésped(es)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Habitación:</span>{' '}
                  <strong>{room?.name || 'Asignada'}</strong>
                </div>
              </div>
              {currentRes?.bookingContact?.note && (
                <div style={{ marginTop: '4px', color: 'var(--muted)' }}>
                  Nota: <em>{currentRes.bookingContact.note}</em>
                </div>
              )}
            </div>

            {/* Botones de acción: Buscar existente vs Registrar nuevo */}
            {!showSearchRegistered ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="primary-button compact-button"
                  style={{ background: '#059669', borderColor: '#059669', flex: 1 }}
                  onClick={handleOpenNewGuestModal}
                  disabled={submitting || linkingGuest}
                >
                  <UserPlus size={14} /> Registrar nuevo huésped
                </button>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowSearchRegistered(true)}
                  disabled={submitting || linkingGuest}
                >
                  <Search size={14} /> Buscar huésped registrado
                </button>
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, margin: 0 }}>
                    Buscar en huéspedes existentes:
                  </label>
                  <button
                    type="button"
                    className="text-link"
                    style={{ fontSize: '11px' }}
                    onClick={() => setShowSearchRegistered(false)}
                  >
                    Cancelar búsqueda
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Nombre o documento..."
                  value={guestSearchQuery}
                  onChange={(e) => setGuestSearchQuery(e.target.value)}
                  style={{ marginBottom: '6px', width: '100%', fontSize: '12px' }}
                />
                <select
                  value={searchSelectedGuestId}
                  onChange={(e) => setSearchSelectedGuestId(e.target.value)}
                  style={{ width: '100%', marginBottom: '8px', fontSize: '12px' }}
                >
                  {filteredSearchGuests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.firstName} {g.lastName} ({g.documentNumber})
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="primary-button compact-button"
                    style={{ flex: 1 }}
                    onClick={handleLinkRegisteredGuest}
                    disabled={linkingGuest}
                  >
                    {linkingGuest ? (
                      <>
                        <Loader2 size={13} className="loader" /> Vinculando...
                      </>
                    ) : (
                      'Vincular y Continuar'
                    )}
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={handleOpenNewGuestModal}
                  >
                    <UserPlus size={14} /> Crear Nuevo
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CASO B: Reserva con Huésped Titular Vinculado */
          <div style={{ marginBottom: '14px' }}>
            <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Huésped Titular Confirmado
                </span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#14532d', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <UserCheck size={16} />
                  {titularGuest ? `${titularGuest.firstName} ${titularGuest.lastName}` : 'Huésped Registrado'}
                  {titularGuest?.documentNumber && (
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>
                      (Doc: {titularGuest.documentNumber})
                    </span>
                  )}
                </div>
              </div>
              <CheckCircle2 size={20} color="#16a34a" />
            </div>

            {/* Resumen de Habitación y Camas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', marginBottom: '2px', display: 'block' }}>Habitación</label>
                <div style={{ padding: '8px 10px', background: 'var(--paper)', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13px', fontWeight: 600 }}>
                  {room?.name || 'Habitación'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', marginBottom: '2px', display: 'block' }}>Camas asignadas</label>
                <div style={{ padding: '8px 10px', background: 'var(--paper)', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13px' }}>
                  {currentRes?.bedIds?.length ?? 1} cama(s)
                </div>
              </div>
            </div>

            {/* Fechas de Estadía */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', marginBottom: '2px', display: 'block' }}>Check-in</label>
                <div style={{ padding: '8px 10px', background: 'var(--paper)', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13px' }}>
                  {formatDateDisplay(currentRes?.checkInDate)}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', marginBottom: '2px', display: 'block' }}>Check-out previsto</label>
                <div style={{ padding: '8px 10px', background: 'var(--paper)', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13px' }}>
                  {formatDateDisplay(currentRes?.checkOutDate)}
                </div>
              </div>
            </div>

            {/* v1.12: Indicador de check-in retroactivo */}
            {isRetroactiveCheckIn && (
              <div style={{
                padding: '10px 12px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '12px',
                lineHeight: 1.5,
                color: '#92400e',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}>
                <Clock size={16} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <strong style={{ display: 'block', marginBottom: '2px' }}>Check-in retroactivo</strong>
                  Esta reserva tiene fecha de ingreso anterior a hoy.
                  Se registrará con la fecha original: {formatDateDisplay(currentRes?.checkInDate)}.
                </div>
              </div>
            )}

            {/* v1.15: Sección multi-guest para acompañantes */}
            {multiGuestCount > 1 && (
              <div style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowMultiGuest(!showMultiGuest)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '8px 10px',
                    background: showMultiGuest ? '#f0f9ff' : 'var(--paper)',
                    border: `1px solid ${showMultiGuest ? '#bae6fd' : 'var(--line)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    marginBottom: showMultiGuest ? '10px' : '0',
                  }}
                >
                  <UserPlus size={14} />
                  Registrar acompañantes ({multiGuestSlots.filter(s => s.mode !== 'empty').length}/{multiGuestCount - 1} opcionales)
                </button>
                {showMultiGuest && (
                  <MultiGuestSection
                    guestCount={multiGuestCount - 1}
                    slots={multiGuestSlots}
                    onSlotsChange={setMultiGuestSlots}
                    existingGuests={localGuests}
                    usedGuestIds={guestId ? [guestId] : []}
                    disabled={submitting}
                    titularIndex={-1}
                  />
                )}
              </div>
            )}

            {/* Depósito y Documento Verificado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', marginBottom: '2px', display: 'block' }}>Depósito / Garantía (BOB)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={deposit}
                  onChange={(e) => setDeposit(Number(e.target.value) || 0)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '18px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', margin: 0, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={documentVerified}
                    onChange={(e) => setDocumentVerified(e.target.checked)}
                  />
                  Documento verificado
                </label>
              </div>
            </div>
          </div>
        )}

        {/* v1.17: Resumen de Hospedaje y Pago Integrado */}
        {!isQuickReservation && currentRes && (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--ink)' }}>Resumen del Hospedaje</h3>
            <div style={{ background: 'var(--surface-2, #f8fafc)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                <span>Alojamiento ({currentRes.guestCount} pers)</span>
                <strong>{lodgingTotal.toFixed(2)} {defaultCurrency}</strong>
              </div>
              {deposit > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', color: 'var(--muted)' }}>
                  <span>Depósito / Garantía</span>
                  <span>{deposit.toFixed(2)} BOB</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)', fontSize: '14px', fontWeight: 700 }}>
                <span>Total a Cobrar</span>
                <span>{lodgingTotal.toFixed(2)} {defaultCurrency}</span>
              </div>
            </div>

            {lodgingTotal > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={payNow}
                    onChange={(e) => {
                      setPayNow(e.target.checked)
                      if (e.target.checked) {
                        setPayReceived(lodgingTotal)
                        setPayCurrency(defaultCurrency)
                      }
                    }}
                  />
                  Cobrar alojamiento ahora
                </label>

                {payNow && (
                  <div style={{ marginTop: '10px', padding: '12px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    {!isShiftOpen && (
                      <div className="form-error" style={{ marginBottom: '8px' }}>
                        <AlertTriangle size={14} /> Sin turno de caja abierto. No se puede cobrar.
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ fontSize: '12px' }}>Método *</label>
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'cash' | 'card' | 'transfer' | 'qr')} disabled={!isShiftOpen}>
                          <option value="cash">💵 Efectivo</option>
                          <option value="card">💳 Tarjeta</option>
                          <option value="qr">📱 QR</option>
                          <option value="transfer">🏦 Transferencia</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px' }}>Moneda *</label>
                        <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)} disabled={!isShiftOpen}>
                          {CURRENCIES.slice(0, 6).map((c) => (
                            <option key={c.code} value={c.code}>{c.code}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px' }}>Monto recibido *</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={payReceived}
                        onChange={(e) => setPayReceived(Number(e.target.value))}
                        disabled={!isShiftOpen}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Acciones del Modal */}
        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting || linkingGuest}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={submitting || linkingGuest || isQuickReservation}
            title={isQuickReservation ? 'Completa los datos del huésped antes de realizar el Check-in' : 'Confirmar Check-in'}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Procesando Check-in...
              </>
            ) : isQuickReservation ? (
              'Datos pendientes de completar'
            ) : (
              'Confirmar Check-in'
            )}
          </button>
        </div>
      </form>

      {/* GuestModal inline para registrar nuevo huésped si venía de reserva rápida */}
      {showNewGuestModal && (
        <GuestModal
          editor={newGuestDraft}
          onChange={setNewGuestDraft}
          onClose={() => setShowNewGuestModal(false)}
          onSubmit={handleSaveNewGuest}
          submitting={submitting}
        />
      )}
    </div>
  )
}
