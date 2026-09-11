import { BedDouble, CalendarCheck, CalendarX, Shirt, AlertTriangle } from 'lucide-react'
import './SummaryCards.css'

interface SummaryCardsProps {
  totalBeds: number
  occupiedBeds: number
  arrivalsToday: number
  departuresToday: number
  cleaningPending: number
  maintenanceActive: number
}

export function SummaryCards({
  totalBeds,
  occupiedBeds,
  arrivalsToday,
  departuresToday,
  cleaningPending,
  maintenanceActive,
}: SummaryCardsProps) {
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0

  return (
    <div className="summary-cards-container">
      <div className="summary-card">
        <div className="summary-card-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          <BedDouble size={20} />
        </div>
        <div className="summary-card-content">
          <span className="summary-card-label">Ocupación</span>
          <div className="summary-card-value">
            <strong>{occupancyRate}%</strong>
            <span className="summary-card-sub">({occupiedBeds}/{totalBeds} camas)</span>
          </div>
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-icon" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
          <CalendarCheck size={20} />
        </div>
        <div className="summary-card-content">
          <span className="summary-card-label">Llegadas de hoy</span>
          <div className="summary-card-value">
            <strong>{arrivalsToday}</strong>
            <span className="summary-card-sub">reservas</span>
          </div>
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-icon" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
          <CalendarX size={20} />
        </div>
        <div className="summary-card-content">
          <span className="summary-card-label">Salidas de hoy</span>
          <div className="summary-card-value">
            <strong>{departuresToday}</strong>
            <span className="summary-card-sub">check-outs</span>
          </div>
        </div>
      </div>

      {(cleaningPending > 0 || maintenanceActive > 0) && (
        <div className="summary-card alerts-card">
          {cleaningPending > 0 && (
            <div className="alert-item cleaning">
              <Shirt size={14} />
              <span>{cleaningPending} limpiezas</span>
            </div>
          )}
          {maintenanceActive > 0 && (
            <div className="alert-item maintenance">
              <AlertTriangle size={14} />
              <span>{maintenanceActive} incidencias</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
