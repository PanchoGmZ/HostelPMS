import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Link2,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { loadSettings } from '../../services/settings/settingsService'
import type { SettingItem } from '../../types/settings'

export function IntegrationsPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const establishmentId = session?.establishmentId

  const [channels, setChannels] = useState<SettingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadSettings(establishmentId)
      setChannels(data.channels)
    } catch {
      setError('No se pudieron cargar los canales.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <Globe2 size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento para ver los canales e integraciones.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page integrations-page">
      <header className="page-header">
        <div>
          <span className="kicker">Canales externos</span>
          <h1>Integraciones y Canales</h1>
          <p>Estado de conexiones externas y canales de registro del hostel.</p>
        </div>
        <button
          className="primary-button compact-button"
          type="button"
          onClick={() => navigate('/settings')}
        >
          <Plus size={16} /> Administrar canales
        </button>
      </header>

      <div className="stay-notice" style={{ marginBottom: '20px' }}>
        <ShieldCheck size={18} />
        <span>
          <strong>Booking.com y Airbnb</strong> no están conectados con sincronización bidireccional automática.
          Los canales registrados en el PMS sirven como identificador de origen para fines contables y de reservas manuales.
        </span>
      </div>

      {error && (
        <div className="form-error">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando canales e integraciones...
        </div>
      ) : (
        <section className="integration-list">
          {channels.length === 0 ? (
            <div className="empty-state compact">
              <Globe2 size={28} />
              <h2>Sin canales configurados</h2>
              <p>Ve a Configuración &gt; Canales para registrar tus canales de venta.</p>
            </div>
          ) : (
            channels.map((channel) => (
              <article className="integration-row" key={channel.id}>
                <span className="integration-icon">
                  <Link2 size={18} />
                </span>
                <div>
                  <strong>{channel.name}</strong>
                  <small>
                    Canal registrado en el PMS
                    {channel.commissionPercent != null && ` · Comisión: ${channel.commissionPercent}%`}
                  </small>
                </div>
                <span
                  className="integration-status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: channel.active !== false ? '#1b5e30' : 'var(--muted)',
                    background: channel.active !== false ? '#eaf6ed' : '#f0f0f0',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={14} />
                  {channel.active !== false ? 'Solo registro manual' : 'Inactivo'}
                </span>
              </article>
            ))
          )}
        </section>
      )}
    </div>
  )
}
