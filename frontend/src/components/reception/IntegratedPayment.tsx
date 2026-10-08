import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { CURRENCIES } from '../../utils/currencies'
import type { PaymentAllocation } from '../../types/folios'

export type PaymentIntent = 'full' | 'partial' | 'none'

export interface PaymentData {
  intent: PaymentIntent
  amount: number
  method: 'cash' | 'card' | 'transfer' | 'qr'
  currencyCode: string
  receivedAmount: number
  reference: string
  allocations?: PaymentAllocation[]
}

interface IntegratedPaymentProps {
  totalCharges: number
  alreadyPaid?: number
  isShiftOpen: boolean
  defaultCurrency?: string
  onChange: (data: PaymentData) => void
  showIntentOptions?: boolean
  defaultIntent?: PaymentIntent
  showAllocations?: boolean
  suggestedAllocations?: PaymentAllocation[]
}

export function IntegratedPayment({
  totalCharges,
  alreadyPaid = 0,
  isShiftOpen,
  defaultCurrency = 'BOB',
  onChange,
  showIntentOptions = true,
  defaultIntent = 'full',
  showAllocations = false,
  suggestedAllocations = []
}: IntegratedPaymentProps) {
  const pendingBalance = Math.max(0, totalCharges - alreadyPaid)

  const [intent, setIntent] = useState<PaymentIntent>(pendingBalance > 0 ? defaultIntent : 'none')
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')
  const [currencyCode, setCurrencyCode] = useState<string>(defaultCurrency)
  
  const [receivedAmount, setReceivedAmount] = useState<number>(pendingBalance)
  const [amountApplied, setAmountApplied] = useState<number>(pendingBalance)
  const [reference, setReference] = useState<string>('')
  
  // Keep strings for input fields so they don't jump to '0' on empty
  const [amountStr, setAmountStr] = useState<string>(String(pendingBalance))
  const [receivedStr, setReceivedStr] = useState<string>(String(pendingBalance))

  const [allocLodging, setAllocLodging] = useState<number>(0)
  const [allocConsumption, setAllocConsumption] = useState<number>(0)
  const [allocOther, setAllocOther] = useState<number>(0)
  const [allocUnassigned, setAllocUnassigned] = useState<number>(0)

  // Re-calculate suggestions when amountApplied changes
  useEffect(() => {
    if (showAllocations) {
      // Prioritize lodging, then consumption, then other
      // if suggestedAllocations is provided, use its ratios or amounts? 
      // It's simpler: if we have suggestedAllocations that match exactly pendingBalance, we can just cap them.
      // Or we can distribute sequentially based on what's owed. We don't know what's owed here.
      // So we use suggestedAllocations as the max limits!
      
      let remaining = amountApplied
      
      const suggL = suggestedAllocations.find(a => a.type === 'lodging')?.amount ?? 0
      const suggC = suggestedAllocations.find(a => a.type === 'consumption')?.amount ?? 0
      const suggO = suggestedAllocations.find(a => a.type === 'other')?.amount ?? 0
      
      const nextL = Math.min(remaining, suggL)
      remaining = Math.max(0, remaining - nextL)
      
      const nextC = Math.min(remaining, suggC)
      remaining = Math.max(0, remaining - nextC)
      
      const nextO = Math.min(remaining, suggO)
      remaining = Math.max(0, remaining - nextO)
      
      const nextU = remaining
      
      setAllocLodging(nextL)
      setAllocConsumption(nextC)
      setAllocOther(nextO)
      setAllocUnassigned(nextU)
    }
  }, [amountApplied, showAllocations, suggestedAllocations])

  const totalAllocated = allocLodging + allocConsumption + allocOther + allocUnassigned
  const allocationsValid = Math.abs(totalAllocated - amountApplied) < 0.01

  // Sync to parent
  useEffect(() => {
    let allocations: PaymentAllocation[] | undefined;
    if (showAllocations) {
      allocations = [
        { type: 'lodging', amount: allocLodging },
        { type: 'consumption', amount: allocConsumption },
        { type: 'other', amount: allocOther },
        { type: 'unassigned', amount: allocUnassigned }
      ].filter(a => a.amount > 0) as PaymentAllocation[]
    }

    onChange({
      intent,
      amount: intent === 'none' ? 0 : amountApplied,
      method,
      currencyCode,
      receivedAmount: intent === 'none' ? 0 : receivedAmount,
      reference,
      allocations
    })
  }, [intent, amountApplied, method, currencyCode, receivedAmount, reference, allocLodging, allocConsumption, allocOther, allocUnassigned, showAllocations])

  // Initial sync when pending changes
  useEffect(() => {
    if (intent === 'full') {
      setAmountApplied(pendingBalance)
      setAmountStr(String(pendingBalance))
      if (currencyCode === 'BOB') {
        setReceivedAmount(pendingBalance)
        setReceivedStr(String(pendingBalance))
      }
    }
  }, [pendingBalance, intent]) // intentionally omitting currencyCode to not overwrite user edits in other modes

  // Handle BOB sync
  useEffect(() => {
    if (currencyCode === 'BOB') {
      setAmountApplied(receivedAmount)
      setAmountStr(String(receivedAmount))
    }
  }, [receivedAmount, currencyCode])

  const handleNumberBlur = (val: string, setterNum: (n: number) => void, setterStr: (s: string) => void) => {
    let parsed = parseFloat(val)
    if (isNaN(parsed) || parsed < 0) parsed = 0
    const norm = parsed.toString()
    setterNum(parsed)
    setterStr(norm)
  }

  if (pendingBalance <= 0 && showIntentOptions) {
    return (
      <div style={{ background: 'var(--ok-bg, #f0fdf4)', padding: '10px', borderRadius: '6px', border: '1px solid var(--ok-line, #bbf7d0)', fontSize: '13px' }}>
        No hay saldo pendiente.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--surface-2, #f8fafc)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
      {showIntentOptions && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
            <span>Total Cargos / Alojamiento</span>
            <strong>{totalCharges.toFixed(2)} {defaultCurrency}</strong>
          </div>
          {alreadyPaid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
              <span>Ya Pagado / Depósito</span>
              <span style={{ color: 'var(--teal)' }}>-{alreadyPaid.toFixed(2)} {defaultCurrency}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)', fontSize: '14px', fontWeight: 700 }}>
            <span>Pendiente</span>
            <span>{pendingBalance.toFixed(2)} {defaultCurrency}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="payIntent" checked={intent === 'full'} onChange={() => {
                setIntent('full')
                setReceivedAmount(pendingBalance)
                setReceivedStr(String(pendingBalance))
              }} />
              Cobrar todo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="payIntent" checked={intent === 'partial'} onChange={() => {
                setIntent('partial')
                setReceivedStr('')
                setAmountStr('')
              }} />
              Pago parcial
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="payIntent" checked={intent === 'none'} onChange={() => setIntent('none')} />
              Dejar pendiente
            </label>
          </div>
        </>
      )}

      {intent !== 'none' && (
        <div style={{ marginTop: '10px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          {!isShiftOpen && (
            <div className="form-error" style={{ marginBottom: '8px', padding: '6px', fontSize: '12px' }}>
              <AlertTriangle size={14} /> Sin turno de caja abierto. No se puede cobrar.
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Método *</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as any)} disabled={!isShiftOpen}>
                <option value="cash">💵 Efectivo</option>
                <option value="card">💳 Tarjeta</option>
                <option value="qr">📱 QR</option>
                <option value="transfer">🏦 Transferencia</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Moneda recibida *</label>
              <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} disabled={!isShiftOpen}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: currencyCode === 'BOB' ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Monto recibido ({currencyCode}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={receivedStr}
                onChange={(e) => {
                  setReceivedStr(e.target.value)
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v)) setReceivedAmount(v)
                }}
                onBlur={(e) => handleNumberBlur(e.target.value, setReceivedAmount, setReceivedStr)}
                disabled={!isShiftOpen}
                required
              />
            </div>
            
            {currencyCode !== 'BOB' && (
              <div>
                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                  Monto aplicado al folio (BOB) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountStr}
                  onChange={(e) => {
                    setAmountStr(e.target.value)
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) setAmountApplied(v)
                  }}
                  onBlur={(e) => handleNumberBlur(e.target.value, setAmountApplied, setAmountStr)}
                  disabled={!isShiftOpen}
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Referencia (opcional)</label>
            <input
              type="text"
              placeholder="Nº de comprobante..."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={!isShiftOpen}
            />
          </div>

          {showAllocations && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <h5 style={{ margin: '0 0 10px 0', fontSize: '13px' }}>Distribución del Pago (BOB)</h5>
              {!allocationsValid && (
                <div className="form-error" style={{ marginBottom: '8px', padding: '6px', fontSize: '12px' }}>
                  <AlertTriangle size={14} /> La distribución ({totalAllocated.toFixed(2)}) no coincide con el monto aplicado ({amountApplied.toFixed(2)}).
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', color: 'var(--slate-500)' }}>Hospedaje</label>
                  <input type="number" step="0.01" min="0" value={allocLodging} onChange={e => setAllocLodging(parseFloat(e.target.value)||0)} disabled={!isShiftOpen} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', color: 'var(--slate-500)' }}>Consumos</label>
                  <input type="number" step="0.01" min="0" value={allocConsumption} onChange={e => setAllocConsumption(parseFloat(e.target.value)||0)} disabled={!isShiftOpen} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', color: 'var(--slate-500)' }}>Otros</label>
                  <input type="number" step="0.01" min="0" value={allocOther} onChange={e => setAllocOther(parseFloat(e.target.value)||0)} disabled={!isShiftOpen} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', display: 'block', color: 'var(--slate-500)' }}>Sin Asignar</label>
                  <input type="number" step="0.01" min="0" value={allocUnassigned} onChange={e => setAllocUnassigned(parseFloat(e.target.value)||0)} disabled={!isShiftOpen} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
