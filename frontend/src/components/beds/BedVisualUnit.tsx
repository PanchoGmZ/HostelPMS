import { Check, Clock, AlertTriangle, Sparkles, User } from 'lucide-react'
import type { Bed, Room } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'
import type { Reservation } from '../../types/reservations'
import './BedVisualUnit.css'

export type BedVisualStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance'

export interface BedVisualUnitProps {
  bed: Bed
  room: Room
  stay?: Stay
  guest?: Guest
  folio?: Folio
  todayReservation?: Reservation
  isFullRoomOccupied?: boolean
  isFullRoomReserved?: boolean
  fullRoomGuestName?: string
  onClick?: () => void
  disabled?: boolean
  showPrice?: boolean
}

export function BedVisualUnit({
  bed,
  room,
  stay,
  guest,
  folio,
  todayReservation,
  isFullRoomOccupied = false,
  isFullRoomReserved = false,
  fullRoomGuestName,
  onClick,
  disabled = false,
  showPrice = false,
}: BedVisualUnitProps) {
  // Determine status and labels
  let status: BedVisualStatus = 'available'
  let statusLabel = 'Libre'
  let detailText = `${bed.basePriceBed || room.basePriceRoom || 0} BOB`
  let guestDisplayName: string | undefined = undefined

  if (bed.maintenanceBlocked || bed.status === 'inactive' || Boolean(bed.outOfServiceReason)) {
    status = 'maintenance'
    statusLabel = 'Bloqueada'
    detailText = bed.outOfServiceReason || 'Mantenimiento'
  } else if (stay && stay.status === 'active') {
    status = 'occupied'
    statusLabel = 'Ocupada'
    guestDisplayName = guest ? `${guest.firstName} ${guest.lastName}` : (fullRoomGuestName || 'Huésped')
    const balance = folio?.balance ?? 0
    detailText = balance > 0 ? `Debe ${balance} BOB` : 'Al día ✓'
  } else if (isFullRoomOccupied) {
    status = 'occupied'
    statusLabel = 'Ocupada'
    guestDisplayName = fullRoomGuestName || 'Hab. Completa'
    detailText = 'Hab. Completa'
  } else if (bed.isAvailable === false && !stay && !todayReservation) {
    status = 'occupied'
    statusLabel = 'Ocupada'
    detailText = 'En uso'
  } else if (bed.cleaningPending) {
    status = 'cleaning'
    statusLabel = 'Limpieza'
    detailText = 'Por limpiar'
  } else if (todayReservation || isFullRoomReserved) {
    status = 'reserved'
    statusLabel = 'Reservada'
    const isQuick = todayReservation && !todayReservation.primaryGuestId && !!todayReservation.bookingContact?.name
    guestDisplayName = isQuick
      ? todayReservation.bookingContact?.name
      : (guest ? `${guest.firstName} ${guest.lastName}` : (fullRoomGuestName || 'Reserva hoy'))
    detailText = isQuick ? '⚠️ Datos pendientes' : 'Llegada hoy'
  }

  const isDouble = bed.bedType === '2_plazas'
  const sizeClass = isDouble ? 'size-2-plazas' : 'size-1-plaza'
  const sizeLabel = isDouble ? '2 plazas' : '1 plaza'
  const sizeShort = isDouble ? '2 pl' : '1 pl'
  const bedDisplayName = bed.label || `Cama ${bed.id.slice(-3)}`

  const getStatusIcon = () => {
    switch (status) {
      case 'available':
        return <Check size={11} />
      case 'occupied':
        return <User size={11} />
      case 'reserved':
        return <Clock size={11} />
      case 'cleaning':
        return <Sparkles size={11} />
      case 'maintenance':
        return <AlertTriangle size={11} />
    }
  }

  const ariaDescription = `${bedDisplayName} - ${sizeLabel} - Estado: ${statusLabel}${
    guestDisplayName ? ` - Huésped: ${guestDisplayName}` : ''
  } - ${detailText}`

  return (
    <button
      type="button"
      className={`bed-visual-unit ${sizeClass} status-${status}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaDescription}
      title={ariaDescription}
    >
      {/* Cabecera / Almohadas físicas */}
      <div className="bed-headboard">
        <div className="bed-pillows-cluster">
          {isDouble ? (
            <>
              <span className="bed-pillow-graphic" />
              <span className="bed-pillow-graphic" />
            </>
          ) : (
            <span className="bed-pillow-graphic" />
          )}
        </div>
        <span className="bed-size-tag" title={sizeLabel}>
          {sizeShort}
        </span>
      </div>

      {/* Cuerpo del Colchón */}
      <div className="bed-mattress-body">
        <div className="bed-label-title" title={bedDisplayName}>
          {bedDisplayName}
        </div>

        <div className="bed-status-chip">
          {getStatusIcon()}
          <span>{statusLabel}</span>
        </div>

        <div className="bed-detail-line" title={guestDisplayName || detailText}>
          {guestDisplayName ? (
            <span style={{ fontWeight: 700 }}>{guestDisplayName}</span>
          ) : showPrice ? (
            <span>{bed.basePriceBed || room.basePriceRoom || 0} BOB</span>
          ) : (
            <span>{detailText}</span>
          )}
        </div>
      </div>

      {/* Tooltip Hover en Desktop */}
      <div className="bed-tooltip" role="tooltip">
        <div className="tooltip-title">
          {bedDisplayName} ({sizeLabel})
        </div>
        <div className="tooltip-row">
          <span>Habitación:</span>
          <span>{room.name}</span>
        </div>
        <div className="tooltip-row">
          <span>Estado:</span>
          <span className="tooltip-value-highlight">{statusLabel}</span>
        </div>
        {guestDisplayName && (
          <div className="tooltip-row">
            <span>Huésped:</span>
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{guestDisplayName}</span>
          </div>
        )}
        <div className="tooltip-row">
          <span>Tarifa:</span>
          <span>{bed.basePriceBed || room.basePriceRoom || 0} BOB</span>
        </div>
        {detailText && detailText !== `${bed.basePriceBed || room.basePriceRoom || 0} BOB` && (
          <div className="tooltip-row">
            <span>Detalle:</span>
            <span>{detailText}</span>
          </div>
        )}
      </div>
    </button>
  )
}
