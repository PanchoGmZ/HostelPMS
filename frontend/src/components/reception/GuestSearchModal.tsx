import { useState, useMemo } from 'react'
import { X, Search, BedDouble } from 'lucide-react'
import type { Guest } from '../../types/guests'
import type { Stay } from '../../types/stays'
import type { Reservation } from '../../types/reservations'
import type { Room } from '../../types/rooms'

interface GuestSearchModalProps {
  guests: Guest[]
  stays: Stay[]
  reservations: Reservation[]
  rooms: Room[]
  onClose: () => void
  onSelectStay: (stay: Stay) => void
  onSelectReservation: (reservation: Reservation) => void
}

export function GuestSearchModal({
  guests,
  stays,
  reservations,
  rooms,
  onClose,
  onSelectStay,
  onSelectReservation,
}: GuestSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)

  // Filter guests
  const filteredGuests = useMemo(() => {
    if (!searchTerm.trim()) return guests.slice(0, 15)
    const q = searchTerm.toLowerCase().trim()
    return guests.filter(
      (g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q) ||
        (g.email && g.email.toLowerCase().includes(q)) ||
        (g.whatsapp && g.whatsapp.includes(q))
    )
  }, [guests, searchTerm])

  // Active stay for selected guest
  const guestActiveStay = useMemo(() => {
    if (!selectedGuest) return null
    return stays.find((s) => s.status === 'active' && s.guestIds?.includes(selectedGuest.id))
  }, [selectedGuest, stays])

  // Confirmed reservations for selected guest
  const guestReservations = useMemo(() => {
    if (!selectedGuest) return []
    return reservations.filter(
      (r) => r.status === 'confirmed' && r.primaryGuestId === selectedGuest.id
    )
  }, [selectedGuest, reservations])

  const getRoomName = (roomId?: string | null) => {
    if (!roomId) return 'Habitación'
    const r = rooms.find((item) => item.id === roomId)
    return r ? r.name : 'Habitación'
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-form guest-search-modal"
        style={{ maxWidth: '620px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <span className="kicker">Directorio Rápido</span>
            <h2>Buscar Huésped</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Escribe nombre, apellido, documento, teléfono o correo..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setSelectedGuest(null)
            }}
            autoFocus
            style={{ paddingLeft: '38px' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selectedGuest ? '1fr 1.2fr' : '1fr', gap: '14px', maxHeight: '380px' }}>
          {/* Guest list */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filteredGuests.length === 0 ? (
              <p className="empty-text" style={{ padding: '20px 10px', textAlign: 'center' }}>
                No se encontraron huéspedes con ese criterio.
              </p>
            ) : (
              filteredGuests.map((g) => {
                const isSelected = selectedGuest?.id === g.id
                const isAccommodated = stays.some((s) => s.status === 'active' && s.guestIds?.includes(g.id))

                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`guest-search-tile ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedGuest(g)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '2px solid var(--teal)' : '1px solid var(--line)',
                      background: isSelected ? 'var(--mint)' : 'var(--white)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ display: 'block', fontSize: '14px', color: 'var(--ink)' }}>
                        {g.firstName} {g.lastName}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {g.documentType?.toUpperCase()} {g.documentNumber}
                      </span>
                    </div>

                    {isAccommodated && (
                      <span className="status-badge available" style={{ fontSize: '11px', padding: '2px 6px' }}>
                        Hospedado
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Selected Guest Profile & Operations */}
          {selectedGuest && (
            <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span className="kicker">Ficha del Huésped</span>
                <h3 style={{ margin: '4px 0 2px', fontSize: '17px' }}>
                  {selectedGuest.firstName} {selectedGuest.lastName}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Nacionalidad: {selectedGuest.nationality || 'No especificada'}
                </span>
              </div>

              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Documento: <strong>{selectedGuest.documentType?.toUpperCase()} {selectedGuest.documentNumber}</strong></div>
                {selectedGuest.whatsapp && <div>Teléfono / WhatsApp: <strong>{selectedGuest.whatsapp}</strong></div>}
                {selectedGuest.email && <div>Email: <strong>{selectedGuest.email}</strong></div>}
              </div>

              {/* Active Stay */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                <span className="kicker">Estadía Activa</span>
                {guestActiveStay ? (
                  <div style={{ marginTop: '6px', padding: '8px', background: 'var(--white)', borderRadius: '6px', border: '1px solid var(--ok-line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--teal)' }}>
                      <BedDouble size={14} /> {getRoomName(guestActiveStay.roomId)}
                    </div>
                    <button
                      type="button"
                      className="primary-button compact-button full-width"
                      style={{ marginTop: '8px' }}
                      onClick={() => {
                        onClose()
                        onSelectStay(guestActiveStay)
                      }}
                    >
                      Abrir Cuenta y Detalles
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0' }}>
                    No tiene una estadía en curso actualmente.
                  </p>
                )}
              </div>

              {/* Future or Confirmed Reservations */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                <span className="kicker">Reservas Confirmadas ({guestReservations.length})</span>
                {guestReservations.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0' }}>
                    Sin reservas activas.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    {guestReservations.map((res) => (
                      <div key={res.id} style={{ padding: '8px', background: 'var(--white)', borderRadius: '6px', border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {getRoomName(res.roomId)} ({res.bedIds?.length} cama)
                        </div>
                        <button
                          type="button"
                          className="secondary-button compact-button full-width"
                          style={{ marginTop: '6px', fontSize: '12px' }}
                          onClick={() => {
                            onClose()
                            onSelectReservation(res)
                          }}
                        >
                          Ver / Check-in
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
