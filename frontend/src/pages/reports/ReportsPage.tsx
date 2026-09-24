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
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { loadReports, generateDailySummaryOnDemand } from '../../services/reports/reportsService'
import type { DailySummary, ReportMetrics } from '../../types/reports'
import jsPDF from 'jspdf'

const PERIOD_OPTIONS = [
  { label: 'Últimos 7 días', value: 7 },
  { label: 'Últimos 30 días', value: 30 },
  { label: 'Últimos 90 días', value: 90 },
]

export function ReportsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId
  const isAdmin = establishmentId ? (session?.roles?.[establishmentId] === 'admin') : false

  const [metrics, setMetrics] = useState<ReportMetrics | null>(null)
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)
  const [generating, setGenerating] = useState(false)

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

  const exportPDF = useCallback(() => {
    const doc = new jsPDF()
    
    // Config
    const margin = 14
    let y = 20

    // Header
    doc.setFontSize(22)
    doc.setTextColor(27, 94, 48) // Teal-like color
    doc.text('Pata y Perro PMS', margin, y)
    y += 10
    
    doc.setFontSize(14)
    doc.setTextColor(31, 41, 55) // Dark Gray
    doc.text(`Reporte Operativo - Últimos ${period} días`, margin, y)
    y += 15

    // KPIs
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen General', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 8

    const r = metrics?.reservations === -1 ? '—' : (metrics?.reservations ?? 0)
    const active = metrics?.activeStays === -1 ? '—' : (metrics?.activeStays ?? 0)
    const rev = metrics?.revenue === -1 ? '—' : `${metrics?.revenue?.toFixed(0) ?? 0} BOB`
    const occ = metrics?.occupancy === -1 ? '—' : `${metrics?.occupancy ?? 0}%`

    doc.text(`Total Reservas: ${r}`, margin, y); y += 6;
    doc.text(`Estadías Activas: ${active}`, margin, y); y += 6;
    doc.text(`Ingresos Totales: ${rev}`, margin, y); y += 6;
    doc.text(`Ocupación Promedio (último día): ${occ}`, margin, y); y += 12;

    // Daily Summaries
    doc.setFont('helvetica', 'bold')
    doc.text('Histórico Diario', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 8

    // Simple Table Header
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Fecha', margin, y)
    doc.text('In', margin + 40, y)
    doc.text('Out', margin + 60, y)
    doc.text('Ocupación', margin + 80, y)
    doc.text('Ingresos', margin + 120, y)
    doc.setFont('helvetica', 'normal')
    y += 6

    // Table Body
    summaries.slice(0, 30).forEach(summary => { // limit just in case
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(summary.id, margin, y)
      doc.text(`${summary.checkIns ?? 0}`, margin + 40, y)
      doc.text(`${summary.checkOuts ?? 0}`, margin + 60, y)
      doc.text(`${summary.occupancy ?? 0}%`, margin + 80, y)
      doc.text(`${(summary.revenue ?? 0).toFixed(0)} BOB`, margin + 120, y)
      y += 6
    })

    // Footer
    const today = new Date().toLocaleString('es-BO')
    doc.setFontSize(9)
    doc.setTextColor(156, 163, 175)
    doc.text(`Generado el ${today}`, margin, 285)

    doc.save(`Reporte_PataYPerro_${period}dias.pdf`)
  }, [metrics, summaries, period])

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
        <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={exportPDF}
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}
          >
            Exportar PDF
          </button>
          {isAdmin && (
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={async () => {
                if (!establishmentId) return;
                setGenerating(true);
                try {
                  await generateDailySummaryOnDemand(establishmentId);
                  await load();
                } catch (err: any) {
                  setError(err.message || 'Error al generar reporte');
                } finally {
                  setGenerating(false);
                }
              }}
              disabled={generating}
            >
              <RefreshCw size={14} className={generating ? 'spin' : ''} />
              {generating ? 'Generando...' : 'Actualizar reporte'}
            </button>
          )}
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
          Los <strong>resúmenes diarios</strong> son generados por el backend al cierre de cada día.
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
              value={metrics?.reservations === -1 ? '—' : (metrics?.reservations ?? 0)}
              note="Reservas en los resúmenes diarios"
            />
            <ReportMetric
              icon={Users}
              label="Estadías Activas"
              value={metrics?.activeStays === -1 ? '—' : (metrics?.activeStays ?? 0)}
              note="Estadías con status = active"
            />
            <ReportMetric
              icon={DollarSign}
              label={`Ingresos (${period}d)`}
              value={metrics?.revenue === -1 ? '—' : `${metrics?.revenue?.toFixed(0) ?? 0} BOB`}
              note="Suma de ingresos en resúmenes diarios"
            />
            <ReportMetric
              icon={BarChart3}
              label="Ocupación Último Día"
              value={metrics?.occupancy === -1 ? '—' : `${metrics?.occupancy ?? 0}%`}
              note="Del resumen diario más reciente"
            />
          </section>

          {/* Ingresos por Moneda */}
          {metrics?.revenueByCurrency && Object.keys(metrics.revenueByCurrency).length > 0 && (
            <section className="summary-section" style={{ marginBottom: '24px' }}>
              <div className="section-heading">
                <h2>
                  <DollarSign size={19} /> Ingresos físicos recibidos (por moneda)
                </h2>
                <span>Últimos {period} días</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {Object.entries(metrics.revenueByCurrency).map(([cur, amount]) => (
                  <div key={cur} style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)', minWidth: '150px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600, marginBottom: '4px' }}>{cur}</div>
                    <strong style={{ fontSize: '24px', color: 'var(--teal)' }}>{amount.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

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
                  Aún no hay datos históricos consolidados para este período.
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
                          {summary.revenueByCurrency && Object.keys(summary.revenueByCurrency).length > 0 ? (
                            Object.entries(summary.revenueByCurrency).map(([cur, amt]) => (
                              <div key={cur} style={{ fontSize: '12px' }}>{amt.toFixed(2)} {cur}</div>
                            ))
                          ) : (
                            <>{(summary.revenue ?? 0).toFixed(2)} BOB</>
                          )}
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
