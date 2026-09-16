import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  FileText,
  Filter,
  Info,
  Receipt,
  Search,
  ShieldCheck,
  X,
  Eye,
  Home,
  Plus
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { listFolios } from '../../services/folios/foliosService'
import { processPayment, PAYMENT_METHODS } from '../../services/payments/paymentsService'
import { listStays } from '../../services/stays/staysService'
import { searchGuests } from '../../services/guests/guestsService'
import { listRooms } from '../../services/rooms/roomsService'
import { processPaymentSchema } from '../../schemas/foliosSchema'
import type { Folio } from '../../types/folios'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'
import './FoliosPage.css'


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
      const hasDebt = (folio.balance ?? 0) < 0
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
    return folios.reduce((acc, f) => acc + Math.max(0, -(f.balance ?? 0)), 0)
  }, [folios])

  const totalChargesSum = useMemo(() => {
    return folios.reduce((acc, f) => acc + (f.totalCharges ?? 0), 0)
  }, [folios])

  const totalPaidSum = useMemo(() => {
    return folios.reduce((acc, f) => acc + (f.totalPaid ?? 0), 0)
  }, [folios])

  const activeFoliosCount = useMemo(() => {
    return folios.filter(f => {
      const stay = stays.find(s => s.id === f.stayId);
      return stay && stay.status === 'active';
    }).length;
  }, [folios, stays]);

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <FileText size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión para gestionar folios.</p>
      </div>
    )
  }

  return (
    <div className="folios-page-container">
      <header className="folios-header">
        <div className="folios-header-left">
          <div className="folios-kicker-row">
            <span className="folios-kicker">Estado de cuenta</span>
            <div className="folios-active-count">
              <span className="folios-dot"></span>
              <span>{activeFoliosCount} Activas ahora</span>
            </div>
          </div>
          <h1 className="folios-title">Folios de Estadía</h1>
          <p className="folios-subtitle">Consulta el saldo de cada estadía: Cargos + Consumos - Pagos = Saldo Final. Los consumos se registran desde POS Consumos.</p>
        </div>
        <button className="btn-orange" onClick={() => alert("Funcionalidad en desarrollo")}>
          <Plus size={16} />
          Nuevo Movimiento
        </button>
      </header>

      {error && (
        <div className="form-error">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success" style={{ background: '#ecfdf5', color: '#065f46', padding: '12px', borderRadius: '8px' }}>
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      <div className="folios-notice">
        <ShieldCheck size={20} className="folios-notice-icon" />
        <p className="folios-notice-text">
          Los consumos se cargan automáticamente desde el módulo <strong>POS Consumos</strong>. Aquí puedes consultar el balance consolidado y registrar pagos directos.
        </p>
      </div>

      <div className="folios-kpi-strip">
        <div className="folios-kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Cargado</span>
            <div className="kpi-icon-wrapper teal">
              <Receipt size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{totalChargesSum}</span>
            <span className="kpi-currency">BOB</span>
          </div>
          <p className="kpi-subtitle">Incluye consumos y tarifas</p>
        </div>

        <div className="folios-kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Pagado</span>
            <div className="kpi-icon-wrapper green">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{totalPaidSum}</span>
            <span className="kpi-currency">BOB</span>
          </div>
          <p className="kpi-subtitle">Cobros confirmados en caja</p>
        </div>

        <div className="folios-kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Deuda Pendiente General</span>
            <div className="kpi-icon-wrapper yellow">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{totalDebtSum}</span>
            <span className="kpi-currency">BOB</span>
          </div>
          <p className="kpi-subtitle">Balance neto por cobrar</p>
        </div>
      </div>

      <div className="folios-toolbar">
        <div className="folios-search">
          <Search size={18} color="#9ca3af" />
          <input
            type="text"
            placeholder="Buscar por folio, estadía, huésped o habitación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="folios-filter">
          <Filter size={16} color="#9ca3af" />
          <select
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
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          Cargando folios financieros...
        </div>
      ) : folios.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <Receipt size={32} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '18px', margin: '0 0 8px' }}>No hay folios activos</h2>
          <p style={{ color: '#6b7280', margin: 0 }}>Los folios se crean automáticamente al iniciar una estadía en el sistema.</p>
        </div>
      ) : filteredFolios.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <Search size={28} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '18px', margin: '0 0 8px' }}>Sin resultados</h2>
          <p style={{ color: '#6b7280', margin: 0 }}>No se encontraron folios con el filtro aplicado.</p>
        </div>
      ) : (
        <div className="folios-list">
          {filteredFolios.map((folio) => {
            const stay = stays.find((s) => s.id === folio.stayId)
            const primaryGuest = guests.find((g) => stay?.guestIds.includes(g.id))
            const room = rooms.find((r) => r.id === stay?.roomId)
            
            const isDebt = (folio.balance ?? 0) < 0;
            const isOverpaid = (folio.balance ?? 0) > 0;
            const absBalance = Math.abs(folio.balance ?? 0);

            return (
              <div className="folio-card" key={folio.id}>
                <div className="folio-icon-wrapper">
                  <FileText size={20} />
                </div>

                <div className="folio-main-info">
                  <div className="folio-guest-row">
                    <span className="folio-guest-name">
                      {primaryGuest ? `${primaryGuest.firstName} ${primaryGuest.lastName}` : `Folio #${folio.id.slice(0, 6)}`}
                    </span>
                    <span className={`folio-badge ${isDebt ? 'pendiente' : (isOverpaid ? 'a-favor' : 'al-dia')}`} style={{ background: isOverpaid ? '#dbeafe' : undefined, color: isOverpaid ? '#1e40af' : undefined }}>
                      {isDebt ? 'Pendiente' : (isOverpaid ? 'A favor' : 'Al día')}
                    </span>
                  </div>
                  <div className="folio-sub-info">
                    <span>Estadía: #{folio.stayId.slice(0, 6)}</span>
                    <span>•</span>
                    <Home size={12} />
                    <span>Hab. {room?.name || '---'}</span>
                  </div>
                </div>

                <div className="folio-stats">
                  <div className="folio-stat-col">
                    <span className="folio-stat-label">Cargos ({folio.charges?.length ?? 0})</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span className="folio-stat-value">{folio.totalCharges ?? 0}</span>
                      <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600 }}>{folio.currency ?? 'BOB'}</span>
                    </div>
                  </div>

                  <div className="folio-stat-col">
                    <span className="folio-stat-label">Pagado ({folio.payments?.length ?? 0})</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span className="folio-stat-value green">{folio.totalPaid ?? 0}</span>
                      <span style={{ fontSize: '10px', color: '#059669', fontWeight: 600 }}>{folio.currency ?? 'BOB'}</span>
                    </div>
                  </div>

                  <div className="folio-stat-col">
                    <span className="folio-stat-label">Saldo Final</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', ...(isDebt ? { background: '#fffbeb', padding: '4px 8px', borderRadius: '6px' } : {}) }}>
                      <span className={`folio-stat-value ${isDebt ? 'debt' : ''}`} style={{ color: isDebt ? '#d97706' : (isOverpaid ? '#1e40af' : '#111827') }}>
                        {absBalance}
                      </span>
                      <span style={{ fontSize: '10px', color: isDebt ? '#d97706' : '#6b7280', fontWeight: 600 }}>{folio.currency ?? 'BOB'}</span>
                    </div>
                  </div>
                </div>

                <div className="folio-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedFolio(folio)}
                    className="btn-outline"
                    title="Ver detalle de folio"
                  >
                    <Eye size={14} /> Detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => setFolioForPayment(folio)}
                    className="btn-orange"
                    title="Registrar pago"
                  >
                    <DollarSign size={14} /> Pago
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <footer className="folios-footer">
        <span>Mostrando <strong>{filteredFolios.length}</strong> folios de estadías registradas</span>
        <div className="footer-sync">
          <span className="folios-dot"></span>
          Sincronizado en tiempo real con Cloud Functions
        </div>
      </footer>

      {/* Modal Detalle de Folio */}
      {selectedFolio && (
        <FolioDetailModal
          folio={selectedFolio}
          stay={stays.find((s) => s.id === selectedFolio.stayId)}
          guest={guests.find((g) => stays.find((s) => s.id === selectedFolio.stayId)?.guestIds.includes(g.id))}
          room={rooms.find((r) => r.id === stays.find((s) => s.id === selectedFolio.stayId)?.roomId)}
          onClose={() => setSelectedFolio(null)}
          onProcessPayment={() => {
            setFolioForPayment(selectedFolio)
          }}
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
  onProcessPayment: () => void
}

function FolioDetailModal({
  folio,
  guest,
  room,
  onClose,
  onProcessPayment,
}: FolioDetailModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-form" style={{ maxWidth: '600px', width: '92%' }}>
        <div className="modal-header">
          <div>
            <span className="kicker">Estado de cuenta</span>
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

          {/* Tabla de Cargos / Consumos */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <strong>Consumos / Cargos ({folio.charges?.length ?? 0})</strong>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                <Info size={11} style={{ display: 'inline', marginRight: '3px' }} />
                Registrados desde POS Consumos
              </span>
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
                className="btn-orange"
                onClick={onProcessPayment}
                style={{ padding: '6px 10px', fontSize: '11px', margin: 0, borderRadius: '6px' }}
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
              background: folio.balance < 0 ? '#fff0eb' : '#eaf6ed',
              border: '1px solid',
              borderColor: folio.balance < 0 ? '#f0b4a4' : '#b6e2c1',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {folio.balance < 0 ? 'Saldo pendiente:' : folio.balance > 0 ? 'Saldo a favor:' : 'Saldo final:'}
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: folio.balance < 0 ? '#d97706' : (folio.balance > 0 ? '#1e40af' : '#1e6631') }}>
                {Math.abs(folio.balance ?? 0)} {folio.currency}
              </div>
            </div>
            <div style={{ fontSize: '12px', textAlign: 'right', color: 'var(--muted)' }}>
              <div>Total Cargos: {folio.totalCharges} {folio.currency}</div>
              <div>Total Pagado: {folio.totalPaid} {folio.currency}</div>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: '14px' }}>
          <button className="btn-outline" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
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
  const [amount, setAmount] = useState<number>(folio.balance < 0 ? Math.abs(folio.balance) : 0)
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
          Deuda actual del folio: <strong>{folio.balance < 0 ? Math.abs(folio.balance) : 0} {folio.currency}</strong>
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
          <button className="btn-outline" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="btn-orange" type="submit" disabled={submitting}>
            {submitting ? 'Procesando pago...' : 'Autorizar y registrar pago'}
          </button>
        </div>
      </form>
    </div>
  )
}
