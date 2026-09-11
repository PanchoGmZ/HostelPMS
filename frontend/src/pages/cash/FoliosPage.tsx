import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  FileText,
  Filter,
  Info,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { addChargeToFolio, listFolios } from '../../services/folios/foliosService'
import { processPayment, PAYMENT_METHODS } from '../../services/payments/paymentsService'
import { listStays } from '../../services/stays/staysService'
import { searchGuests } from '../../services/guests/guestsService'
import { listRooms } from '../../services/rooms/roomsService'
import { addChargeSchema, processPaymentSchema } from '../../schemas/foliosSchema'
import type { Folio } from '../../types/folios'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'


function formatDate(value?: { seconds: number } | null) {
  if (!value?.seconds) return '-'
  return new Date(value.seconds * 1000).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}


export function FoliosPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [folios, setFolios] = useState<Folio[]>([])
  const [stays, setStays] = useState<Stay[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'debt' | 'paid'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [selectedFolio, setSelectedFolio] = useState<Folio | null>(null)
  const [folioForCharge, setFolioForCharge] = useState<Folio | null>(null)
  const [folioForPayment, setFolioForPayment] = useState<Folio | null>(null)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [nextFolios, nextStays, nextGuests, nextRooms] = await Promise.all([
        listFolios(establishmentId),
        listStays(establishmentId),
        searchGuests(establishmentId, ''),
        listRooms(establishmentId),
      ])
      setFolios(nextFolios)
      setStays(nextStays)
      setGuests(nextGuests)
      setRooms(nextRooms)
    } catch {
      setError('No se pudieron cargar los folios financieros.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredFolios = useMemo(() => {
    return folios.filter((folio) => {
      const hasDebt = (folio.balance ?? 0) > 0
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'debt' && hasDebt) ||
        (statusFilter === 'paid' && !hasDebt)

      const stay = stays.find((s) => s.id === folio.stayId)
      const primaryGuest = guests.find((g) => stay?.guestIds.includes(g.id))
      const room = rooms.find((r) => r.id === stay?.roomId)

      const q = searchQuery.toLowerCase().trim()
      const matchesQuery =
        q === '' ||
        folio.id.toLowerCase().includes(q) ||
        folio.stayId.toLowerCase().includes(q) ||
        (primaryGuest && `${primaryGuest.firstName} ${primaryGuest.lastName}`.toLowerCase().includes(q)) ||
        (room && room.name.toLowerCase().includes(q))

      return matchesStatus && matchesQuery
    })
  }, [folios, statusFilter, searchQuery, stays, guests, rooms])

  // Summary Metrics
  const totalDebtSum = useMemo(() => {
    return folios.reduce((acc, f) => acc + Math.max(0, f.balance ?? 0), 0)
  }, [folios])

  const totalChargesSum = useMemo(() => {
    return folios.reduce((acc, f) => acc + (f.totalCharges ?? 0), 0)
  }, [folios])

  const totalPaidSum = useMemo(() => {
    return folios.reduce((acc, f) => acc + (f.totalPaid ?? 0), 0)
  }, [folios])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <FileText size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión para gestionar folios y consumos.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page folios-page">
      <header className="page-header">
        <div>
          <span className="kicker">Operación financiera</span>
          <h1>Folios, Consumos y Pagos</h1>
          <p>Consulta el saldo de cada estadía: Cargos + Consumos - Pagos = Saldo Final.</p>
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

      <div className="stay-notice">
        <ShieldCheck size={18} />
        <span>
          El backend server-side es la autoridad para autorizar pagos, calcular saldos finales y validar el stock de productos.
        </span>
      </div>

      <div className="kpi-strip">
        <div>
          <div className="product-top">
            <span>Total Cargado</span>
            <Receipt size={18} color="var(--teal)" />
          </div>
          <strong>{totalChargesSum} BOB</strong>
        </div>
        <div>
          <div className="product-top">
            <span>Total Pagado</span>
            <DollarSign size={18} color="#1b5e30" />
          </div>
          <strong className="balance-ok">{totalPaidSum} BOB</strong>
        </div>
        <div className={totalDebtSum > 0 ? 'is-debt' : ''}>
          <div className="product-top">
            <span>Deuda Pendiente General</span>
            <AlertTriangle size={18} color="var(--coral)" />
          </div>
          <strong>{totalDebtSum} BOB</strong>
        </div>
      </div>

      <div className="guest-toolbar">
        <div className="toolbar-search">
          <Search size={16} color="var(--muted)" />
          <input
            type="text"
            placeholder="Buscar por folio, estadía, huésped o habitación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-search shrink">
          <Filter size={16} color="var(--muted)" />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'debt' | 'paid')}
          >
            <option value="all">Todos los folios</option>
            <option value="debt">Con saldo pendiente (Deuda)</option>
            <option value="paid">Saldados / Sin deuda</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando folios financieros...
        </div>
      ) : folios.length === 0 ? (
        <div className="empty-state compact">
          <Receipt size={32} />
          <h2>No hay folios activos</h2>
          <p>Los folios se crean automáticamente al iniciar una estadía en el sistema.</p>
        </div>
      ) : filteredFolios.length === 0 ? (
        <div className="empty-state compact">
          <Search size={28} />
          <h2>Sin resultados</h2>
          <p>No se encontraron folios con el filtro aplicado.</p>
        </div>
      ) : (
        <div className="folio-list">
          {filteredFolios.map((folio) => {
            const stay = stays.find((s) => s.id === folio.stayId)
            const primaryGuest = guests.find((g) => stay?.guestIds.includes(g.id))
            const room = rooms.find((r) => r.id === stay?.roomId)

            return (
              <article className="folio-row" key={folio.id}>
                <div className="folio-icon">
                  <FileText size={19} />
                </div>

                <div className="folio-info">
                  <strong>
                    {primaryGuest ? `${primaryGuest.firstName} ${primaryGuest.lastName}` : `Folio #${folio.id.slice(0, 6)}`}
                  </strong>
                  <small>
                    Estadía: #{folio.stayId.slice(0, 6)} {room ? `· Hab. ${room.name}` : ''}
                  </small>
                </div>

                <div className="folio-total">
                  <small>Cargos ({folio.charges?.length ?? 0})</small>
                  <strong>{folio.totalCharges ?? 0} {folio.currency ?? 'BOB'}</strong>
                </div>

                <div className="folio-total">
                  <small>Pagado ({folio.payments?.length ?? 0})</small>
                  <strong>{folio.totalPaid ?? 0} {folio.currency ?? 'BOB'}</strong>
                </div>

                <div className={`folio-balance ${folio.balance > 0 ? 'debt' : ''}`}>
                  <small>Saldo final</small>
                  <strong>{folio.balance ?? 0} {folio.currency ?? 'BOB'}</strong>
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedFolio(folio)}
                    className="secondary-button compact-button"
                    title="Ver detalle de folio"
                  >
                    Detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolioForCharge(folio)}
                    className="secondary-button compact-button"
                    title="Registrar consumo / cargo"
                  >
                    <Plus size={14} /> Cargo
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolioForPayment(folio)}
                    className="primary-button compact-button"
                    title="Registrar pago"
                  >
                    <DollarSign size={14} /> Pago
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Modal Detalle de Folio */}
      {selectedFolio && (
        <FolioDetailModal
          folio={selectedFolio}
          stay={stays.find((s) => s.id === selectedFolio.stayId)}
          guest={guests.find((g) => stays.find((s) => s.id === selectedFolio.stayId)?.guestIds.includes(g.id))}
          room={rooms.find((r) => r.id === stays.find((s) => s.id === selectedFolio.stayId)?.roomId)}
          onClose={() => setSelectedFolio(null)}
          onAddCharge={() => {
            setFolioForCharge(selectedFolio)
          }}
          onProcessPayment={() => {
            setFolioForPayment(selectedFolio)
          }}
        />
      )}

      {/* Modal Registrar Cargo / Consumo */}
      {folioForCharge && (
        <AddChargeModal
          establishmentId={establishmentId}
          folio={folioForCharge}
          onClose={() => setFolioForCharge(null)}
          onSaved={() => {
            setFolioForCharge(null)
            setSuccessMessage('Cargo registrado exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Registrar Pago */}
      {folioForPayment && (
        <ProcessPaymentModal
          establishmentId={establishmentId}
          folio={folioForPayment}
          onClose={() => setFolioForPayment(null)}
          onSaved={() => {
            setFolioForPayment(null)
            setSuccessMessage('Pago autorizado y registrado exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

interface FolioDetailModalProps {
  folio: Folio
  stay?: Stay
  guest?: Guest
  room?: Room
  onClose: () => void
  onAddCharge: () => void
  onProcessPayment: () => void
}

function FolioDetailModal({
  folio,
  guest,
  room,
  onClose,
  onAddCharge,
  onProcessPayment,
}: FolioDetailModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-form" style={{ maxWidth: '600px', width: '92%' }}>
        <div className="modal-header">
          <div>
            <span className="kicker">Detalle de folio</span>
            <h2>Folio #{folio.id.slice(0, 8)}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: '12px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--paper)', padding: '10px 14px', borderRadius: '6px' }}>
            <div>
              <small style={{ color: 'var(--muted)' }}>Huésped:</small>
              <div><strong>{guest ? `${guest.firstName} ${guest.lastName}` : 'Desconocido'}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--muted)' }}>Habitación:</small>
              <div><strong>{room?.name ?? folio.stayId}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--muted)' }}>Estado del Folio:</small>
              <div><strong style={{ textTransform: 'capitalize' }}>{folio.status}</strong></div>
            </div>
          </div>

          {/* Tabla de Cargos */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <strong>Consumos / Cargos ({folio.charges?.length ?? 0})</strong>
              <button
                type="button"
                className="secondary-button"
                onClick={onAddCharge}
                style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--teal)', borderColor: 'var(--mint)' }}
              >
                + Agregar Cargo
              </button>
            </div>

            {(!folio.charges || folio.charges.length === 0) ? (
              <div style={{ padding: '10px', background: 'var(--paper)', borderRadius: '5px', fontSize: '12px', color: 'var(--muted)' }}>
                No hay consumos ni cargos registrados.
              </div>
            ) : (
              <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ background: '#f0f4f2', borderBottom: '1px solid var(--line)' }}>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Descripción</th>
                      <th style={{ padding: '6px 8px' }}>Cant.</th>
                      <th style={{ padding: '6px 8px' }}>P.Unit</th>
                      <th style={{ padding: '6px 8px' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folio.charges.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 8px' }}>{c.description}</td>
                        <td style={{ padding: '6px 8px' }}>{c.quantity}</td>
                        <td style={{ padding: '6px 8px' }}>{c.unitPrice}</td>
                        <td style={{ padding: '6px 8px' }}><strong>{c.amount}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabla de Pagos */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <strong>Pagos registrados ({folio.payments?.length ?? 0})</strong>
              <button
                type="button"
                className="primary-button compact-button"
                onClick={onProcessPayment}
                style={{ padding: '4px 8px', fontSize: '11px', margin: 0 }}
              >
                + Registrar Pago
              </button>
            </div>

            {(!folio.payments || folio.payments.length === 0) ? (
              <div style={{ padding: '10px', background: 'var(--paper)', borderRadius: '5px', fontSize: '12px', color: 'var(--muted)' }}>
                No se han registrado pagos en este folio.
              </div>
            ) : (
              <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ background: '#eaf6ed', borderBottom: '1px solid var(--line)' }}>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Método</th>
                      <th style={{ padding: '6px 8px' }}>Ref</th>
                      <th style={{ padding: '6px 8px' }}>Fecha</th>
                      <th style={{ padding: '6px 8px' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folio.payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{p.method}</td>
                        <td style={{ padding: '6px 8px' }}>{p.reference ?? '-'}</td>
                        <td style={{ padding: '6px 8px' }}>{formatDate(p.createdAt)}</td>
                        <td style={{ padding: '6px 8px', color: '#1b5e30' }}><strong>+{p.amount}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Resumen Final */}
          <div
            style={{
              padding: '12px',
              background: folio.balance > 0 ? '#fff0eb' : '#eaf6ed',
              border: '1px solid',
              borderColor: folio.balance > 0 ? '#f0b4a4' : '#b6e2c1',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',

            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Saldo pendiente:</span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: folio.balance > 0 ? 'var(--coral)' : '#1e6631' }}>
                {folio.balance} {folio.currency}
              </div>
            </div>
            <div style={{ fontSize: '12px', textAlign: 'right', color: 'var(--muted)' }}>
              <div>Total Cargos: {folio.totalCharges} {folio.currency}</div>
              <div>Total Pagado: {folio.totalPaid} {folio.currency}</div>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: '14px' }}>
          <button className="secondary-button" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

interface AddChargeModalProps {
  establishmentId: string
  folio: Folio
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function AddChargeModal({
  establishmentId,
  folio,
  onClose,
  onSaved,
  onError,
}: AddChargeModalProps) {
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const estimatedAmount = useMemo(() => {
    return Math.max(0, quantity) * Math.max(0, unitPrice)
  }, [quantity, unitPrice])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const validation = addChargeSchema.safeParse({
      stayId: folio.stayId,
      description,
      quantity,
      unitPrice,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de consumo no válidos.')
      return
    }

    setSubmitting(true)
    try {
      await addChargeToFolio({
        establishmentId,
        stayId: folio.stayId,
        description,
        quantity,
        unitPrice,
      })
      onSaved()
    } catch {
      const msg = 'No se pudo registrar el consumo. La Cloud Function "addConsumption" debe estar desplegada en el backend.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }

  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '440px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Consumos</span>
            <h2>Registrar consumo</h2>
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
          Descripción del consumo / producto
          <input
            type="text"
            placeholder="Ej. Bebida, Toalla extra, Snack, Lavandería..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>

        <div className="form-row">
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Precio Unitario (BOB)
            <input
              type="number"
              min="0"
              step="0.5"
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <div style={{ padding: '10px 12px', background: '#f4f8f6', borderRadius: '5px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Monto estimado a cargar:</span>
            <strong>{estimatedAmount} BOB</strong>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={11} />
            El backend server-side registrará el cargo y actualizará el saldo del folio.
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Confirmar cargo'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface ProcessPaymentModalProps {
  establishmentId: string
  folio: Folio
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function ProcessPaymentModal({
  establishmentId,
  folio,
  onClose,
  onSaved,
  onError,
}: ProcessPaymentModalProps) {
  const [amount, setAmount] = useState<number>(folio.balance > 0 ? folio.balance : 0)
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')
  const [reference, setReference] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const validation = processPaymentSchema.safeParse({
      stayId: folio.stayId,
      amount,
      method,
      reference,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de pago inválidos.')
      return
    }

    setSubmitting(true)
    try {
      await processPayment({
        establishmentId,
        stayId: folio.stayId,
        amount,
        method,
        reference: reference.trim() || null,
      })
      onSaved()
    } catch {
      const msg = 'El pago no pudo procesarse. La Cloud Function "recordPayment" debe estar disponible en el backend.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }

  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '440px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Pagos</span>
            <h2>Registrar Pago</h2>
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

        <div style={{ padding: '8px 12px', background: '#eaf6ed', borderRadius: '5px', fontSize: '12px', marginBottom: '10px' }}>
          Deuda actual del folio: <strong>{folio.balance} {folio.currency}</strong>
        </div>

        <label>
          Monto a pagar (BOB)
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
          Método de Pago
          <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Referencia / Comprobante (Opcional)
          <input
            type="text"
            placeholder="N° de transacción, lote, voucher o nota..."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Procesando pago...' : 'Autorizar y registrar pago'}
          </button>
        </div>
      </form>
    </div>
  )
}
