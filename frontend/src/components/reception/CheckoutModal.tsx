import { useState } from 'react'
import { X, LogOut, AlertTriangle, CheckCircle, DollarSign, Loader2 } from 'lucide-react'
import { checkOutGuest } from '../../services/stays/staysService'
import type { Stay } from '../../types/stays'
import type { Folio } from '../../types/folios'
import type { Guest } from '../../types/guests'

interface CheckoutModalProps {
  establishmentId: string
  stay: Stay
  guest?: Guest
  folio?: Folio
  onClose: () => void
  onOpenPayment: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

export function CheckoutModal({
  establishmentId,
  stay,
  guest,
  folio,
  onClose,
  onOpenPayment,
  onSuccess,
  onError,
}: CheckoutModalProps) {
  const balance = folio?.balance ?? 0
  const hasDebt = balance > 0
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guestFullName = guest ? `${guest.firstName} ${guest.lastName}` : 'el huésped'

  const handleConfirmCheckout = async () => {
    if (hasDebt) {
      setError(`No es posible realizar el check-out porque existe un saldo pendiente de ${balance} BOB.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await checkOutGuest({
        establishmentId,
        stayId: stay.id,
      })

      onSuccess(`¡Check-out de ${guestFullName} completado! La cama quedó liberada y pendiente de aseo.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar check-out'
      setError(`No se pudo completar el check-out: ${msg}`)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-form"
        style={{ maxWidth: '440px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <span className="kicker" style={{ color: 'var(--coral)' }}>Finalizar Estadía</span>
            <h2>Confirmar Check-out</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        {error && (
          <div className="form-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: 1.5 }}>
            Estás por dar salida a <strong>{guestFullName}</strong> de la cama asignada.
          </p>

          {/* Balance card */}
          {hasDebt ? (
            <div className="stay-notice critical" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} />
                <strong>Saldo pendiente: {balance.toFixed(2)} {folio?.currency ?? 'BOB'}</strong>
              </div>
              <p style={{ margin: 0, fontSize: '13px' }}>
                Para completar la salida debes cobrar el total adeudado antes de liberar la cama.
              </p>
              <button
                type="button"
                className="secondary-button compact-button"
                style={{ alignSelf: 'flex-start', marginTop: '6px', background: 'var(--white)' }}
                onClick={() => {
                  onClose()
                  onOpenPayment()
                }}
              >
                <DollarSign size={15} /> Cobrar Saldo Ahora
              </button>
            </div>
          ) : (
            <div className="stay-notice success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={18} />
              <span>
                <strong>Cuenta al día: 0.00 BOB</strong>. El huésped no tiene deudas pendientes.
              </span>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={handleConfirmCheckout}
            disabled={submitting || hasDebt}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Procesando salida...
              </>
            ) : (
              <>
                <LogOut size={16} /> Confirmar Check-out
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
