import { X, Edit3, Eye, Power, BedDouble, BedSingle, Tag, AlertTriangle } from 'lucide-react'
import type { Bed, Room } from '../../types/rooms'
import './BedVisualUnit.css'

interface BedActionModalProps {
  bed: Bed
  room: Room
  onClose: () => void
  onEditBed: (bed: Bed) => void
  onViewBed: (bed: Bed) => void
  onToggleStatus: (bed: Bed) => void
}

export function BedActionModal({
  bed,
  room,
  onClose,
  onEditBed,
  onViewBed,
  onToggleStatus,
}: BedActionModalProps) {
  const isDouble = bed.bedType === '2_plazas'
  const isOutOfService = bed.status !== 'active' || Boolean(bed.outOfServiceReason) || bed.maintenanceBlocked
  const price = bed.basePriceBed || room.basePriceRoom || 0

  return (
    <div className="bed-action-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="bed-action-title">
      <div className="bed-action-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bed-action-modal-header">
          <div className="bed-action-title-group">
            <h3 id="bed-action-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isDouble ? <BedDouble size={18} color="#0d9488" /> : <BedSingle size={18} color="#0d9488" />}
              {bed.label}
            </h3>
            <div className="bed-action-subtitle">
              {room.name} · Piso {room.floor || '1'} · {isDouble ? '2 plazas' : '1 plaza'}
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar opciones de cama"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Info resumen */}
        <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}>
            <Tag size={14} />
            <span>Tarifa: <strong style={{ color: '#0f172a' }}>{price} BOB</strong></span>
          </div>
          <div>
            {isOutOfService ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>
                <AlertTriangle size={11} /> Fuera de servicio
              </span>
            ) : bed.isAvailable === false ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>
                Ocupada
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 700 }}>
                Disponible
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="bed-action-modal-body">
          <button
            type="button"
            className="bed-action-btn-item"
            onClick={() => {
              onClose()
              onEditBed(bed)
            }}
          >
            <Edit3 size={16} style={{ color: '#0d9488' }} />
            <div>
              <div>Editar configuración</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>Cambiar nombre, tarifa o tipo (1/2 plazas)</div>
            </div>
          </button>

          <button
            type="button"
            className="bed-action-btn-item"
            onClick={() => {
              onClose()
              onViewBed(bed)
            }}
          >
            <Eye size={16} style={{ color: '#0284c7' }} />
            <div>
              <div>Ver detalle completo</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>Ficha técnica, historial y bloqueo de cama</div>
            </div>
          </button>

          <button
            type="button"
            className={`bed-action-btn-item ${!isOutOfService ? 'danger-action' : ''}`}
            onClick={() => {
              onClose()
              onToggleStatus(bed)
            }}
          >
            <Power size={16} style={{ color: !isOutOfService ? '#dc2626' : '#10b981' }} />
            <div>
              <div>{!isOutOfService ? 'Poner fuera de servicio' : 'Reactivar cama'}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                {!isOutOfService ? 'Bloquear para mantenimiento o reparaciones' : 'Habilitar nuevamente para reservas'}
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="bed-action-modal-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
