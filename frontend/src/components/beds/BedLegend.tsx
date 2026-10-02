import './BedVisualUnit.css'

interface BedLegendProps {
  showCleaning?: boolean
  className?: string
}

export function BedLegend({ showCleaning = true, className = '' }: BedLegendProps) {
  return (
    <div className={`bed-status-legend ${className}`} role="region" aria-label="Leyenda de estados de camas">
      <div className="legend-item" title="Cama libre para check-in o walk-in inmediato">
        <span className="legend-dot dot-available" />
        <span className="legend-label">Libre</span>
      </div>
      <div className="legend-item" title="Cama con reserva confirmada para hoy">
        <span className="legend-dot dot-reserved" />
        <span className="legend-label">Reservada</span>
      </div>
      <div className="legend-item" title="Cama ocupada por un huésped alojado">
        <span className="legend-dot dot-occupied" />
        <span className="legend-label">Ocupada</span>
      </div>
      <div className="legend-item" title="Cama bloqueada o fuera de servicio por mantenimiento">
        <span className="legend-dot dot-maintenance" />
        <span className="legend-label">Bloqueada</span>
      </div>
      {showCleaning && (
        <div className="legend-item" title="Cama pendiente de desinfección / limpieza">
          <span className="legend-dot dot-cleaning" />
          <span className="legend-label">Limpieza</span>
        </div>
      )}
    </div>
  )
}
