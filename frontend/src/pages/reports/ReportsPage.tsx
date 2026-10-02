import { useCallback, useEffect, useState, useMemo } from 'react'
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  BedDouble,
  LogIn,
  LogOut,
  RefreshCw,
  FileDown,
  PieChart as PieIcon,
  Globe2,
  CreditCard,
  Sparkles,
  Clock,
  DoorOpen,
  CalendarDays,
  CircleAlert,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useAuth } from '../../context/useAuth'
import {
  loadFullReport,
  generateDailySummaryOnDemand,
  getLaPazTodayStr,
  getDateNDaysAgoLaPaz,
} from '../../services/reports/reportsService'
import type { FullReportData } from '../../types/reports'
import jsPDF from 'jspdf'
import './ReportsPage.css'

type PresetPeriod = 7 | 30 | 90 | 'custom'

const PIE_COLORS = ['#1b5e30', '#2563eb', '#d97706', '#9333ea', '#0d9488', '#e11d48', '#4b5563']

export function ReportsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId
  const isAdmin = establishmentId ? session?.roles?.[establishmentId] === 'admin' : false

  // Date selection state in America/La_Paz
  const [periodPreset, setPeriodPreset] = useState<PresetPeriod>(30)
  const [fromDate, setFromDate] = useState(() => getDateNDaysAgoLaPaz(30))
  const [toDate, setToDate] = useState(() => getLaPazTodayStr())

  const [report, setReport] = useState<FullReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Handle Preset change
  const handlePresetChange = (preset: PresetPeriod) => {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const today = getLaPazTodayStr()
      const past = getDateNDaysAgoLaPaz(preset)
      setFromDate(past)
      setToDate(today)
    }
  }

  // Load report data
  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadFullReport(establishmentId, fromDate, toDate)
      setReport(data)
    } catch (err: any) {
      console.error('Error loading report:', err)
      setError('No se pudieron cargar los datos del reporte.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId, fromDate, toDate])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // Chart data: Ingresos por día (BOB únicamente)
  const revenueChartData = useMemo(() => {
    if (!report?.summaries) return []
    return report.summaries.map((s) => {
      // Formatted date (DD MMM)
      const dParts = (s.date || s.id).split('-')
      const label = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}` : s.id

      let bob = 0
      if (typeof s.revenueBOB === 'number') {
        bob = s.revenueBOB
      } else if (s.revenueByCurrency?.BOB != null) {
        bob = s.revenueByCurrency.BOB
      } else if (s.revenueByCurrency && Object.keys(s.revenueByCurrency).length > 0) {
        bob = 0
      } else if (typeof s.revenue === 'number') {
        bob = s.revenue
      }

      return {
        date: label,
        fullDate: s.date || s.id,
        revenueBOB: Math.round(bob * 100) / 100,
      }
    })
  }, [report?.summaries])

  // Chart data: Ocupación por día (%)
  const occupancyChartData = useMemo(() => {
    if (!report?.summaries) return []
    return report.summaries.map((s) => {
      const dParts = (s.date || s.id).split('-')
      const label = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}` : s.id
      return {
        date: label,
        fullDate: s.date || s.id,
        occupancy: s.occupancy ?? 0,
      }
    })
  }, [report?.summaries])

  // PDF Export
  const exportPDF = useCallback(() => {
    if (!report) return
    const doc = new jsPDF()
    const margin = 14
    let y = 18

    // Header banner
    doc.setFillColor(27, 94, 48)
    doc.rect(0, 0, 210, 10, 'F')

    doc.setFontSize(18)
    doc.setTextColor(27, 94, 48)
    doc.setFont('helvetica', 'bold')
    doc.text('Pata y Perro Hostel PMS', margin, y + 4)
    y += 10

    doc.setFontSize(12)
    doc.setTextColor(51, 65, 85)
    doc.setFont('helvetica', 'normal')
    doc.text('Reporte de Gestión Administrativa y Operativa', margin, y)
    y += 6

    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    const todayStr = new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())
    doc.text(
      `Período: ${report.period.fromDate} al ${report.period.toDate} (${report.period.daysCount} días)  ·  Generado: ${todayStr}`,
      margin,
      y
    )
    y += 10

    // Divider
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, y, 196, y)
    y += 8

    // Section 1: KPIs Principales
    doc.setFontSize(11)
    doc.setTextColor(30, 41, 59)
    doc.setFont('helvetica', 'bold')
    doc.text('1. Indicadores Principales', margin, y)
    y += 6

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)

    const occ = report.kpis.occupancy != null ? `${report.kpis.occupancy}%` : 'Sin datos para este período'
    const rev =
      report.kpis.revenueBOB != null
        ? `${report.kpis.revenueBOB.toLocaleString('es-BO')} BOB`
        : 'Sin datos para este período'
    const res = report.kpis.reservations != null ? `${report.kpis.reservations}` : 'Sin datos para este período'
    const g = report.kpis.hostedGuests != null ? `${report.kpis.hostedGuests}` : 'Sin datos para este período'
    const act = `${report.kpis.activeStays ?? 0}`
    const stayAvg =
      report.kpis.avgNightsPerStay != null ? `${report.kpis.avgNightsPerStay} noches` : 'Sin datos para este período'
    const adr =
      report.kpis.avgNightlyRate != null ? `${report.kpis.avgNightlyRate} BOB` : 'Sin datos para este período'
    const revRes =
      report.kpis.avgRevenuePerReservation != null
        ? `${report.kpis.avgRevenuePerReservation} BOB`
        : 'Sin datos para este período'

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(margin, y, 182, 34, 3, 3, 'F')
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, y, 182, 34, 3, 3, 'S')

    doc.text(`• Ocupación Promedio: ${occ}`, margin + 6, y + 7)
    doc.text(`• Ingresos Hospedaje (BOB): ${rev}`, margin + 6, y + 14)
    doc.text(`• Tarifa Promedio Noche (ADR): ${adr}`, margin + 6, y + 21)
    doc.text(`• Ingreso Promedio / Reserva: ${revRes}`, margin + 6, y + 28)

    doc.text(`• Total Reservas: ${res}`, margin + 96, y + 7)
    doc.text(`• Huéspedes Alojados: ${g}`, margin + 96, y + 14)
    doc.text(`• Estadías Activas: ${act}`, margin + 96, y + 21)
    doc.text(`• Promedio Noches / Estadía: ${stayAvg}`, margin + 96, y + 28)
    y += 42

    // Section 2: Pagos Recibidos por Moneda
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('2. Pagos Recibidos por Moneda (v1.8)', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const curEntries = Object.entries(report.paymentsByCurrency)
    if (curEntries.length === 0) {
      doc.text('Sin pagos registrados para este período.', margin + 6, y)
      y += 8
    } else {
      curEntries.forEach(([code, amt]) => {
        doc.text(
          `• ${code}: ${amt.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          margin + 6,
          y
        )
        y += 5
      })
      y += 4
    }

    // Section 3: Canales de Reserva
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('3. Distribución por Canal de Reserva', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (report.channels.length === 0) {
      doc.text('Sin reservas registradas para este período.', margin + 6, y)
      y += 8
    } else {
      report.channels.forEach((ch) => {
        doc.text(`• ${ch.label}: ${ch.count} reservas (${ch.percentage}%)`, margin + 6, y)
        y += 5
      })
      y += 4
    }

    // Section 4: Métodos de Pago
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('4. Métodos de Pago (Transacciones)', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (report.paymentMethods.length === 0) {
      doc.text('Sin registros de métodos de pago para este período.', margin + 6, y)
      y += 8
    } else {
      report.paymentMethods.forEach((m) => {
        doc.text(`• ${m.label}: ${m.count} pagos (${m.percentage}%)`, margin + 6, y)
        y += 5
      })
      y += 4
    }

    if (y > 220) {
      doc.addPage()
      y = 20
    }

    // Section 5: Habitaciones con Mayor Ocupación
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('5. Habitaciones con Mayor Ocupación', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    report.roomOccupancies.slice(0, 10).forEach((r) => {
      const typeLabel = r.type === 'private' ? 'Privada' : 'Dormitorio'
      doc.text(
        `• ${r.name} (${typeLabel}): ${r.occupancyPct}%  —  ${r.occupiedNights} noches ocupadas`,
        margin + 6,
        y
      )
      y += 5
    })
    y += 4

    // Section 6: Nacionalidades
    if (y > 240) {
      doc.addPage()
      y = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('6. Nacionalidades más Frecuentes', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (report.nationalities.length === 0) {
      doc.text('Sin datos de nacionalidades para este período.', margin + 6, y)
      y += 8
    } else {
      const natText = report.nationalities.map((n) => `${n.nationality} (${n.count})`).join(', ')
      doc.text(natText, margin + 6, y, { maxWidth: 180 })
      y += 10
    }

    // Section 7: Tarifas Especiales
    const activeSpecials = report.specialRates.filter((s) => s.staysCount > 0)
    if (activeSpecials.length > 0) {
      if (y > 250) {
        doc.addPage()
        y = 20
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('7. Tarifas Especiales', margin, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      activeSpecials.forEach((sr) => {
        doc.text(`• ${sr.label}: ${sr.staysCount} estadías (${sr.nightsCount} noches)`, margin + 6, y)
        y += 5
      })
      y += 6
    }

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text('Pata y Perro Hostel PMS — Documento operativo administrativo interno.', margin, 287)

    doc.save(`Reporte_PataYPerro_${report.period.fromDate}_${report.period.toDate}.pdf`)
  }, [report])

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
          <span className="kicker">Lectura operativa y analítica</span>
          <h1>Reportes del Hostel</h1>
          <p>
            Métricas reales de ocupación, ingresos y operaciones en{' '}
            <strong>America/La_Paz</strong>.
          </p>
        </div>

        <div className="reports-header-controls">
          {/* Preset Buttons */}
          <div className="period-pills">
            <button
              type="button"
              className={`period-pill ${periodPreset === 7 ? 'active' : ''}`}
              onClick={() => handlePresetChange(7)}
            >
              7 días
            </button>
            <button
              type="button"
              className={`period-pill ${periodPreset === 30 ? 'active' : ''}`}
              onClick={() => handlePresetChange(30)}
            >
              30 días
            </button>
            <button
              type="button"
              className={`period-pill ${periodPreset === 90 ? 'active' : ''}`}
              onClick={() => handlePresetChange(90)}
            >
              90 días
            </button>
            <button
              type="button"
              className={`period-pill ${periodPreset === 'custom' ? 'active' : ''}`}
              onClick={() => handlePresetChange('custom')}
            >
              Personalizado
            </button>
          </div>

          {/* Custom Date Pickers */}
          {periodPreset === 'custom' && (
            <div className="custom-date-box">
              <CalendarDays size={14} color="var(--muted)" />
              <label style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>Desde:</label>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <label style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>Hasta:</label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          )}

          {/* Action buttons */}
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={exportPDF}
            disabled={!report || loading}
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}
          >
            <FileDown size={14} />
            Exportar PDF
          </button>

          {isAdmin && (
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={async () => {
                if (!establishmentId) return
                setGenerating(true)
                try {
                  await generateDailySummaryOnDemand(establishmentId)
                  await load()
                } catch (err: any) {
                  setError(err.message || 'Error al generar resumen diario')
                } finally {
                  setGenerating(false)
                }
              }}
              disabled={generating || loading}
            >
              <RefreshCw size={14} className={generating ? 'spin' : ''} />
              {generating ? 'Generando...' : 'Actualizar reporte'}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="form-error" style={{ marginBottom: '16px' }}>
          <CircleAlert size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="screen-state inline-state" style={{ minHeight: '300px' }}>
          <span className="loader" />
          Calculando métricas con información real...
        </div>
      ) : !report ? (
        <div className="empty-state">
          <BarChart3 size={32} />
          <h2>Sin datos para este período</h2>
          <p>Selecciona otro rango de fechas o actualiza el reporte.</p>
        </div>
      ) : (
        <div className="reports-container">
          {/* ── ROW 1: KPIS PRINCIPALES ── */}
          <section className="kpis-grid">
            {/* Ocupación */}
            <article className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Ocupación</span>
                <div className="kpi-icon-wrap">
                  <BedDouble size={18} />
                </div>
              </div>
              <div className="kpi-value">
                {report.kpis.occupancy != null ? `${report.kpis.occupancy}%` : 'Sin datos'}
              </div>
              <p className="kpi-subtext">
                Promedio del período ({report.period.daysCount} días)
              </p>
              <div className="kpi-badge-row">
                <span className="kpi-chip">
                  <LogIn size={11} /> {report.kpis.checkIns ?? 0} llegadas
                </span>
                <span className="kpi-chip">
                  <LogOut size={11} /> {report.kpis.checkOuts ?? 0} salidas
                </span>
              </div>
            </article>

            {/* Ingresos por hospedaje (BOB) */}
            <article className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Ingresos Hospedaje</span>
                <div className="kpi-icon-wrap">
                  <DollarSign size={18} />
                </div>
              </div>
              <div className="kpi-value">
                {report.kpis.revenueBOB != null
                  ? `${report.kpis.revenueBOB.toLocaleString('es-BO')} BOB`
                  : 'Sin datos'}
              </div>
              <p className="kpi-subtext">Moneda base local (BOB)</p>
              <div className="kpi-badge-row">
                <span className="kpi-chip">
                  ADR: {report.kpis.avgNightlyRate != null ? `${report.kpis.avgNightlyRate} BOB` : '—'}
                </span>
                <span className="kpi-chip">
                  Rev/Res: {report.kpis.avgRevenuePerReservation != null ? `${report.kpis.avgRevenuePerReservation} BOB` : '—'}
                </span>
              </div>
            </article>

            {/* Reservas & Estadías */}
            <article className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Reservas & Estadías</span>
                <div className="kpi-icon-wrap">
                  <CalendarDays size={18} />
                </div>
              </div>
              <div className="kpi-value">
                {report.kpis.reservations != null ? report.kpis.reservations : 'Sin datos'}
              </div>
              <p className="kpi-subtext">
                {report.kpis.activeStays ?? 0} estadías activas en casa hoy
              </p>
              <div className="kpi-badge-row">
                <span className="kpi-chip">
                  <CreditCard size={11} /> {report.kpis.paymentsCount ?? 0} pagos reg.
                </span>
              </div>
            </article>

            {/* Huéspedes alojados & Duración */}
            <article className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Huéspedes & Estadía</span>
                <div className="kpi-icon-wrap">
                  <Users size={18} />
                </div>
              </div>
              <div className="kpi-value">
                {report.kpis.hostedGuests != null ? report.kpis.hostedGuests : 'Sin datos'}
              </div>
              <p className="kpi-subtext">Huéspedes en estadías del período</p>
              <div className="kpi-badge-row">
                <span className="kpi-chip">
                  <Clock size={11} /> Prom: {report.kpis.avgNightsPerStay != null ? `${report.kpis.avgNightsPerStay} noches` : 'Sin datos'}
                </span>
              </div>
            </article>
          </section>

          {/* ── ROW 2: CHARTS PRINCIPALES (INGRESOS & OCUPACIÓN) ── */}
          <section className="dashboard-row-2col">
            {/* Chart Ingresos */}
            <article className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h2>
                    <TrendingUp size={18} color="var(--teal)" /> Ingresos por día (BOB)
                  </h2>
                  <p className="chart-subtitle">
                    Cobros netos en moneda local por fecha de operación
                  </p>
                </div>
              </div>
              <div className="chart-body">
                {revenueChartData.length === 0 ? (
                  <div className="chart-empty">
                    <Clock size={24} />
                    <span>Sin datos de ingresos en este período</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1b5e30" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#1b5e30" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="custom-tooltip">
                                <div className="custom-tooltip-title">{data.fullDate}</div>
                                <div className="custom-tooltip-value">{data.revenueBOB} BOB</div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenueBOB"
                        stroke="#1b5e30"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#revenueGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            {/* Chart Ocupación */}
            <article className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h2>
                    <BedDouble size={18} color="#0284c7" /> Ocupación por día (%)
                  </h2>
                  <p className="chart-subtitle">
                    Ocupación real (dormitorios por cama y privadas completas)
                  </p>
                </div>
              </div>
              <div className="chart-body">
                {occupancyChartData.length === 0 ? (
                  <div className="chart-empty">
                    <Clock size={24} />
                    <span>Sin históricos de ocupación para este período</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={occupancyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} unit="%" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="custom-tooltip">
                                <div className="custom-tooltip-title">{data.fullDate}</div>
                                <div className="custom-tooltip-value" style={{ color: '#38bdf8' }}>
                                  {data.occupancy}% ocupado
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="occupancy"
                        stroke="#0284c7"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#occupancyGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>
          </section>

          {/* ── ROW 3: DESGLOSES (MONEDAS, CANALES, MÉTODOS DE PAGO) ── */}
          <section className="dashboard-row-3col">
            {/* Pagos por Moneda (v1.8) */}
            <article className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h2>
                    <DollarSign size={18} color="var(--teal)" /> Pagos por moneda
                  </h2>
                  <p className="chart-subtitle">
                    Montos netos recibidos. Sin conversiones forzadas.
                  </p>
                </div>
              </div>
              <div>
                {Object.keys(report.paymentsByCurrency).length === 0 ? (
                  <div className="chart-empty" style={{ height: '160px' }}>
                    <span>Sin cobros en este período</span>
                  </div>
                ) : (
                  <div className="currency-badges-grid">
                    {Object.entries(report.paymentsByCurrency).map(([cur, amt]) => (
                      <div key={cur} className="currency-badge-item">
                        <span className="currency-badge-code">{cur}</span>
                        <strong className="currency-badge-amount">
                          {amt.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>

            {/* Canales de Reserva (Section 7) */}
            <article className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h2>
                    <PieIcon size={18} color="#d97706" /> Canales de reserva
                  </h2>
                  <p className="chart-subtitle">Distribución por origen de la reserva</p>
                </div>
              </div>
              <div className="chart-body" style={{ height: '220px' }}>
                {report.channels.length === 0 ? (
                  <div className="chart-empty" style={{ height: '180px' }}>
                    <span>Sin reservas registradas</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.channels}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {report.channels.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload
                            return (
                              <div className="custom-tooltip">
                                <div className="custom-tooltip-title">{d.label}</div>
                                <div className="custom-tooltip-value">
                                  {d.count} reservas ({d.percentage}%)
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {/* Channel list legend */}
              {report.channels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {report.channels.map((ch, idx) => (
                    <span
                      key={ch.channel}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        color: '#475569',
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                        }}
                      />
                      {ch.label}: <strong>{ch.count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </article>

            {/* Métodos de Pago (Section 8) */}
            <article className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h2>
                    <CreditCard size={18} color="#7c3aed" /> Métodos de pago
                  </h2>
                  <p className="chart-subtitle">Forma de pago utilizada (≠ divisa)</p>
                </div>
              </div>
              <div className="chart-body" style={{ height: '220px' }}>
                {report.paymentMethods.length === 0 ? (
                  <div className="chart-empty" style={{ height: '180px' }}>
                    <span>Sin métodos de pago registrados</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.paymentMethods} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload
                            return (
                              <div className="custom-tooltip">
                                <div className="custom-tooltip-title">{d.label}</div>
                                <div className="custom-tooltip-value">
                                  {d.count} transacciones ({d.percentage}%)
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>
          </section>

          {/* ── ROW 4: HABITACIONES, NACIONALIDADES & TARIFAS ESPECIALES ── */}
          <section className="dashboard-row-2col">
            {/* Ocupación por Habitación (Section 9) */}
            <article className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h2>
                    <DoorOpen size={18} color="var(--teal)" /> Habitaciones con mayor ocupación
                  </h2>
                  <p className="chart-subtitle">
                    Calculado con noches ocupadas reales (respetando privadas full_room)
                  </p>
                </div>
              </div>
              <div className="room-occupancy-list">
                {report.roomOccupancies.length === 0 ? (
                  <div className="chart-empty" style={{ height: '160px' }}>
                    <span>Sin habitaciones configuradas</span>
                  </div>
                ) : (
                  report.roomOccupancies.map((r) => (
                    <div key={r.roomId} className="room-bar-row">
                      <div className="room-bar-meta">
                        <div className="room-name-tag">
                          <span>{r.name}</span>
                          <span className={`room-type-badge ${r.type}`}>
                            {r.type === 'private' ? 'Privada' : 'Dormitorio'}
                          </span>
                        </div>
                        <span className="room-pct-badge">{r.occupancyPct}%</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${
                            r.occupancyPct >= 70 ? 'high' : r.occupancyPct >= 30 ? 'mid' : 'low'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, r.occupancyPct))}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            {/* Huéspedes / Nacionalidades (Section 10) & Tarifas Especiales (Section 12) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Nacionalidades */}
              <article className="chart-card">
                <div className="chart-header">
                  <div className="chart-title-group">
                    <h2>
                      <Globe2 size={18} color="#0284c7" /> Nacionalidades más frecuentes
                    </h2>
                    <p className="chart-subtitle">
                      Huéspedes con estadías operativas en el período
                    </p>
                  </div>
                </div>
                {report.nationalities.length === 0 ? (
                  <div className="chart-empty" style={{ height: '120px' }}>
                    <span>Sin datos de nacionalidades para este período</span>
                  </div>
                ) : (
                  <div className="nationalities-grid">
                    {report.nationalities.map((n) => (
                      <div key={n.nationality} className="nationality-item">
                        <span>{n.nationality}</span>
                        <strong className="nationality-count">{n.count}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              {/* Tarifas Especiales (Section 12) */}
              <article className="chart-card">
                <div className="chart-header">
                  <div className="chart-title-group">
                    <h2>
                      <Sparkles size={18} color="#d97706" /> Tarifas especiales
                    </h2>
                    <p className="chart-subtitle">
                      Voluntariados, cortesías y acuerdos especiales
                    </p>
                  </div>
                </div>
                <div className="special-rates-row">
                  {report.specialRates.map((sr) => (
                    <div key={sr.reason} className="special-rate-chip">
                      <span className="special-rate-label">{sr.label}</span>
                      <span className="special-rate-values">
                        {sr.staysCount} estadía{sr.staysCount === 1 ? '' : 's'} · {sr.nightsCount} noche{sr.nightsCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>

          {/* ── ROW 5: TABLA DE RESÚMENES DIARIOS HISTÓRICOS ── */}
          <section className="chart-card" style={{ marginTop: '8px' }}>
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <BarChart3 size={18} color="var(--teal)" /> Histórico diario consolidado
                </h2>
                <p className="chart-subtitle">
                  {report.summaries.length} día{report.summaries.length === 1 ? '' : 's'} registrados en Firestore
                </p>
              </div>
            </div>

            {report.summaries.length === 0 ? (
              <div className="empty-state compact">
                <Clock size={28} />
                <h2>Sin históricos diarios</h2>
                <p>Aún no hay datos consolidados para este período.</p>
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
                      background: '#f8fafc',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <tr>
                      <th style={{ padding: '10px 12px' }}>Fecha</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Check-ins</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Check-outs</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Ocupación</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.summaries.map((summary) => (
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
                                  : '#f0fdf4',
                              color:
                                (summary.occupancy ?? 0) >= 80
                                  ? '#8b3820'
                                  : (summary.occupancy ?? 0) >= 50
                                  ? '#806729'
                                  : '#1b5e30',
                            }}
                          >
                            {summary.occupancy ?? 0}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                          {summary.revenueByCurrency && Object.keys(summary.revenueByCurrency).length > 0 ? (
                            Object.entries(summary.revenueByCurrency).map(([cur, amt]) => (
                              <div key={cur} style={{ fontSize: '12px' }}>
                                {amt.toFixed(2)} {cur}
                              </div>
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
        </div>
      )}
    </div>
  )
}
