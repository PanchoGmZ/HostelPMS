import { useState } from 'react'
import { LogIn, LogOut, FileText, CalendarCheck, CalendarX, ChevronDown, ChevronUp, User } from 'lucide-react'
import type { Reservation } from '../../types/reservations'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'
import type { Folio } from '../../types/folios'

interface TodaySectionProps {
  todayArrivals: Reservation[]
  todayDepartures: Stay[]
  guests: Guest[]
  rooms: Room[]
  folios: Folio[]
  onCheckInReservation: (reservation: Reservation) => void
  onOpenStayDetail: (stay: Stay) => void
  onQuickCheckout: (stay: Stay) => void
}

export function TodaySection({
  todayArrivals,
  todayDepartures,
  guests,
  rooms,
  folios,
  onCheckInReservation,
  onOpenStayDetail,
  onQuickCheckout,
}: TodaySectionProps) {
  const [activeTab, setActiveTab] = useState<'arrivals' | 'departures'>('arrivals')
  const [isCollapsed, setIsCollapsed] = useState(false)

  const arrivalsCount = todayArrivals.length
  const departuresCount = todayDepartures.length

  if (arrivalsCount === 0 && departuresCount === 0) {
    return null
  }

  const getGuestName = (guestId?: string | null) => {
    if (!guestId) return 'Huésped'
    const g = guests.find((item) => item.id === guestId)
    return g ? `${g.firstName} ${g.lastName}` : 'Huésped'
  }

  const getRoomName = (roomId?: string | null) => {
    if (!roomId) return 'Sin asignar'
    const r = rooms.find((item) => item.id === roomId)
    return r ? r.name : 'Habitación'
  }

  return (
    <section className="today-section-container">
      <div className="today-section-header">
        <div className="today-tabs">
          <button
            type="button"
            className={`today-tab-btn ${activeTab === 'arrivals' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('arrivals')
              setIsCollapsed(false)
            }}
          >
            <CalendarCheck size={16} />
            <span>Llegadas de Hoy</span>
            <span className="count-pill">{arrivalsCount}</span>
          </button>

          <button
            type="button"
            className={`today-tab-btn ${activeTab === 'departures' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('departures')
              setIsCollapsed(false)
            }}
          >
            <CalendarX size={16} />
            <span>Salidas de Hoy</span>
            <span className="count-pill">{departuresCount}</span>
          </button>
        </div>

        <button
          type="button"
          className="collapse-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expandir sección hoy' : 'Colapsar sección hoy'}
        >
          {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="today-list-content">
          {activeTab === 'arrivals' ? (
            arrivalsCount === 0 ? (
              <p className="empty-today-text">No hay más llegadas programadas para hoy.</p>
            ) : (
              <div className="today-cards-grid">
                {todayArrivals.map((res) => {
                  const guestName = getGuestName(res.primaryGuestId)
                  const roomName = getRoomName(res.roomId)

                  return (
                    <div key={res.id} className="today-item-card arrival">
                      <div className="item-main">
                        <div className="item-guest">
                          <User size={15} className="item-icon" />
                          <strong>{guestName}</strong>
                        </div>
                        <div className="item-details">
                          <span>{roomName}</span>
                          <span className="dot-sep">•</span>
                          <span>{res.bedIds?.length ?? 1} cama(s)</span>
                          {res.channel && (
                            <>
                              <span className="dot-sep">•</span>
                              <span className="channel-badge">{res.channel}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="primary-button compact-button checkin-action-btn"
                        onClick={() => onCheckInReservation(res)}
                      >
                        <LogIn size={15} /> Check-in
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          ) : departuresCount === 0 ? (
            <p className="empty-today-text">No hay salidas pendientes para hoy.</p>
          ) : (
            <div className="today-cards-grid">
              {todayDepartures.map((stay) => {
                const guestName = getGuestName(stay.guestIds?.[0])
                const roomName = getRoomName(stay.roomId)
                const folio = folios.find((f) => f.stayId === stay.id)
                const balance = folio?.balance ?? 0
                const hasDebt = balance > 0

                return (
                  <div key={stay.id} className="today-item-card departure">
                    <div className="item-main">
                      <div className="item-guest">
                        <User size={15} className="item-icon" />
                        <strong>{guestName}</strong>
                      </div>
                      <div className="item-details">
                        <span>{roomName}</span>
                        <span className="dot-sep">•</span>
                        <span className={`balance-tag ${hasDebt ? 'debt' : 'paid'}`}>
                          {hasDebt ? `Debe: ${balance.toFixed(2)} BOB` : 'Saldo al día ✓'}
                        </span>
                      </div>
                    </div>

                    <div className="item-actions">
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => onOpenStayDetail(stay)}
                        title="Ver cuenta y estadía"
                      >
                        <FileText size={14} /> Cuenta
                      </button>

                      <button
                        type="button"
                        className="danger-button compact-button"
                        onClick={() => onQuickCheckout(stay)}
                        title="Hacer check-out"
                      >
                        <LogOut size={14} /> Salida
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
