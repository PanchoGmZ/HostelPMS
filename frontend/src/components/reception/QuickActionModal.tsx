import { X, Zap, CalendarDays, AlertTriangle, Sparkles, CheckCircle } from 'lucide-react'
import type { Bed, Room } from '../../types/rooms'

interface QuickActionModalProps {
  bed: Bed
  room: Room
  onClose: () => void
  onSelectWalkIn: (bed: Bed, room: Room) => void
  onSelectReservation: (bed: Bed, room: Room) => void
  onSelectMaintenance: (bed: Bed, room: Room) => void
  onMarkClean?: (bed: Bed, room: Room) => void
}

export function QuickActionModal({
  bed,
  room,
  onClose,
  onSelectWalkIn,
  onSelectReservation,
  onSelectMaintenance,
  onMarkClean,
}: QuickActionModalProps) {
  const isDirty = bed.cleaningPending
  const isMaintenance = bed.maintenanceBlocked || bed.status === 'inactive'
  const bedDisplayName = bed.label || `Cama ${bed.id.slice(-3)}`

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-form quick-action-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">{room.name} — Piso {room.floor}</span>
            <h2>{bedDisplayName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal">
            <X size={19} />
          </button>
        </div>

        <div className="quick-action-options">
          {isDirty ? (
            <div className="dirty-prompt">
              <div className="dirty-banner">
                <Sparkles size={24} className="dirty-icon" />
                <div>
                  <strong>Cama pendiente de limpieza</strong>
                  <p>Esta cama fue desocupada o programada para aseo y cambio de sábanas.</p>
                </div>
              </div>
              {onMarkClean && (
                <button
                  type="button"
                  className="primary-button full-width"
                  onClick={() => onMarkClean(bed, room)}
                >
                  <CheckCircle size={18} /> Marcar como Limpia y Disponible
                </button>
              )}
            </div>
          ) : isMaintenance ? (
            <div className="maintenance-prompt">
              <div className="maintenance-banner">
                <AlertTriangle size={24} className="maintenance-icon" />
                <div>
                  <strong>Cama fuera de servicio</strong>
                  <p>{bed.outOfServiceReason || 'En reparación o mantenimiento activo.'}</p>
                </div>
              </div>
              <p className="subtext">
                Para reanudar la disponibilidad, finaliza el incidente de mantenimiento correspondiente.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="action-card-btn primary-action"
                onClick={() => onSelectWalkIn(bed, room)}
              >
                <div className="action-icon zap">
                  <Zap size={24} />
                </div>
                <div className="action-text">
                  <strong>Walk-in (Llegada Inmediata)</strong>
                  <span>Huésped en mostrador que desea ingresar y ocupar la cama ahora mismo.</span>
                </div>
              </button>

              <button
                type="button"
                className="action-card-btn secondary-action"
                onClick={() => onSelectReservation(bed, room)}
              >
                <div className="action-icon calendar">
                  <CalendarDays size={24} />
                </div>
                <div className="action-text">
                  <strong>Nueva Reserva</strong>
                  <span>Crear una reserva con fechas futuras o confirmación anticipada.</span>
                </div>
              </button>

              <button
                type="button"
                className="action-card-btn maintenance-action"
                onClick={() => onSelectMaintenance(bed, room)}
              >
                <div className="action-icon warning">
                  <AlertTriangle size={24} />
                </div>
                <div className="action-text">
                  <strong>Bloquear por Mantenimiento</strong>
                  <span>Reportar avería o daño para impedir que la cama sea asignada.</span>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
