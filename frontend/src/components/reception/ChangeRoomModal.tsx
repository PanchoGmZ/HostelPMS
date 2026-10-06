import { useState, useMemo, type FormEvent } from 'react'
import { X, AlertTriangle, Loader2, BedDouble, ArrowRight, Info } from 'lucide-react'
import { changeBedInStay } from '../../services/stays/staysService'
import type { Stay } from '../../types/stays'
import type { Room, Bed } from '../../types/rooms'

interface ChangeRoomModalProps {
  establishmentId: string
  stay: Stay
  rooms: Room[]
  currentRoom?: Room | null
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

function toLocalDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function formatDate(val?: { seconds: number } | null): string {
  if (!val) return '–'
  return new Date(val.seconds * 1000).toLocaleDateString('es-ES', {
    timeZone: 'America/La_Paz',
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function ChangeRoomModal({
  establishmentId,
  stay,
  rooms,
  currentRoom,
  onClose,
  onSuccess,
  onError,
}: ChangeRoomModalProps) {
  const todayStr = toLocalDateString(new Date())
  const checkInStr = toLocalDateString(new Date(stay.checkInDate.seconds * 1000))
  const checkOutStr = toLocalDateString(new Date(stay.expectedCheckOutDate.seconds * 1000))

  // Detectar saleMode de la stay
  const saleMode = stay.saleMode ?? (stay.bedIds.length > 1 ? 'full_room' : 'bed')
  const isFullRoom = saleMode === 'full_room'

  // Fecha efectiva del cambio (default HOY)
  const [effectiveDate, setEffectiveDate] = useState(todayStr)

  // Selección destino
  const [toRoomId, setToRoomId] = useState<string>('')
  const [toBedIds, setToBedIds] = useState<string[]>([])
  const [reason, setReason] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Rooms disponibles como destino (excluir la actual si es la misma combinación)
  const availableRooms = useMemo(() => {
    return rooms.filter((r) => r.status === 'active')
  }, [rooms])

  const selectedRoom = useMemo(() => availableRooms.find((r) => r.id === toRoomId), [availableRooms, toRoomId])

  // Beds disponibles del room destino
  const availableBeds = useMemo(() => {
    if (!selectedRoom) return []
    return selectedRoom.beds.filter((b) => b.status === 'active' && !b.maintenanceBlocked)
  }, [selectedRoom])

  // Para full_room, seleccionamos todas las camas del room
  const handleRoomChange = (roomId: string) => {
    setToRoomId(roomId)
    setToBedIds([])
    setFormError(null)
    if (isFullRoom) {
      const room = availableRooms.find((r) => r.id === roomId)
      if (room) {
        const allBeds = room.beds.filter((b) => b.status === 'active' && !b.maintenanceBlocked).map((b) => b.id)
        setToBedIds(allBeds)
      }
    }
  }

  const handleBedToggle = (bedId: string) => {
    if (isFullRoom) return  // full_room siempre toma todas
    setToBedIds((prev) =>
      prev.includes(bedId) ? prev.filter((id) => id !== bedId) : [...prev, bedId]
    )
    setFormError(null)
  }

  // Validar que la nueva ubicación no es la misma
  const isSameLocation = useMemo(() => {
    if (toRoomId !== stay.roomId) return false
    const sortedNew = [...toBedIds].sort().join(',')
    const sortedOld = [...stay.bedIds].sort().join(',')
    return sortedNew === sortedOld
  }, [toRoomId, toBedIds, stay.roomId, stay.bedIds])

  // Detectar incompatibilidad de modo (bed↔full_room)
  const isModeMismatch = useMemo(() => {
    if (!selectedRoom) return false
    const dstIsFullRoom = toBedIds.length > 1 || isFullRoom
    return isFullRoom !== dstIsFullRoom
  }, [selectedRoom, toBedIds, isFullRoom])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!toRoomId) {
      setFormError('Selecciona la habitación destino.')
      return
    }
    if (toBedIds.length === 0) {
      setFormError('Selecciona al menos una cama destino.')
      return
    }
    if (isSameLocation) {
      setFormError('La nueva ubicación es la misma que la actual.')
      return
    }
    if (effectiveDate < checkInStr) {
      setFormError(`La fecha efectiva no puede ser anterior al check-in (${checkInStr}).`)
      return
    }
    if (effectiveDate >= checkOutStr) {
      setFormError(`La fecha efectiva debe ser anterior a la salida prevista (${checkOutStr}).`)
      return
    }

    setSubmitting(true)
    try {
      await changeBedInStay({
        establishmentId,
        stayId: stay.id,
        toRoomId,
        toBedIds,
        effectiveDate,
        reason: reason.trim() || undefined,
      })
      onSuccess(`Cambio de habitación completado. Nueva ubicación: ${selectedRoom?.name ?? toRoomId}.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar habitación'
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
        style={{ maxWidth: '500px' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker" style={{ color: 'var(--accent, #6366f1)' }}>Sin Check-out</span>
            <h2>Cambiar Habitación / Cama</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
        </div>

        {formError && (
          <div className="form-error">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* UBICACIÓN ACTUAL */}
        <div className="stay-notice" style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7, marginBottom: '6px' }}>UBICACIÓN ACTUAL</div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>Habitación</span>
              <div><strong>{currentRoom?.name ?? stay.roomId}</strong></div>
            </div>
            <div>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>Cama(s)</span>
              <div><strong>{stay.bedIds.join(', ')}</strong></div>
            </div>
            <div>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>Salida prevista</span>
              <div><strong>{formatDate(stay.expectedCheckOutDate)}</strong></div>
            </div>
          </div>
        </div>

        {/* Fecha efectiva */}
        <div style={{ marginBottom: '14px' }}>
          <label>Fecha efectiva del cambio *</label>
          <input
            type="date"
            value={effectiveDate}
            min={checkInStr}
            max={(() => {
              const d = new Date(`${checkOutStr}T12:00:00.000-04:00`)
              d.setUTCDate(d.getUTCDate() - 1)
              return toLocalDateString(d)
            })()}
            onChange={(e) => setEffectiveDate(e.target.value)}
            required
          />
          {effectiveDate < todayStr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '12px', color: 'var(--amber, #d97706)' }}>
              <Info size={12} /> Cambio retroactivo: se ajustará la disponibilidad histórica.
            </div>
          )}
        </div>

        {/* NUEVA UBICACIÓN */}
        <div style={{ marginBottom: '14px' }}>
          <label>Habitación destino *</label>
          <select value={toRoomId} onChange={(e) => handleRoomChange(e.target.value)} required>
            <option value="">— Seleccionar habitación —</option>
            {availableRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.type === 'private' ? 'Privada' : 'Dormitorio'})
              </option>
            ))}
          </select>
        </div>

        {selectedRoom && (
          <div style={{ marginBottom: '14px' }}>
            <label>{isFullRoom ? 'Camas de la habitación destino (todas)' : 'Cama destino *'}</label>
            {availableBeds.length === 0 ? (
              <div className="form-error" style={{ fontSize: '13px' }}>
                <AlertTriangle size={14} /> No hay camas activas en esta habitación.
              </div>
            ) : isFullRoom ? (
              <div style={{ fontSize: '13px', padding: '8px', background: 'var(--surface-2, #f8fafc)', borderRadius: '6px' }}>
                <BedDouble size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Se tomarán todas las camas: <strong>{availableBeds.map(b => b.label).join(', ')}</strong>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {availableBeds.map((bed: Bed) => (
                  <button
                    key={bed.id}
                    type="button"
                    className={`filter-chip ${toBedIds.includes(bed.id) ? 'active' : ''}`}
                    onClick={() => handleBedToggle(bed.id)}
                    style={{ padding: '6px 12px' }}
                  >
                    <BedDouble size={13} style={{ marginRight: '4px' }} />
                    {bed.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aviso modo incompatible */}
        {isModeMismatch && (
          <div className="stay-notice critical" style={{ marginBottom: '14px', display: 'flex', gap: '10px' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Cambio de modo no permitido</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                Este tipo de cambio (cama individual ↔ habitación completa) requiere una nueva operación de reserva.
              </p>
            </div>
          </div>
        )}

        {/* Aviso: folio no se toca */}
        {toRoomId && toBedIds.length > 0 && !isSameLocation && !isModeMismatch && (
          <div className="stay-notice" style={{ marginBottom: '14px', fontSize: '13px' }}>
            <Info size={14} />
            El precio del alojamiento NO cambia automáticamente.
            Si necesitas cobrar diferencia, usa "Registrar Pago" o agrega un cargo manual desde el Folio.
          </div>
        )}

        {/* Dirección del cambio */}
        {toRoomId && toBedIds.length > 0 && !isSameLocation && !isModeMismatch && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px',
            background: 'var(--surface-2, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '8px',
            marginBottom: '14px',
            fontSize: '13px',
            flexWrap: 'wrap',
          }}>
            <span>{currentRoom?.name ?? stay.roomId}</span>
            <ArrowRight size={14} style={{ opacity: 0.5 }} />
            <strong>{selectedRoom?.name}</strong>
            <span style={{ opacity: 0.6 }}>desde {effectiveDate}</span>
          </div>
        )}

        {/* Motivo (opcional) */}
        <div style={{ marginBottom: '16px' }}>
          <label>Motivo del cambio (opcional)</label>
          <input
            type="text"
            placeholder="Ej: Solicitud del huésped, ruido, mantenimiento..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={submitting || !toRoomId || toBedIds.length === 0 || isSameLocation || isModeMismatch}
          >
            {submitting ? (
              <><Loader2 size={16} className="loader" /> Cambiando...</>
            ) : (
              <><BedDouble size={15} /> Confirmar Cambio</>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
