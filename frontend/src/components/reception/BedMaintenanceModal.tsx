import { useState, type FormEvent } from 'react'
import { X, AlertTriangle, Loader2 } from 'lucide-react'
import { createIncident } from '../../services/operations/operationsService'
import type { Bed, Room } from '../../types/rooms'

interface BedMaintenanceModalProps {
  establishmentId: string
  bed: Bed
  room: Room
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

export function BedMaintenanceModal({
  establishmentId,
  bed,
  room,
  onClose,
  onSuccess,
  onError,
}: BedMaintenanceModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const bedDisplayName = bed.label || `Cama ${bed.id.slice(-3)}`

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!reason.trim()) {
      setFormError('Describe brevemente el motivo o avería.')
      return
    }

    setSubmitting(true)
    try {
      await createIncident(establishmentId, {
        roomId: room.id,
        bedId: bed.id,
        reason: reason.trim(),
        status: 'pending',
        blocksResource: true,
      })

      onSuccess(`${bedDisplayName} bloqueada por mantenimiento.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar mantenimiento'
      setFormError(`No se pudo bloquear la cama: ${msg}`)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-form"
        style={{ maxWidth: '440px' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker" style={{ color: 'var(--danger)' }}>Bloquear Disponibilidad</span>
            <h2>Mantenimiento: {bedDisplayName}</h2>
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

        <div style={{ marginBottom: '14px' }}>
          <label>Motivo o avería *</label>
          <textarea
            rows={3}
            placeholder="Ej: Colchón roto, escalera suelta, toma corriente descompuesto..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="stay-notice" style={{ fontSize: '12px', margin: '0 0 14px' }}>
          <AlertTriangle size={14} />
          <span>Al confirmar, la cama pasará a estado <strong>Mantenimiento</strong> y no podrá ser vendida ni reservada.</span>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="danger-button" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Bloqueando...
              </>
            ) : (
              'Bloquear Cama'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
