import { useState, useMemo, type FormEvent } from 'react'
import { X, Calendar, AlertTriangle, Loader2, ArrowRight, Plus } from 'lucide-react'
import { extendStay } from '../../services/stays/staysService'
import { processPayment } from '../../services/payments/paymentsService'
import type { Stay } from '../../types/stays'
import type { Folio } from '../../types/folios'
import type { CashShift } from '../../types/cash'
import type { Room } from '../../types/rooms'
import { CURRENCIES } from '../../utils/currencies'

interface ExtendStayModalProps {
  establishmentId: string
  stay: Stay
  folio?: Folio | null
  rooms: Room[]
  activeCashShift: CashShift | null
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

export function ExtendStayModal({
  establishmentId,
  stay,
  folio,
  rooms,
  activeCashShift,
  onClose,
  onSuccess,
  onError,
}: ExtendStayModalProps) {
  // Determinar el precio por noche de la reserva original si es posible
  const originalPricePerNight = useMemo(() => {
    if (!folio) return null
    const lodgingCharge = folio.charges?.find((c) =>
      !c.productId && (c.description?.toLowerCase().includes('hospedaje') || c.description?.toLowerCase().includes('alojamiento'))
    )
    if (lodgingCharge && lodgingCharge.unitPrice > 0) return lodgingCharge.unitPrice
    return null
  }, [folio])

  const currentCheckOutStr = toLocalDateString(new Date(stay.expectedCheckOutDate.seconds * 1000))
  const minNewCheckOut = (() => {
    const d = new Date(`${currentCheckOutStr}T12:00:00.000-04:00`)
    d.setUTCDate(d.getUTCDate() + 1)
    return toLocalDateString(d)
  })()

  const [newCheckOutDate, setNewCheckOutDate] = useState(minNewCheckOut)
  const [priceMode, setPriceMode] = useState<'auto' | 'manual'>(
    originalPricePerNight !== null ? 'auto' : 'manual'
  )
  const [manualPrice, setManualPrice] = useState<number>(originalPricePerNight ?? 0)

  // Pago inmediato de extensión
  const [payNow, setPayNow] = useState(false)
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')
  const [payCurrency, setPayCurrency] = useState('BOB')
  const [payReceived, setPayReceived] = useState<number>(0)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const extraNights = useMemo(() => {
    const from = new Date(`${currentCheckOutStr}T12:00:00.000-04:00`)
    const to = new Date(`${newCheckOutDate}T12:00:00.000-04:00`)
    const diff = Math.round((to.getTime() - from.getTime()) / 86400000)
    return Math.max(0, diff)
  }, [currentCheckOutStr, newCheckOutDate])

  const pricePerNight = priceMode === 'auto' ? (originalPricePerNight ?? 0) : manualPrice
  const extensionTotal = pricePerNight * extraNights

  const roomObj = rooms.find((r) => r.id === stay.roomId)
  const roomName = roomObj?.name ?? stay.roomId

  const isShiftOpen = !!activeCashShift && activeCashShift.status === 'open'

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (extraNights < 1) {
      setFormError('La nueva fecha debe ser posterior a la actual.')
      return
    }
    if (priceMode === 'manual' && manualPrice < 0) {
      setFormError('El precio por noche no puede ser negativo.')
      return
    }
    if (payNow && !isShiftOpen) {
      setFormError('No hay turno de caja abierto para registrar el pago.')
      return
    }
    if (payNow && payReceived <= 0) {
      setFormError('Ingresa el monto recibido.')
      return
    }

    setSubmitting(true)
    try {
      await extendStay({
        establishmentId,
        stayId: stay.id,
        newCheckOutDate,
        pricePerExtraNight: pricePerNight,
      })

      if (payNow && payReceived > 0 && extensionTotal > 0) {
        await processPayment({
          establishmentId,
          stayId: stay.id,
          amount: extensionTotal,
          method: payMethod,
          currencyCode: payCurrency,
          receivedAmount: payReceived,
        })
      }

      onSuccess(`Estadía extendida hasta ${newCheckOutDate}. ${extraNights} noche(s) adicional(es) · ${extensionTotal} BOB.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al extender estadía'
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
        style={{ maxWidth: '460px' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker" style={{ color: 'var(--teal, #0d9488)' }}>Estadía Activa</span>
            <h2>Extender Estadía</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
        </div>

        {formError && (
          <div className="form-error">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* Resumen */}
        <div className="stay-notice" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>Habitación</span>
              <div><strong>{roomName}</strong></div>
            </div>
            <div>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>Salida prevista</span>
              <div><strong>{formatDate(stay.expectedCheckOutDate)}</strong></div>
            </div>
          </div>
        </div>

        {/* Selector nueva fecha */}
        <div style={{ marginBottom: '14px' }}>
          <label>Nueva fecha de salida *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="date"
              value={newCheckOutDate}
              min={minNewCheckOut}
              onChange={(e) => setNewCheckOutDate(e.target.value)}
              required
            />
            {extraNights > 0 && (
              <span style={{ fontSize: '13px', color: 'var(--teal, #0d9488)', whiteSpace: 'nowrap' }}>
                +{extraNights} noche(s)
              </span>
            )}
          </div>
        </div>

        {/* Precio por noche */}
        <div style={{ marginBottom: '14px' }}>
          <label>Precio por noche adicional</label>
          {originalPricePerNight !== null && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`filter-chip ${priceMode === 'auto' ? 'active' : ''}`}
                onClick={() => setPriceMode('auto')}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Igual al original ({originalPricePerNight} BOB)
              </button>
              <button
                type="button"
                className={`filter-chip ${priceMode === 'manual' ? 'active' : ''}`}
                onClick={() => setPriceMode('manual')}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Otro precio
              </button>
            </div>
          )}
          {(priceMode === 'manual' || originalPricePerNight === null) && (
            <input
              type="number"
              min="0"
              step="0.5"
              value={manualPrice}
              onChange={(e) => setManualPrice(Number(e.target.value))}
              placeholder="Ej: 120"
            />
          )}
        </div>

        {/* Resumen de cargos */}
        {extraNights > 0 && (
          <div style={{
            background: 'var(--surface-2, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>Cargo a generar</div>
              <div style={{ fontSize: '13px' }}>
                Hospedaje adicional · {extraNights} noche(s)
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>{extensionTotal.toFixed(2)} BOB</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', opacity: 0.7 }}>
                <ArrowRight size={11} />
                {currentCheckOutStr}
                <ArrowRight size={11} />
                {newCheckOutDate}
              </div>
            </div>
          </div>
        )}

        {/* Pago inmediato opcional */}
        {extensionTotal > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={payNow}
                onChange={(e) => {
                  setPayNow(e.target.checked)
                  if (e.target.checked) setPayReceived(extensionTotal)
                }}
              />
              <Plus size={14} /> Cobrar la extensión ahora
            </label>

            {payNow && (
              <div style={{ marginTop: '10px', padding: '12px', background: 'var(--surface-2, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border, #e2e8f0)' }}>
                {!isShiftOpen && (
                  <div className="form-error" style={{ marginBottom: '8px' }}>
                    <AlertTriangle size={14} /> Sin turno de caja abierto
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

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting || extraNights < 1}>
            {submitting ? (
              <><Loader2 size={16} className="loader" /> Extendiendo...</>
            ) : (
              <><Calendar size={15} /> Confirmar Extensión</>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
