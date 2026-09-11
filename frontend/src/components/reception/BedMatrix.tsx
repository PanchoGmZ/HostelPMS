import { useState, useMemo } from 'react'
import { Filter, Search } from 'lucide-react'
import type { Room, Bed } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'
import type { Reservation } from '../../types/reservations'
import { RoomCard } from './RoomCard'

type FilterStatus = 'all' | 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance'

interface BedMatrixProps {
  rooms: Room[]
  stays: Stay[]
  guests: Guest[]
  folios: Folio[]
  todayReservations: Reservation[]
  onBedClick: (bed: Bed, room: Room, stay?: Stay, guest?: Guest, folio?: Folio, reservation?: Reservation) => void
}

export function BedMatrix({
  rooms,
  stays,
  guests,
  folios,
  todayReservations,
  onBedClick,
}: BedMatrixProps) {
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Compute counts for filter badges
  const counts = useMemo(() => {
    let available = 0
    let occupied = 0
    let reserved = 0
    let cleaning = 0
    let maintenance = 0

    rooms.forEach((room) => {
      room.beds.forEach((bed) => {
        const isOccupied = stays.some((s) => s.status === 'active' && s.bedIds?.includes(bed.id))
        const isReserved = todayReservations.some((r) => r.status === 'confirmed' && r.bedIds?.includes(bed.id))

        if (bed.maintenanceBlocked || bed.status === 'inactive') {
          maintenance++
        } else if (isOccupied) {
          occupied++
        } else if (bed.cleaningPending) {
          cleaning++
        } else if (isReserved) {
          reserved++
        } else {
          available++
        }
      })
    })

    const total = available + occupied + reserved + cleaning + maintenance
    return { total, available, occupied, reserved, cleaning, maintenance }
  }, [rooms, stays, todayReservations])

  // Filter rooms based on active status filter and search term
  const filteredRooms = useMemo(() => {
    return rooms
      .map((room) => {
        // Room search match
        const matchesSearch =
          searchTerm.trim() === '' ||
          room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          room.floor.toLowerCase().includes(searchTerm.toLowerCase())

        if (!matchesSearch) return null

        if (filter === 'all') return room

        // Filter individual beds in this room
        const matchingBeds = room.beds.filter((bed) => {
          const isOccupied = stays.some((s) => s.status === 'active' && s.bedIds?.includes(bed.id))
          const isReserved = todayReservations.some((r) => r.status === 'confirmed' && r.bedIds?.includes(bed.id))

          if (filter === 'maintenance') {
            return bed.maintenanceBlocked || bed.status === 'inactive'
          }
          if (filter === 'occupied') {
            return isOccupied
          }
          if (filter === 'cleaning') {
            return bed.cleaningPending && !isOccupied
          }
          if (filter === 'reserved') {
            return isReserved && !isOccupied
          }
          if (filter === 'available') {
            return (
              !isOccupied &&
              !bed.cleaningPending &&
              !isReserved &&
              !bed.maintenanceBlocked &&
              bed.status !== 'inactive'
            )
          }
          return true
        })

        if (matchingBeds.length === 0) return null

        return {
          ...room,
          beds: matchingBeds,
        }
      })
      .filter((r): r is Room => r !== null)
  }, [rooms, stays, todayReservations, filter, searchTerm])

  return (
    <div className="reception-bed-matrix">
      {/* Filter and search toolbar */}
      <div className="matrix-toolbar">
        <div className="filter-chips" role="tablist" aria-label="Filtrar camas por estado">
          <button
            type="button"
            className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todas ({counts.total})
          </button>
          <button
            type="button"
            className={`filter-chip chip-available ${filter === 'available' ? 'active' : ''}`}
            onClick={() => setFilter('available')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b5e30' }} />
            Libres ({counts.available})
          </button>
          <button
            type="button"
            className={`filter-chip chip-occupied ${filter === 'occupied' ? 'active' : ''}`}
            onClick={() => setFilter('occupied')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b9381e' }} />
            Ocupadas ({counts.occupied})
          </button>
          <button
            type="button"
            className={`filter-chip chip-reserved ${filter === 'reserved' ? 'active' : ''}`}
            onClick={() => setFilter('reserved')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#661e66' }} />
            Reservadas ({counts.reserved})
          </button>
          <button
            type="button"
            className={`filter-chip chip-cleaning ${filter === 'cleaning' ? 'active' : ''}`}
            onClick={() => setFilter('cleaning')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#806729' }} />
            Limpieza ({counts.cleaning})
          </button>
          <button
            type="button"
            className={`filter-chip chip-maintenance ${filter === 'maintenance' ? 'active' : ''}`}
            onClick={() => setFilter('maintenance')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b95e1e' }} />
            Mantenimiento ({counts.maintenance})
          </button>
        </div>

        <div className="matrix-search">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar habitación o piso..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Rooms and Beds Grid */}
      {filteredRooms.length === 0 ? (
        <div className="empty-state compact">
          <Filter size={32} />
          <h3>No hay camas que coincidan con el filtro</h3>
          <p>Intenta seleccionar otro filtro o limpiar la búsqueda para ver todas las habitaciones.</p>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => {
              setFilter('all')
              setSearchTerm('')
            }}
          >
            Restablecer filtros
          </button>
        </div>
      ) : (
        <div className="rooms-container">
          {filteredRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              stays={stays}
              guests={guests}
              folios={folios}
              todayReservations={todayReservations}
              onBedClick={onBedClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
