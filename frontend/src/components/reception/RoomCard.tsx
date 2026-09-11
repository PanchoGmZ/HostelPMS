import { DoorClosed } from 'lucide-react'
import type { Room, Bed } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'
import type { Reservation } from '../../types/reservations'
import { BedCard } from './BedCard'

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
    private_room: 'Habitación privada',
    suite: 'Suite',
  }

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

      <div className="room-beds-grid">
        {room.beds.map((bed) => {
          // Find matching active stay
          const stay = stays.find((s) => s.status === 'active' && s.bedIds?.includes(bed.id))
          const guest = stay ? guests.find((g) => stay.guestIds?.includes(g.id)) : undefined
          const folio = stay ? folios.find((f) => f.stayId === stay.id) : undefined
          const todayRes = todayReservations.find(
            (r) => r.status === 'confirmed' && r.bedIds?.includes(bed.id)
          )

          return (
            <BedCard
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
