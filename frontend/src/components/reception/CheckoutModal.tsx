import { useState, useEffect, useRef } from 'react'
import { X, LogOut, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { checkOutGuest } from '../../services/stays/staysService'
import { getFolioByStayId } from '../../services/folios/foliosService'
import { processPayment } from '../../services/payments/paymentsService'
import type { Stay } from '../../types/stays'
import type { Folio, PaymentAllocation } from '../../types/folios'
import type { Guest } from '../../types/guests'
import type { CashShift } from '../../types/cash'
import { IntegratedPayment, type PaymentData } from './IntegratedPayment'
import { calculateNightlyStatus } from '../../utils/folioCalculations'

interface CheckoutModalProps {
  establishmentId: string
  stay: Stay
  guest?: Guest
  folio?: Folio
  activeCashShift: CashShift | null
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
  onExtendStay?: () => void
}

export function CheckoutModal({
  establishmentId,
  stay,
  guest,
  folio,
  activeCashShift,
  onClose,
  onSuccess,
  onError,
  onExtendStay,
}: CheckoutModalProps) {
  const [actualFolio, setActualFolio] = useState<Folio | null>(folio || null)
  const [loadingFolio, setLoadingFolio] = useState(true)

  useEffect(() => {
    let mounted = true
    getFolioByStayId(establishmentId, stay.id).then((f) => {
      if (mounted) {
        if (f) setActualFolio(f)
        setLoadingFolio(false)
      }
    }).catch((e) => {
      console.error("Error fetching actual folio for checkout:", e)
      if (mounted) setLoadingFolio(false)
    })
    return () => { mounted = false }
  }, [establishmentId, stay.id])

  const totalCharges = actualFolio?.totalCharges || 0
  const totalPaid = actualFolio?.totalPaid || 0
  const pendingAmount = Math.max(0, totalCharges - totalPaid)
  const hasDebt = pendingAmount > 0

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  // v1.17: Fecha real de checkout y pago inline
  const expectedCheckOutStr = new Date(stay.expectedCheckOutDate.seconds * 1000).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
  const [actualCheckOutDate, setActualCheckOutDate] = useState(todayStr)
  const isLate = actualCheckOutDate > expectedCheckOutStr

  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const payCurrency = actualFolio?.currency ?? 'BOB'
  
  const isShiftOpen = !!activeCashShift && activeCashShift.status === 'open'

  const guestFullName = guest ? `${guest.firstName} ${guest.lastName}` : 'el huésped'

  const handleConfirmCheckout = async () => {
    if (loadingFolio) {
      setError(`Calculando saldos, por favor espere...`)
      return
    }
    const isPaying = paymentData && paymentData.intent !== 'none' && paymentData.receivedAmount > 0;
    if (hasDebt && !isPaying) {
      setError(`Existe un saldo pendiente. Selecciona pagar ahora o usa el botón de pago externo.`)
      return
    }
    if (isLate) {
      setError(`La fecha es posterior a la salida prevista. Debes extender la estadía primero.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      let paymentProcessed = false;
      let paymentAmount = 0;

      // 1. Cobrar inline si es necesario
      if (hasDebt && isPaying) {
        if (!isShiftOpen) throw new Error('No hay turno de caja abierto')
        
        await processPayment({
          establishmentId,
          stayId: stay.id,
          amount: paymentData!.amount,
          method: paymentData!.method,
          currencyCode: paymentData!.currencyCode,
          receivedAmount: paymentData!.receivedAmount,
          reference: paymentData!.reference || null,
          idempotencyKey: idempotencyKeyRef.current,
          expectedBalance: (actualFolio?.totalCharges || 0) - (actualFolio?.totalPaid || 0),
          allocations: paymentData!.allocations
        })
        
        paymentProcessed = true;
        paymentAmount = paymentData!.amount;

        // Refetch folio to prevent double charge if checkout fails
        const updatedFolio = await getFolioByStayId(establishmentId, stay.id)
        if (updatedFolio) {
          setActualFolio(updatedFolio)
          // Reset payment data intent so we don't try to pay again
          setPaymentData(null)
        }
      }

      // Reset idempotency key for future payments (though modal will close)
      idempotencyKeyRef.current = crypto.randomUUID()

      // 2. Checkout real
      try {
        await checkOutGuest({
          establishmentId,
          stayId: stay.id,
          actualCheckOutDate,
        })
      } catch (checkoutErr) {
        if (paymentProcessed) {
          throw new Error(`Pago de ${paymentAmount} registrado. Check-out pendiente por error: ${checkoutErr instanceof Error ? checkoutErr.message : 'Desconocido'}`)
        }
        throw checkoutErr
      }

      onSuccess(`¡Check-out completado! La cama quedó liberada y pendiente de aseo.`)
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
            Estás por dar salida a <strong>{guestFullName}</strong>.
          </p>

          <div style={{ marginBottom: '14px' }}>
            <label>Fecha real de salida *</label>
            <input
              type="date"
              value={actualCheckOutDate}
              onChange={(e) => setActualCheckOutDate(e.target.value)}
              required
            />
          </div>

          {isLate && (
            <div className="stay-notice critical" style={{ marginBottom: '14px', padding: '12px', display: 'flex', gap: '10px' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Noches adicionales detectadas</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  El huésped permaneció más tiempo del previsto. Debes procesar una Extensión de Estadía para generar los cargos correspondientes antes del check-out.
                </p>
                {onExtendStay && (
                  <button type="button" className="secondary-button compact-button" style={{ marginTop: '8px', background: 'var(--white)' }} onClick={onExtendStay}>
                    Extender Estadía
                  </button>
                )}
              </div>
            </div>
          )}

          {/* v1.17: Desglose completo del folio */}
          <div style={{ background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '12px', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em' }}>Cuenta</h4>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Total Cargos</span>
              <span>{totalCharges.toFixed(2)} {actualFolio?.currency ?? 'BOB'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Total Pagado</span>
              <span style={{ color: 'var(--teal)' }}>-{totalPaid.toFixed(2)} {actualFolio?.currency ?? 'BOB'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)', fontWeight: 700, fontSize: '14px' }}>
              <span>Saldo Pendiente</span>
              <span style={{ color: hasDebt ? 'var(--coral)' : 'var(--teal)' }}>{pendingAmount.toFixed(2)} {actualFolio?.currency ?? 'BOB'}</span>
            </div>
          </div>

          {/* Balance card y pago inline */}
          {hasDebt ? (
            <div className="stay-notice critical" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <AlertTriangle size={18} />
                <strong>Deuda de {pendingAmount.toFixed(2)} {actualFolio?.currency ?? 'BOB'}</strong>
              </div>
              <IntegratedPayment
                totalCharges={totalCharges}
                alreadyPaid={totalPaid}
                isShiftOpen={isShiftOpen}
                defaultCurrency={payCurrency}
                onChange={setPaymentData}
                showIntentOptions={true}
                showAllocations={true}
                suggestedAllocations={(() => {
                  if (!actualFolio) return []
                  const calc = calculateNightlyStatus(stay, null as any, actualFolio, todayStr)
                  const sugg: PaymentAllocation[] = []
                  if (calc.summary.lodgingDebtInitiated > 0) sugg.push({ type: 'lodging', amount: calc.summary.lodgingDebtInitiated / 100 })
                  if (calc.summary.totalConsumptionsPending > 0) sugg.push({ type: 'consumption', amount: calc.summary.totalConsumptionsPending / 100 })
                  if (calc.summary.totalOtherPending > 0) sugg.push({ type: 'other', amount: calc.summary.totalOtherPending / 100 })
                  return sugg
                })()}
              />
            </div>
          ) : (
            <div className="stay-notice success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={18} />
              <span>
                <strong>Cuenta al día</strong>. El huésped no tiene deudas pendientes.
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
            disabled={submitting || (hasDebt && (!paymentData || paymentData.intent === 'none')) || isLate}
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
