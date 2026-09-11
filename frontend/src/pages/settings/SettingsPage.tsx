import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  DollarSign,
  Globe,
  Info,
  Percent,
  Plus,
  Save,
  Settings2,
  ShieldAlert,
  Tag,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { loadSettings, saveSettingItem, saveSettings, toggleSettingItem } from '../../services/settings/settingsService'
import { establishmentSchema, settingItemSchema } from '../../schemas/settingsSchema'
import type { EstablishmentSettings, SettingItem } from '../../types/settings'
import { getCurrentBackendUser } from '../../services/api/backendService'

type SettingType = 'ratePlans' | 'bookingChannels' | 'promotions'

const TIMEZONES = [
  'America/La_Paz',
  'America/Santiago',
  'America/Lima',
  'America/Buenos_Aires',
  'America/Bogota',
  'America/Mexico_City',
  'America/Caracas',
  'America/Sao_Paulo',
  'UTC',
]

const CURRENCIES = ['BOB', 'USD', 'ARS', 'CLP', 'COP', 'PEN', 'MXN', 'BRL', 'UYU']

type Tab = 'establishment' | 'ratePlans' | 'channels' | 'promotions'

export function SettingsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [settings, setSettings] = useState<EstablishmentSettings | null>(null)
  const [plans, setPlans] = useState<SettingItem[]>([])
  const [channels, setChannels] = useState<SettingItem[]>([])
  const [promotions, setPromotions] = useState<SettingItem[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [diagnosticLoading, setDiagnosticLoading] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null)

  const handleTestBackend = async () => {
    setDiagnosticLoading(true)
    setDiagnosticResult(null)
    setError(null)
    try {
      const res = await getCurrentBackendUser()
      setDiagnosticResult(`Backend conectado correctamente.\nUsuario: ${res.email || 'N/A'}\nUID: ${res.uid}\nRoles: ${JSON.stringify(res.roles)}`)
    } catch (err: any) {
      setError(`Error backend: ${err.message}`)
    } finally {
      setDiagnosticLoading(false)
    }
  }

  const [activeTab, setActiveTab] = useState<Tab>('establishment')
  const [itemModal, setItemModal] = useState<{ type: SettingType; item?: SettingItem } | null>(null)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadSettings(establishmentId)
      setSettings(data.establishment)
      setPlans(data.ratePlans)
      setChannels(data.channels)
      setPromotions(data.promotions)
    } catch {
      setError('No se pudo cargar la configuración.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    window.setTimeout(() => setSuccessMessage(null), 4000)
  }

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <Settings2 size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Tu usuario no tiene un establecimiento asignado.</p>
      </div>
    )
  }

  const update = (key: keyof Omit<EstablishmentSettings, 'id'>, value: string | number) =>
    setSettings(settings ? { ...settings, [key]: value } : null)

  const submitEstablishment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!settings) return
    setError(null)

    const validation = establishmentSchema.safeParse({
      name: settings.name ?? '',
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      timezone: settings.timezone ?? '',
      currency: settings.currency ?? '',
      checkInTime: settings.checkInTime,
      checkOutTime: settings.checkOutTime,
      lateCheckoutSurchargePercent: settings.lateCheckoutSurchargePercent,
    })

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Revisa los datos del formulario.')
      return
    }

    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...payload } = settings
      await saveSettings(establishmentId, payload)
      showSuccess('Configuración del establecimiento guardada.')
    } catch {
      setError('No se pudo guardar. Solo administradores pueden modificar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (type: SettingType, item: SettingItem) => {
    try {
      await toggleSettingItem(establishmentId, type, item.id, !(item.active ?? true))
      showSuccess(`${item.name} ${!(item.active ?? true) ? 'activado' : 'desactivado'}.`)
      await load()
    } catch {
      setError(`No se pudo cambiar el estado de ${item.name}.`)
    }
  }

  const tabLabel = (tab: Tab) => {
    if (tab === 'establishment') return 'Establecimiento'
    if (tab === 'ratePlans') return `Tarifas (${plans.length})`
    if (tab === 'channels') return `Canales (${channels.length})`
    return `Promociones (${promotions.length})`
  }


  return (
    <div className="dashboard-page settings-page">
      <header className="page-header">
        <div>
          <span className="kicker">Administración</span>
          <h1>Configuración</h1>
          <p>Define los datos y reglas operativas del establecimiento.</p>
        </div>
        {session?.roles?.[establishmentId!] === 'admin' && (
          <div className="header-actions">
            <button 
              className="btn-secondary" 
              onClick={handleTestBackend}
              disabled={diagnosticLoading}
            >
              {diagnosticLoading ? 'Probando...' : 'Probar conexión backend'}
            </button>
          </div>
        )}
      </header>

      {diagnosticResult && (
        <div className="form-success" style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}>
          {diagnosticResult}
        </div>
      )}

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
        <ShieldAlert size={18} />
        <span>
          Los cambios de configuración requieren permisos de <strong>administrador</strong>. Las reglas de precios y disponibilidad son autoridad del backend.
        </span>
      </div>

      {/* Navigation Tabs */}
      <div className="module-tabs">
        {(['establishment', 'ratePlans', 'channels', 'promotions'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`module-tab ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando configuración...
        </div>
      ) : (
        <>
          {/* TAB: Establecimiento */}
          {activeTab === 'establishment' && (
            <form className="settings-form" onSubmit={submitEstablishment}>
              <div className="section-heading" style={{ marginBottom: '16px' }}>
                <h2>
                  <Building2 size={19} /> Datos del Establecimiento
                </h2>
                <button className="primary-button compact-button" type="submit" disabled={saving}>
                  <Save size={16} />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>

              <div className="form-row">
                <label>
                  Nombre del hostel
                  <input
                    value={settings?.name ?? ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="Ej. Hostal Los Pinos"
                    required
                  />
                </label>
                <label>
                  Dirección
                  <input
                    value={settings?.address ?? ''}
                    onChange={(e) => update('address', e.target.value)}
                    placeholder="Calle, ciudad, país"
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Teléfono de contacto
                  <input
                    type="tel"
                    value={settings?.phone ?? ''}
                    onChange={(e) => update('phone', e.target.value)}
                    placeholder="+591 70000000"
                  />
                </label>
                <label>
                  Email de contacto
                  <input
                    type="email"
                    value={settings?.email ?? ''}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="info@hostal.com"
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Sitio web
                  <input
                    type="url"
                    value={settings?.website ?? ''}
                    onChange={(e) => update('website', e.target.value)}
                    placeholder="https://..."
                  />
                </label>
              </div>

              <hr style={{ margin: '16px 0', borderColor: 'var(--line)' }} />

              <div className="section-heading" style={{ marginBottom: '12px' }}>
                <h2>
                  <Globe size={17} /> Localización y Moneda
                </h2>
              </div>

              <div className="form-row">
                <label>
                  Moneda
                  <select
                    value={settings?.currency ?? 'BOB'}
                    onChange={(e) => update('currency', e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Zona Horaria
                  <select
                    value={settings?.timezone ?? 'America/La_Paz'}
                    onChange={(e) => update('timezone', e.target.value)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <hr style={{ margin: '16px 0', borderColor: 'var(--line)' }} />

              <div className="section-heading" style={{ marginBottom: '12px' }}>
                <h2>
                  <Clock3 size={17} /> Horarios de Operación
                </h2>
              </div>

              <div className="form-row">
                <label>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Clock3 size={13} /> Hora de Check-in
                  </span>
                  <input
                    type="time"
                    value={settings?.checkInTime ?? '14:00'}
                    onChange={(e) => update('checkInTime', e.target.value)}
                  />
                </label>
                <label>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Clock3 size={13} /> Hora de Check-out
                  </span>
                  <input
                    type="time"
                    value={settings?.checkOutTime ?? '12:00'}
                    onChange={(e) => update('checkOutTime', e.target.value)}
                  />
                </label>
                <label>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Percent size={13} /> Recargo Late Checkout (%)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings?.lateCheckoutSurchargePercent ?? 0}
                    onChange={(e) => update('lateCheckoutSurchargePercent', Number(e.target.value))}
                  />
                </label>
              </div>
            </form>
          )}

          {/* TAB: Planes Tarifarios */}
          {activeTab === 'ratePlans' && (
            <SettingSection
              title="Planes Tarifarios"
              subtitle="Los planes tarifarios determinan las reglas de precio por temporada o tipo de huésped. El precio final es calculado por el backend."
              icon={DollarSign}
              items={plans}
              type="ratePlans"
              onAdd={() => setItemModal({ type: 'ratePlans' })}
              onEdit={(item) => setItemModal({ type: 'ratePlans', item })}
              onToggle={(item) => handleToggle('ratePlans', item)}
              showCommission={false}
            />
          )}

          {/* TAB: Canales de Reserva */}
          {activeTab === 'channels' && (
            <SettingSection
              title="Canales de Reserva"
              subtitle="Registra los canales por los que llegan reservas (recepción, teléfono, walk-in, etc.). No hay integración automática con OTAs."
              icon={Globe}
              items={channels}
              type="bookingChannels"
              onAdd={() => setItemModal({ type: 'bookingChannels' })}
              onEdit={(item) => setItemModal({ type: 'bookingChannels', item })}
              onToggle={(item) => handleToggle('bookingChannels', item)}
              showCommission={true}
            />
          )}

          {/* TAB: Promociones */}
          {activeTab === 'promotions' && (
            <SettingSection
              title="Promociones"
              subtitle="Define descuentos y promociones disponibles para los agentes al crear reservas. La aplicación de descuentos es validada por el backend."
              icon={Tag}
              items={promotions}
              type="promotions"
              onAdd={() => setItemModal({ type: 'promotions' })}
              onEdit={(item) => setItemModal({ type: 'promotions', item })}
              onToggle={(item) => handleToggle('promotions', item)}
              showCommission={true}
            />
          )}
        </>
      )}

      {/* Modal de Item */}
      {itemModal && (
        <SettingItemModal
          type={itemModal.type}
          item={itemModal.item}
          establishmentId={establishmentId}
          onClose={() => setItemModal(null)}
          onSaved={() => {
            setItemModal(null)
            showSuccess('Elemento guardado.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

interface SettingSectionProps {
  title: string
  subtitle: string
  icon: typeof Building2
  items: SettingItem[]
  type: SettingType
  showCommission: boolean
  onAdd: () => void
  onEdit: (item: SettingItem) => void
  onToggle: (item: SettingItem) => void
}

function SettingSection({
  title,
  subtitle,
  icon: Icon,
  items,
  showCommission,
  onAdd,
  onEdit,
  onToggle,
}: SettingSectionProps) {
  return (
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>
            <Icon size={19} /> {title}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        <button className="primary-button compact-button" type="button" onClick={onAdd}>
          <Plus size={15} /> Agregar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state compact" style={{ minHeight: '120px' }}>
          <Info size={22} />
          <h2>Sin elementos registrados</h2>
          <p>Agrega el primer elemento para comenzar.</p>
        </div>
      ) : (
        <div className="settings-items">
          {items.map((item) => (
            <div className="setting-item" key={item.id}>
              <div style={{ flex: 1 }}>
                <strong>{item.name}</strong>
                {item.description && (
                  <small style={{ display: 'block', color: 'var(--muted)', marginTop: '2px' }}>
                    {item.description}
                  </small>
                )}
                {showCommission && item.commissionPercent != null && (
                  <small style={{ display: 'block', color: 'var(--muted)', marginTop: '2px' }}>
                    Comisión: {item.commissionPercent}%
                  </small>
                )}
              </div>

              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: item.active !== false ? '#eaf6ed' : '#f0f0f0',
                  color: item.active !== false ? '#1b5e30' : 'var(--muted)',
                }}
              >
                {item.active !== false ? 'Activo' : 'Inactivo'}
              </span>

              <button
                type="button"
                title="Editar"
                onClick={() => onEdit(item)}
                style={{ padding: '6px', background: 'none', border: '1px solid var(--line)', borderRadius: '5px', cursor: 'pointer' }}
              >
                <Settings2 size={14} />
              </button>

              <button
                type="button"
                title={item.active !== false ? 'Desactivar' : 'Activar'}
                onClick={() => onToggle(item)}
                style={{ padding: '6px', background: 'none', border: '1px solid var(--line)', borderRadius: '5px', cursor: 'pointer' }}
              >
                {item.active !== false ? (
                  <ToggleRight size={18} color="var(--teal)" />
                ) : (
                  <ToggleLeft size={18} color="var(--muted)" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface SettingItemModalProps {
  type: SettingType
  item?: SettingItem
  establishmentId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function SettingItemModal({
  type,
  item,
  establishmentId,
  onClose,
  onSaved,
  onError,
}: SettingItemModalProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [commissionPercent, setCommissionPercent] = useState<number>(item?.commissionPercent ?? 0)
  const [active, setActive] = useState(item?.active !== false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const typeLabels: Record<SettingType, string> = {
    ratePlans: 'Plan Tarifario',
    bookingChannels: 'Canal de Reserva',
    promotions: 'Promoción',
  }

  const showCommission = type === 'bookingChannels' || type === 'promotions'

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const validation = settingItemSchema.safeParse({
      name,
      description: description || null,
      commissionPercent: showCommission ? commissionPercent : undefined,
      active,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos inválidos.')
      return
    }

    setSubmitting(true)
    try {
      const payload: Omit<SettingItem, 'id'> = {
        name: name.trim(),
        description: description.trim() || undefined,
        active,
        ...(showCommission ? { commissionPercent } : {}),
      }
      await saveSettingItem(establishmentId, type, payload, item?.id)
      onSaved()
    } catch {
      const msg = `No se pudo guardar el ${typeLabels[type].toLowerCase()}. Verifica tus permisos.`
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
            <span className="kicker">Configuración</span>
            <h2>{item ? `Editar ${typeLabels[type]}` : `Nuevo ${typeLabels[type]}`}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={14} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <label>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'ratePlans' ? 'Ej. Tarifa estándar, Temporada alta...' : type === 'bookingChannels' ? 'Ej. Recepción directa, Teléfono...' : 'Ej. Descuento estudiantes, Semana santa...'}
            required
          />
        </label>

        <label>
          Descripción (opcional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción breve..."
          />
        </label>

        {showCommission && (
          <label>
            {type === 'promotions' ? 'Descuento (%)' : 'Comisión del canal (%)'}
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(Number(e.target.value))}
            />
          </label>
        )}

        <label
          className="check-label"
          style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span style={{ fontSize: '13px' }}>Activo (disponible para usar en el PMS)</span>
        </label>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
