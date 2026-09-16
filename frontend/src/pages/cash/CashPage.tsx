import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock,
  DollarSign,
  History,
  LockKeyhole,
  Plus,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { addCashMovement, calculateCashSummary, closeCashShift, listCashShifts, openCashShift } from '../../services/cash/cashService'
import { addMovementSchema, closeShiftSchema, openShiftSchema } from '../../schemas/cashSchema'
import type { CashShift } from '../../types/cash'

function formatDateTime(value?: { seconds: number } | null) {
  if (!value?.seconds) return '-'
  return new Date(value.seconds * 1000).toLocaleString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CashPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [shifts, setShifts] = useState<CashShift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      setShifts(await listCashShifts(establishmentId))
    } catch {
      setError('No se pudieron cargar los turnos de caja.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const activeShift = useMemo(() => shifts.find((s) => s.status === 'open'), [shifts])


  // Active shift calculations
  const activeCashSummary = useMemo(() => calculateCashSummary(activeShift), [activeShift])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <Banknote size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento activo para controlar la caja.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page cash-page">
      <header className="page-header">
        <div>
          <span className="kicker">Control financiero</span>
          <h1>Caja y Turnos</h1>
          <p>Gestión de aperturas, cierres, arqueos de caja y movimientos diarios.</p>
        </div>
        <div className="header-actions">
          {!activeShift ? (
            <button
              className="primary-button compact-button"
              type="button"
              onClick={() => setShowOpenModal(true)}
            >
              <WalletCards size={18} />
              Abrir turno de caja
            </button>
          ) : (
            <>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setShowMovementModal(true)}
              >
                <Plus size={16} /> Movimiento
              </button>
              <button
                className="primary-button compact-button"
                type="button"
                style={{ background: 'var(--coral)' }}
                onClick={() => setShowCloseModal(true)}
              >
                <LockKeyhole size={18} />
                Cerrar turno
              </button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="form-error">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success">
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      <div className="stay-notice" style={{ marginBottom: '16px' }}>
        <ShieldCheck size={18} />
        <span>
          Apertura, cierre y auditoría de arqueo son ejecutados y validados por el backend (Cloud Functions).
        </span>
      </div>

      {/* Summary Cards del Turno Activo */}
      <section className="cash-summary">
        <div className="product-card" style={{ padding: '14px 16px' }}>
          <div className="product-top">
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Estado de Caja</span>
            <span
              className="stay-status"
              style={{
                background: activeShift ? '#dcece3' : '#eef1f0',
                color: activeShift ? '#1b5e30' : '#5a6c66',
              }}
            >
              {activeShift ? 'Turno Abierto' : 'Caja Cerrada'}
            </span>
          </div>
          <strong style={{ fontSize: '18px', color: 'var(--ink)' }}>
            {activeShift ? `Apertura: ${formatDateTime(activeShift.openedAt)}` : 'Sin turno activo'}
          </strong>
        </div>

        <div className="product-card" style={{ padding: '14px 16px' }}>
          <div className="product-top">
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Monto Inicial (Caja chica)</span>
            <Banknote size={18} color="var(--teal)" />
          </div>
          <strong style={{ fontSize: '20px', color: 'var(--ink)' }}>
            {activeShift ? `${activeShift.openingAmount} BOB` : '--'}
          </strong>
        </div>

        <div className="product-card" style={{ padding: '14px 16px' }}>
          <div className="product-top">
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Ingresos en Efectivo</span>
            <ArrowDownLeft size={18} color="#1b5e30" />
          </div>
          <strong style={{ fontSize: '20px', color: '#1b5e30' }}>
            {activeShift ? `+${activeCashSummary.cashIn} BOB` : '--'}
          </strong>
        </div>

        <div className="product-card" style={{ padding: '14px 16px' }}>
          <div className="product-top">
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Efectivo Esperado en Caja</span>
            <DollarSign size={18} color="var(--teal)" />
          </div>
          <strong style={{ fontSize: '20px', color: 'var(--teal)' }}>
            {activeShift ? `${activeCashSummary.expectedTotal} BOB` : '--'}
          </strong>
        </div>
      </section>

      {/* Movimientos del Turno Activo */}
      {activeShift && (
        <section className="summary-section" style={{ marginBottom: '24px' }}>
          <div className="section-heading">
            <h2>
              <Clock size={18} /> Movimientos del Turno Activo ({activeShift.movements?.length ?? 0})
            </h2>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowMovementModal(true)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              + Registrar Movimiento
            </button>
          </div>

          {(!activeShift.movements || activeShift.movements.length === 0) ? (
            <div style={{ padding: '16px', textOverflow: 'ellipsis', color: 'var(--muted)', fontSize: '13px' }}>
              No hay movimientos registrados en este turno aún. Los pagos registrados en folios figurarán aquí.
            </div>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead style={{ background: '#f0f4f2', borderBottom: '1px solid var(--line)' }}>
                  <tr>
                    <th style={{ padding: '8px 12px' }}>Tipo</th>
                    <th style={{ padding: '8px 12px' }}>Descripción</th>
                    <th style={{ padding: '8px 12px' }}>Método</th>
                    <th style={{ padding: '8px 12px' }}>Hora</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {activeShift.movements.map((m) => {
                    const isOut = m.type === 'out'
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: isOut ? '#fde8e4' : '#dcece3',
                              color: isOut ? '#b9381e' : '#1b5e30',
                            }}
                          >
                            {isOut ? 'Egreso' : m.type === 'pago_folio' ? 'Pago Folio' : 'Ingreso'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>{m.description ?? 'Movimiento de caja'}</td>
                        <td style={{ padding: '8px 12px', textTransform: 'capitalize' }}>{m.method ?? 'Efectivo'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDateTime(m.createdAt)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: isOut ? '#b9381e' : '#1b5e30' }}>
                          {isOut ? '-' : '+'}{m.amount} BOB
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Historial de Turnos Anteriores */}
      <section className="summary-section">
        <div className="section-heading">
          <h2>
            <History size={18} /> Historial de Turnos de Caja
          </h2>
        </div>

        {loading ? (
          <div className="screen-state inline-state">
            <span className="loader" />
            Cargando historial...
          </div>
        ) : shifts.length === 0 ? (
          <div className="empty-state compact">
            <Banknote size={28} />
            <h2>No hay turnos registrados</h2>
            <p>Los turnos aperturados y cerrados figurarán en este historial.</p>
          </div>
        ) : (
          <div className="cash-list" style={{ display: 'grid', gap: '8px' }}>
            {shifts.map((shift) => (
              <article
                className="cash-row"
                key={shift.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '38px 1.5fr 1fr 1fr 1fr auto',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: 'var(--white)',
                  border: '1px solid var(--line)',
                  borderRadius: '7px',
                }}
              >
                <div className="cash-icon">
                  <Banknote size={18} />
                </div>
                <div>
                  <strong>{shift.status === 'open' ? 'Turno Activo (Abierto)' : `Turno #${shift.id.slice(0, 6)}`}</strong>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>
                    Apertura: {formatDateTime(shift.openedAt)}
                  </small>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)' }}>Inicial</small>
                  <div><strong>{shift.openingAmount} BOB</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)' }}>Cierre físico</small>
                  <div><strong>{shift.totalActual ?? shift.closingAmount ?? '--'}</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)' }}>Movimientos</small>
                  <div><strong>{shift.movements?.length ?? 0}</strong></div>
                </div>
                <div>
                  <span
                    className="stay-status"
                    style={{
                      background: shift.status === 'open' ? '#dcece3' : '#eef1f0',
                      color: shift.status === 'open' ? '#1b5e30' : '#5a6c66',
                    }}
                  >
                    {shift.status === 'open' ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Modal Abrir Turno */}
      {showOpenModal && (
        <OpenShiftModal
          establishmentId={establishmentId}
          onClose={() => setShowOpenModal(false)}
          onSaved={() => {
            setShowOpenModal(false)
            setSuccessMessage('Turno de caja abierto exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Cerrar Turno */}
      {showCloseModal && activeShift && (
        <CloseShiftModal
          establishmentId={establishmentId}
          shift={activeShift}
          expectedTotal={activeCashSummary.expectedTotal}
          onClose={() => setShowCloseModal(false)}
          onSaved={() => {
            setShowCloseModal(false)
            setSuccessMessage('Turno de caja cerrado y auditado correctamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Agregar Movimiento Manual */}
      {showMovementModal && activeShift && (
        <AddMovementModal
          establishmentId={establishmentId}
          shiftId={activeShift.id}
          onClose={() => setShowMovementModal(false)}
          onSaved={() => {
            setShowMovementModal(false)
            setSuccessMessage('Movimiento de caja registrado exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

interface OpenShiftModalProps {
  establishmentId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function OpenShiftModal({ establishmentId, onClose, onSaved, onError }: OpenShiftModalProps) {
  const [openingAmount, setOpeningAmount] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const validation = openShiftSchema.safeParse({
      openingAmount,
      notes,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Monto inicial no válido.')
      return
    }

    setSubmitting(true)
    try {
      await openCashShift({
        establishmentId,
        openingAmount,
        notes,
      })
      onSaved()
    } catch {
      const msg = 'No se pudo abrir el turno. La Cloud Function "openCashShift" debe estar activa en el servidor.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '420px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Control de Caja</span>
            <h2>Apertura de turno</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <label>
          Monto Inicial en Caja Chica (BOB)
          <input
            type="number"
            min="0"
            step="1"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(Number(e.target.value))}
            required
          />
        </label>

        <label>
          Notas de Apertura (Opcional)
          <input
            type="text"
            placeholder="Ej. Cambio recibido del turno anterior..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Abriendo turno...' : 'Confirmar Apertura'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface CloseShiftModalProps {
  establishmentId: string
  shift: CashShift
  expectedTotal: number
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function CloseShiftModal({
  establishmentId,
  shift,
  expectedTotal,
  onClose,
  onSaved,
  onError,
}: CloseShiftModalProps) {
  const [totalActual, setTotalActual] = useState<number>(expectedTotal)
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const discrepancy = useMemo(() => {
    return totalActual - expectedTotal
  }, [totalActual, expectedTotal])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const validation = closeShiftSchema.safeParse({
      cashShiftId: shift.id,
      closingAmount: totalActual,
      notes,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Conteo físico no válido.')
      return
    }

    setSubmitting(true)
    try {
      await closeCashShift({
        establishmentId,
        cashShiftId: shift.id,
        closingAmount: totalActual,
        notes,
      })
      onSaved()
    } catch {
      const msg = 'No se pudo cerrar el turno. La Cloud Function "closeCashShift" debe procesar la auditoría en el backend.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }

  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '460px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker" style={{ color: 'var(--coral)' }}>Arqueo de Caja</span>
            <h2>Cierre de turno</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <div style={{ background: '#f4f8f6', padding: '12px', borderRadius: '6px', fontSize: '13px', display: 'grid', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Efectivo Inicial:</span>
            <strong>{shift.openingAmount} BOB</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>Efectivo Esperado en Sistema:</span>
            <strong style={{ color: 'var(--teal)' }}>{expectedTotal} BOB</strong>
          </div>
        </div>

        <label>
          Conteo Físico Real de Efectivo (BOB)
          <input
            type="number"
            min="0"
            step="0.5"
            value={totalActual}
            onChange={(e) => setTotalActual(Number(e.target.value))}
            required
          />
        </label>

        {/* Indicador de Arqueo */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            background: discrepancy === 0 ? '#eaf6ed' : discrepancy > 0 ? '#eaf2f6' : '#fff0eb',
            border: '1px solid',
            borderColor: discrepancy === 0 ? '#b6e2c1' : discrepancy > 0 ? '#b6cee2' : '#f0b4a4',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Diferencia / Arqueo:</span>
            <span style={{ color: discrepancy === 0 ? '#1e6631' : discrepancy > 0 ? '#1e4c66' : 'var(--coral)' }}>
              {discrepancy === 0 ? 'Exacto (0 BOB)' : discrepancy > 0 ? `+${discrepancy} BOB (Sobrante)` : `${discrepancy} BOB (Faltante)`}
            </span>
          </div>
        </div>

        <label>
          Observaciones de Cierre (Opcional)
          <input
            type="text"
            placeholder="Explicación de diferencia o notas..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" style={{ background: 'var(--coral)' }} disabled={submitting}>
            {submitting ? 'Cerrando turno...' : 'Confirmar Cierre de Turno'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface AddMovementModalProps {
  establishmentId: string
  shiftId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function AddMovementModal({
  establishmentId,
  shiftId,
  onClose,
  onSaved,
  onError,
}: AddMovementModalProps) {
  const [type, setType] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState<number>(0)
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')
  const [description, setDescription] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const validation = addMovementSchema.safeParse({
      shiftId,
      type,
      amount,
      method,
      description,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de movimiento inválidos.')
      return
    }

    setSubmitting(true)
    try {
      await addCashMovement({
        establishmentId,
        shiftId,
        type,
        amount,
        method,
        description,
      })
      onSaved()
    } catch {
      const msg = 'No se pudo registrar el movimiento. La Cloud Function "addCashMovement" debe estar activa.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '420px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Turno Activo</span>
            <h2>Registrar movimiento</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            type="button"
            className={type === 'in' ? 'primary-button compact-button' : 'secondary-button'}
            onClick={() => setType('in')}
            style={{ justifyContent: 'center' }}
          >
            <ArrowDownLeft size={16} /> Ingreso
          </button>
          <button
            type="button"
            className={type === 'out' ? 'primary-button compact-button' : 'secondary-button'}
            onClick={() => setType('out')}
            style={{ justifyContent: 'center', background: type === 'out' ? 'var(--coral)' : undefined }}
          >
            <ArrowUpRight size={16} /> Egreso / Gasto
          </button>
        </div>

        <label>
          Concepto / Descripción
          <input
            type="text"
            placeholder="Ej. Cambio sencillo, Compra insumos de limpieza..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>

        <div className="form-row">
          <label>
            Monto (BOB)
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Método
            <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="qr">QR</option>
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Confirmar Movimiento'}
          </button>
        </div>
      </form>
    </div>
  )
}
