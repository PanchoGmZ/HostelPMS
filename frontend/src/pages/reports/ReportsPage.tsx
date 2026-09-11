import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3,
  BookMarked,
  CalendarDays,
  CircleAlert,
  Clock,
  DollarSign,
  Info,
  LogIn,
  LogOut,
  Users,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { loadReports } from '../../services/reports/reportsService'
import type { DailySummary, ReportMetrics } from '../../types/reports'

const PERIOD_OPTIONS = [
  { label: 'Últimos 7 días', value: 7 },
  { label: 'Últimos 30 días', value: 30 },
  { label: 'Últimos 90 días', value: 90 },
]

export function ReportsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [metrics, setMetrics] = useState<ReportMetrics | null>(null)
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadReports(establishmentId, period)
      setMetrics(data.metrics)
      setSummaries(data.summaries)
    } catch {
      setError('No se pudieron cargar los reportes.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId, period])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <BarChart3 size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento para ver los reportes.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page reports-page">
      <header className="page-header">
        <div>
          <span className="kicker">Lectura operativa</span>
          <h1>Reportes del Hostel</h1>
          <p>Indicadores calculados a partir de los datos registrados en Firestore.</p>
        </div>
        <div className="header-actions">
          <CalendarDays size={16} color="var(--muted)" />
          <select
            className="filter-select"
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
        </div>
      </header>

      {error && (
        <div className="form-error">
          <CircleAlert size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {/* Nota informativa sobre daily summaries */}
      <div className="stay-notice" style={{ marginBottom: '16px' }}>
        <Info size={18} />
        <span>
          Los <strong>resúmenes diarios</strong> son generados por el backend (Cloud Functions) al cierre de cada día.
          Las métricas de <strong>ocupación</strong> e <strong>ingresos</strong> provienen de esos resúmenes.
        </span>
      </div>

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando reportes...
        </div>
      ) : (
        <>
          {/* Métricas Resumen */}
          <section className="report-grid" style={{ marginBottom: '24px' }}>
            <ReportMetric
              icon={CalendarDays}
              label="Total Reservas"
              value={metrics?.reservations ?? 0}
              note="Reservas registradas en Firestore"
            />
            <ReportMetric
              icon={Users}
              label="Estadías Activas"
              value={metrics?.activeStays ?? 0}
              note="Estadías con status = active"
            />
            <ReportMetric
              icon={DollarSign}
              label={`Ingresos (${period}d)`}
              value={`${metrics?.revenue?.toFixed(0) ?? 0} BOB`}
              note="Suma de ingresos en resúmenes diarios"
            />
            <ReportMetric
              icon={BarChart3}
              label="Ocupación Último Día"
              value={`${metrics?.occupancy ?? 0}%`}
              note="Del resumen diario más reciente generado por backend"
            />
          </section>

          {/* Tabla Resúmenes Diarios */}
          <section className="summary-section">
            <div className="section-heading">
              <h2>
                <BookMarked size={19} /> Resúmenes Diarios
              </h2>
              <span>{summaries.length} día{summaries.length === 1 ? '' : 's'}</span>
            </div>

            {summaries.length === 0 ? (
              <div className="empty-state compact">
                <Clock size={28} />
                <h2>Sin históricos diarios</h2>
                <p>
                  Los resúmenes diarios aparecerán aquí cuando el backend (Cloud Function de cierre diario)
                  haya generado al menos un registro en la colección <code>dailySummaries</code>.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  <thead
                    style={{
                      background: '#f0f4f2',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <tr>
                      <th style={{ padding: '10px 12px' }}>Fecha</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <LogIn size={14} style={{ display: 'inline' }} /> Check-ins
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <LogOut size={14} style={{ display: 'inline' }} /> Check-outs
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Ocupación</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((summary) => (
                      <tr key={summary.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <strong>{summary.id}</strong>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {summary.checkIns ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {summary.checkOuts ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background:
                                (summary.occupancy ?? 0) >= 80
                                  ? '#fde8e4'
                                  : (summary.occupancy ?? 0) >= 50
                                  ? '#fff8df'
                                  : '#f0f4f2',
                              color:
                                (summary.occupancy ?? 0) >= 80
                                  ? '#8b3820'
                                  : (summary.occupancy ?? 0) >= 50
                                  ? '#806729'
                                  : '#2c4a3c',
                            }}
                          >
                            {summary.occupancy ?? 0}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                          {(summary.revenue ?? 0).toFixed(0)} BOB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function ReportMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof BarChart3
  label: string
  value: string | number
  note?: string
}) {
  return (
    <article className="report-metric" style={{ flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={19} color="var(--teal)" />
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{label}</span>
      </div>
      <strong style={{ fontSize: '24px', color: 'var(--ink)' }}>{value}</strong>
      {note && <small style={{ fontSize: '11px', color: 'var(--muted)' }}>{note}</small>}
    </article>
  )
}
