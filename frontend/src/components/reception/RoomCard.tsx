import { DoorClosed, Users } from 'lucide-react'
import type { Room, Bed } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'
import type { Reservation } from '../../types/reservations'
import { BedVisualUnit } from '../beds/BedVisualUnit'
import '../beds/BedVisualUnit.css'

interface RoomCardProps {
  room: Room
  stays: Stay[]
  guests: Guest[]
  folios: Folio[]
  todayReservations: Reservation[]
  onBedClick: (bed: Bed, room: Room, stay?: Stay, guest?: Guest, folio?: Folio, reservation?: Reservation) => void
}

export function RoomCard({
  room,
  stays,
  guests,
  folios,
  todayReservations,
  onBedClick,
}: RoomCardProps) {
  // Translate room type
  const roomTypeLabel: Record<string, string> = {
    shared_dorm: 'Dormitorio compartido',
    dorm: 'Dormitorio compartido',
    private_room: 'Habitación privada',
    private: 'Habitación privada',
    suite: 'Suite privada',
  }

  const isPrivate = room.type === 'private' || (room.type as string) === 'private_room' || (room.type as string) === 'suite'

  // Detect if private room is occupied or reserved as a full room
  const activeFullStay = isPrivate
    ? stays.find(
        (s) =>
          s.status === 'active' &&
          (s.roomId === room.id || s.bedIds?.some((bId) => room.beds.some((b) => b.id === bId)))
      )
    : undefined

  const todayFullReservation =
    isPrivate && !activeFullStay
      ? todayReservations.find(
          (r) =>
            r.status === 'confirmed' &&
            (r.roomId === room.id ||
              r.saleMode === 'full_room' ||
              r.bedIds?.some((bId) => room.beds.some((b) => b.id === bId)))
        )
      : undefined

  const isFullRoomOccupied = isPrivate && Boolean(activeFullStay)
  const isFullRoomReserved = isPrivate && !activeFullStay && Boolean(todayFullReservation)

  // Guest information for full room display
  const fullRoomGuest = activeFullStay
    ? guests.find((g) => activeFullStay.guestIds?.includes(g.id))
    : todayFullReservation?.primaryGuestId
    ? guests.find((g) => g.id === todayFullReservation.primaryGuestId)
    : undefined

  const fullRoomGuestName = activeFullStay
    ? fullRoomGuest
      ? `${fullRoomGuest.firstName} ${fullRoomGuest.lastName}`
      : 'Huésped alojado'
    : todayFullReservation
    ? !todayFullReservation.primaryGuestId && todayFullReservation.bookingContact?.name
      ? todayFullReservation.bookingContact.name
      : fullRoomGuest
      ? `${fullRoomGuest.firstName} ${fullRoomGuest.lastName}`
      : 'Reserva hoy'
    : undefined

  const fullRoomGuestCount = activeFullStay
    ? activeFullStay.guestCount || activeFullStay.guestIds?.length || room.beds.length
    : todayFullReservation
    ? todayFullReservation.guestCount || todayFullReservation.bedIds?.length || room.beds.length
    : room.beds.length

  const fullRoomFolio = activeFullStay ? folios.find((f) => f.stayId === activeFullStay.id) : undefined

  return (
    <div className="reception-room-card">
      <div className="room-card-header">
        <div className="room-title-cluster">
          <DoorClosed size={18} className="room-icon" />
          <h3 className="room-name">{room.name}</h3>
          <span className="room-type-tag">{roomTypeLabel[room.type] ?? room.type}</span>
        </div>
        <div className="room-meta">
          <span className="floor-badge">Piso {room.floor}</span>
          <span className="bed-count-badge">
            {room.beds.length} {room.beds.length === 1 ? 'cama' : 'camas'}
          </span>
        </div>
      </div>

      {/* Banner Habitación Completa para privadas */}
      {isPrivate && (isFullRoomOccupied || isFullRoomReserved) && (
        <div
          className={`full-room-banner ${isFullRoomOccupied ? 'occupied' : 'reserved'}`}
          role="status"
          aria-label={`Habitación completa ${isFullRoomOccupied ? 'ocupada' : 'reservada'} para ${fullRoomGuestName || 'huéspedes'}`}
        >
          <div className="full-room-badge">
            <DoorClosed size={14} />
            <span>HABITACIÓN COMPLETA · {isFullRoomOccupied ? 'OCUPADA' : 'RESERVADA'}</span>
          </div>
          <div className="full-room-meta-group">
            {fullRoomGuestName && (
              <span style={{ fontWeight: 700 }}>{fullRoomGuestName}</span>
            )}
            <span className="full-room-guest-count-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={12} />
              {fullRoomGuestCount} {fullRoomGuestCount === 1 ? 'huésped' : 'huéspedes'}
            </span>
          </div>
        </div>
      )}

      {/* Grid visual de camas físicas */}
      <div className="bed-visual-grid">
        {room.beds.map((bed) => {
          // If the private room is full room occupied/reserved, link to the full room stay/res
          if (isFullRoomOccupied && activeFullStay) {
            return (
              <BedVisualUnit
                key={bed.id}
                bed={bed}
                room={room}
                stay={activeFullStay}
                guest={fullRoomGuest}
                folio={fullRoomFolio}
                isFullRoomOccupied={true}
                fullRoomGuestName={fullRoomGuestName}
                onClick={() => onBedClick(bed, room, activeFullStay, fullRoomGuest, fullRoomFolio, undefined)}
              />
            )
          }

          if (isFullRoomReserved && todayFullReservation) {
            return (
              <BedVisualUnit
                key={bed.id}
                bed={bed}
                room={room}
                todayReservation={todayFullReservation}
                guest={fullRoomGuest}
                isFullRoomReserved={true}
                fullRoomGuestName={fullRoomGuestName}
                onClick={() => onBedClick(bed, room, undefined, fullRoomGuest, undefined, todayFullReservation)}
              />
            )
          }

          // Individual bed in dorm or individual booking
          const stay = stays.find((s) => s.status === 'active' && s.bedIds?.includes(bed.id))
          const todayRes = todayReservations.find(
            (r) => r.status === 'confirmed' && r.bedIds?.includes(bed.id)
          )
          const guest = stay
            ? guests.find((g) => stay.guestIds?.includes(g.id))
            : (todayRes?.primaryGuestId ? guests.find((g) => g.id === todayRes.primaryGuestId) : undefined)
          const folio = stay ? folios.find((f) => f.stayId === stay.id) : undefined

          return (
            <BedVisualUnit
              key={bed.id}
              bed={bed}
              room={room}
              stay={stay}
              guest={guest}
              folio={folio}
              todayReservation={todayRes}
              onClick={() => onBedClick(bed, room, stay, guest, folio, todayRes)}
            />
          )
        })}
      </div>
    </div>
  )
}
