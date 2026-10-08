import { useState, useRef, type FormEvent } from 'react'
import { X, AlertTriangle, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react'
import { processPayment } from '../../services/payments/paymentsService'
import type { Stay } from '../../types/stays'
import type { CashShift } from '../../types/cash'
import type { Folio, PaymentAllocation } from '../../types/folios'
import { IntegratedPayment, type PaymentData } from './IntegratedPayment'
import { calculateNightlyStatus } from '../../utils/folioCalculations'

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
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  const isShiftOpen = !!activeCashShift && activeCashShift.status === 'open'

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!isShiftOpen) {
      setFormError('No hay una caja abierta. Abre el turno de caja para registrar pagos.')
      return
    }

    if (!paymentData || paymentData.amount <= 0) {
      setFormError('El monto del pago debe ser mayor a 0.')
      return
    }

    setSubmitting(true)
    try {
      await processPayment({
        establishmentId,
        stayId: stay.id,
        amount: paymentData.amount,
        method: paymentData.method,
        reference: paymentData.reference.trim() || null,
        currencyCode: paymentData.currencyCode,
        receivedAmount: paymentData.receivedAmount,
        idempotencyKey: idempotencyKeyRef.current,
        expectedBalance: currentBalance,
        allocations: paymentData.allocations,
      })

      // Reset idempotency key for future payments (though modal will close)
      idempotencyKeyRef.current = crypto.randomUUID()

      onSuccess(`¡Pago de ${paymentData.receivedAmount} ${paymentData.currencyCode} registrado exitosamente!`)
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

        {/* Use IntegratedPayment with showIntentOptions=false so it forces payment */}
        <div style={{ marginBottom: '16px' }}>
          <IntegratedPayment
            totalCharges={currentBalance}
            alreadyPaid={0}
            isShiftOpen={isShiftOpen}
            defaultCurrency={folio?.currency ?? 'BOB'}
            onChange={setPaymentData}
            showIntentOptions={false}
            showAllocations={true}
            suggestedAllocations={(() => {
              if (!folio) return []
              const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
              const calc = calculateNightlyStatus(stay, null as any, folio, todayStr)
              const sugg: PaymentAllocation[] = []
              // convert from cents back to BOB for the component
              if (calc.summary.lodgingDebtInitiated > 0) sugg.push({ type: 'lodging', amount: calc.summary.lodgingDebtInitiated / 100 })
              if (calc.summary.totalConsumptionsPending > 0) sugg.push({ type: 'consumption', amount: calc.summary.totalConsumptionsPending / 100 })
              if (calc.summary.totalOtherPending > 0) sugg.push({ type: 'other', amount: calc.summary.totalOtherPending / 100 })
              return sugg
            })()}
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
