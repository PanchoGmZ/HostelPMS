import { useState, type FormEvent } from 'react'
import { X, AlertTriangle, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react'
import { processPayment } from '../../services/payments/paymentsService'
import type { Stay } from '../../types/stays'
import type { Folio } from '../../types/folios'
import type { CashShift } from '../../types/cash'

interface PaymentModalProps {
  establishmentId: string
  stay: Stay
  folio?: Folio
  activeCashShift: CashShift | null
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

export function PaymentModal({
  establishmentId,
  stay,
  folio,
  activeCashShift,
  onClose,
  onSuccess,
  onError,
}: PaymentModalProps) {
  const currentBalance = folio?.balance ?? 0
  const [amount, setAmount] = useState<number>(currentBalance > 0 ? currentBalance : 0)
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')
  const [reference, setReference] = useState<string>('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isShiftOpen = !!activeCashShift && activeCashShift.status === 'open'

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!isShiftOpen) {
      setFormError('No hay una caja abierta. Abre el turno de caja para registrar pagos.')
      return
    }

    if (amount <= 0) {
      setFormError('El monto del pago debe ser mayor a 0.')
      return
    }

    setSubmitting(true)
    try {
      await processPayment({
        establishmentId,
        stayId: stay.id,
        amount,
        method,
        reference: reference.trim() || null,
      })

      onSuccess(`¡Pago de ${amount} BOB registrado exitosamente!`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar el pago'
      setFormError(`No se pudo procesar el pago: ${msg}`)
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
            <span className="kicker">Caja y Cobros</span>
            <h2>Registrar Pago</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        {/* Validation check for open cash shift */}
        {!isShiftOpen ? (
          <div className="stay-notice critical" style={{ margin: '0 0 16px', display: 'flex', gap: '10px' }}>
            <ShieldAlert size={22} style={{ flexShrink: 0 }} />
            <div>
              <strong>Caja Cerrada</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                No hay una caja abierta. Abre el turno de caja para registrar pagos.
              </p>
            </div>
          </div>
        ) : (
          <div className="stay-notice success" style={{ margin: '0 0 16px', fontSize: '12px' }}>
            <CheckCircle2 size={16} />
            <span>Turno de caja activo: #{activeCashShift.id.slice(-6)}</span>
          </div>
        )}

        {formError && (
          <div className="form-error">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* Balance callout */}
        <div style={{ padding: '10px 14px', background: currentBalance > 0 ? 'var(--danger-bg)' : 'var(--ok-bg)', border: `1px solid ${currentBalance > 0 ? 'var(--danger-line)' : 'var(--ok-line)'}`, borderRadius: 'var(--radius-sm)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: currentBalance > 0 ? 'var(--danger)' : 'var(--ok)' }}>
            Saldo pendiente del folio:
          </span>
          <strong style={{ fontSize: '17px', color: currentBalance > 0 ? 'var(--danger)' : 'var(--ok)' }}>
            {currentBalance.toFixed(2)} {folio?.currency ?? 'BOB'}
          </strong>
        </div>

        {/* Amount to pay */}
        <div style={{ marginBottom: '12px' }}>
          <label>Monto a pagar (BOB) *</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            required
            disabled={!isShiftOpen}
          />
        </div>

        {/* Payment method */}
        <div style={{ marginBottom: '12px' }}>
          <label>Método de Pago *</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as 'cash' | 'card' | 'transfer' | 'qr')}
            disabled={!isShiftOpen}
          >
            <option value="cash">💵 Efectivo</option>
            <option value="card">💳 Tarjeta de Débito / Crédito</option>
            <option value="qr">📱 Pago QR</option>
            <option value="transfer">🏦 Transferencia Bancaria</option>
          </select>
        </div>

        {/* Reference */}
        <div style={{ marginBottom: '14px' }}>
          <label>Referencia o Nº Comprobante (opcional)</label>
          <input
            type="text"
            placeholder="Ej: Nº de autorización, comprobante QR..."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={!isShiftOpen}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={submitting || !isShiftOpen}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Procesando pago...
              </>
            ) : (
              'Confirmar Pago'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
