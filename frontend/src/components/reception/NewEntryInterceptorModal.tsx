import { Search, UserPlus, X } from 'lucide-react'

interface NewEntryInterceptorModalProps {
  onClose: () => void
  onHasReservation: () => void
  onWalkIn: () => void
}

export function NewEntryInterceptorModal({
  onClose,
  onHasReservation,
  onWalkIn,
}: NewEntryInterceptorModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-form" style={{ maxWidth: '420px', padding: '32px 24px' }}>
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', textAlign: 'center', width: '100%' }}>Nuevo Ingreso</h2>
          <button type="button" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}>
            <X size={20} />
          </button>
        </div>
        
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: '24px' }}>
          ¿El huésped tiene una reserva previa registrada?
        </p>

        <div style={{ display: 'grid', gap: '12px' }}>
          <button
            type="button"
            className="secondary-button"
            style={{ padding: '16px', justifyContent: 'flex-start', border: '1px solid var(--teal)', color: 'var(--teal-deep)' }}
            onClick={onHasReservation}
          >
            <Search size={18} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', marginLeft: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Sí, buscar su reserva</span>
              <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8 }}>Buscar por nombre o documento</span>
            </div>
          </button>

          <button
            type="button"
            className="primary-button"
            style={{ padding: '16px', justifyContent: 'flex-start' }}
            onClick={onWalkIn}
          >
            <UserPlus size={18} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', marginLeft: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>No, registrar llegada directa</span>
              <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.9 }}>Walk-in (Asignar cama y cobrar)</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
