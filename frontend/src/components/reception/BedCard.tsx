import { BedDouble, Check, AlertTriangle, Sparkles, Clock } from 'lucide-react'
import type { Bed, Room } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'
import type { Reservation } from '../../types/reservations'

export type BedVisualStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance'

interface BedCardProps {
  bed: Bed
  room: Room
  stay?: Stay
  guest?: Guest
  folio?: Folio
  todayReservation?: Reservation
  onClick: () => void
}

export function BedCard({
  bed,
  room,
  stay,
  guest,
  folio,
  todayReservation,
  onClick,
}: BedCardProps) {
  // Determine visual status
  let status: BedVisualStatus = 'available'
  let label = 'Libre'
  let detailText = `${bed.basePriceBed ?? room.basePriceRoom ?? 0} BOB`

  if (bed.maintenanceBlocked || bed.status === 'inactive') {
    status = 'maintenance'
    label = 'Mantenimiento'
    detailText = bed.outOfServiceReason || 'Bloqueada'
  } else if (stay && stay.status === 'active') {
    status = 'occupied'
    const guestName = guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped'
    label = guestName
    const balance = folio?.balance ?? 0
    detailText = balance > 0 ? `Debe: ${balance} BOB` : 'Saldo al día ✓'
  } else if (bed.cleaningPending) {
    status = 'cleaning'
    label = 'Sucia / Limpieza'
    detailText = 'Por desinfectar'
  } else if (todayReservation) {
    status = 'reserved'
    label = 'Reservada (Hoy)'
    detailText = 'Llegada esperada'
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'available':
        return <Check size={14} className="status-icon icon-available" />
      case 'occupied':
        return <BedDouble size={14} className="status-icon icon-occupied" />
      case 'reserved':
        return <Clock size={14} className="status-icon icon-reserved" />
      case 'cleaning':
        return <Sparkles size={14} className="status-icon icon-cleaning" />
      case 'maintenance':
        return <AlertTriangle size={14} className="status-icon icon-maintenance" />
    }
  }

  const bedDisplayName = bed.label || `Cama ${bed.id.slice(-3)}`

  return (
    <button
      type="button"
      className={`reception-bed-card bed-status-${status}`}
      onClick={onClick}
      title={`${bedDisplayName} - ${label}`}
      aria-label={`${bedDisplayName}, estado: ${label}`}
    >
      <div className="bed-card-header">
        <span className="bed-code">{bedDisplayName}</span>
        <span className="bed-badge" data-status={status}>
          {getStatusIcon()}
          <span className="status-title">{status === 'occupied' ? 'Ocupada' : label}</span>
        </span>
      </div>

      <div className="bed-card-body">
        {status === 'occupied' ? (
          <div className="guest-info">
            <strong className="guest-name" title={label}>{label}</strong>
            <span className={`guest-balance ${folio && folio.balance > 0 ? 'has-debt' : 'paid'}`}>
              {detailText}
            </span>
          </div>
        ) : (
          <div className="bed-info">
            <span className="bed-detail-text">{detailText}</span>
          </div>
        )}
      </div>
    </button>
  )
}
