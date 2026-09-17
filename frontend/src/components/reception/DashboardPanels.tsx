import { Sparkles, Wrench, AlertTriangle } from 'lucide-react'
import type { Reservation } from '../../types/reservations'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'
import type { Folio } from '../../types/folios'
import type { CleaningTask, MaintenanceIncident } from '../../types/operations'
import './DashboardPanels.css'

function getGuestName(guestId: string | null | undefined, guests: Guest[]) {
  if (!guestId) return 'Huésped'
  const g = guests.find((item) => item.id === guestId)
  return g ? `${g.firstName} ${g.lastName}` : 'Huésped'
}

function getRoomName(roomId: string | null | undefined, rooms: Room[]) {
  if (!roomId) return 'Sin asignar'
  const r = rooms.find((item) => item.id === roomId)
  return r ? r.name : 'Habitación'
}

function getBedName(roomId: string | null | undefined, bedId: string | null | undefined, rooms: Room[]) {
  if (!roomId || !bedId) return ''
  const r = rooms.find((item) => item.id === roomId)
  if (!r) return ''
  const b = r.beds.find((item) => item.id === bedId)
  return b ? b.label || `Cama ${b.id.slice(-3)}` : ''
}

// ------------------------------------
// ARRIVALS PANEL
// ------------------------------------
interface ArrivalsPanelProps {
  todayArrivals: Reservation[]
  guests: Guest[]
  rooms: Room[]
  onCheckInReservation: (reservation: Reservation) => void
}

export function ArrivalsPanel({ todayArrivals, guests, rooms, onCheckInReservation }: ArrivalsPanelProps) {
  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="dot dot-teal"></span>
          <h3>Llegadas de hoy</h3>
        </div>
        <span className="panel-count">{todayArrivals.length} reservas</span>
      </div>
      <div className="panel-content">
        {todayArrivals.length === 0 ? (
          <div className="panel-empty">No hay llegadas programadas para hoy.</div>
        ) : (
          todayArrivals.map((res) => {
            const guestName = getGuestName(res.primaryGuestId, guests)
            const roomObj = rooms.find((item) => item.id === res.roomId)
            const isPrivate = roomObj?.type === 'private'
            const roomName = getRoomName(res.roomId, rooms)
            const bedName = res.bedIds && res.bedIds.length > 0 ? getBedName(res.roomId, res.bedIds[0], rooms) : null
            const hasBed = !!bedName || isPrivate
            
            // Format time if checkInDate is available (we just fake a time based on the image or use default 15:00)
            const timeStr = "15:00" 
            
            const locationText = isPrivate 
              ? <>{roomName} completa</>
              : hasBed 
                ? <>{roomName} · {bedName}</>
                : <span style={{color: 'var(--coral)'}}><AlertTriangle size={12} style={{display: 'inline', marginRight: '4px', verticalAlign: '-2px'}}/> Sin cama asignada</span>
                
            const capacityText = isPrivate
              ? `(${res.guestCount || 1} huéspedes)`
              : `(${res.bedIds?.length ?? 1} pers.)`

            return (
              <div key={res.id} className="panel-card">
                <div className="card-left">
                  <span className="card-time">{timeStr}</span>
                  <div className="card-info">
                    <h4 className="card-guest-name">{isPrivate ? `Titular: ${guestName}` : guestName}</h4>
                    <p className="card-location">
                      {locationText}
                      <span style={{color: 'var(--text-light)', marginLeft: '4px'}}>{capacityText}</span>
                    </p>
                  </div>
                </div>
                <div className="card-right">
                  <button type="button" className={`panel-action-btn ${hasBed ? 'checkin-btn' : 'assign-btn'}`} onClick={() => onCheckInReservation(res)}>
                    {hasBed ? 'Check-In' : 'Asignar cama'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="panel-footer">
        <button className="text-link">Ver todas las reservas ({todayArrivals.length} próximas) →</button>
      </div>
    </div>
  )
}

// ------------------------------------
// DEPARTURES PANEL
// ------------------------------------
interface DeparturesPanelProps {
  todayDepartures: Stay[]
  guests: Guest[]
  rooms: Room[]
  folios: Folio[]
  onQuickCheckout: (stay: Stay) => void
}

export function DeparturesPanel({ todayDepartures, guests, rooms, folios, onQuickCheckout }: DeparturesPanelProps) {
  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="dot dot-blue"></span>
          <h3>Salidas de hoy</h3>
        </div>
        <span className="panel-count">{todayDepartures.length} salidas</span>
      </div>
      <div className="panel-content">
        {todayDepartures.length === 0 ? (
          <div className="panel-empty">No hay salidas pendientes para hoy.</div>
        ) : (
          todayDepartures.map((stay) => {
            const guestName = getGuestName(stay.guestIds?.[0], guests)
            const roomObj = rooms.find((item) => item.id === stay.roomId)
            const isPrivate = roomObj?.type === 'private'
            const roomName = getRoomName(stay.roomId, rooms)
            const bedName = stay.bedIds && stay.bedIds.length > 0 ? getBedName(stay.roomId, stay.bedIds[0], rooms) : ''
            const folio = folios.find((f) => f.stayId === stay.id)
            const balance = folio?.balance ?? 0
            const hasDebt = balance > 0
            
            const locationText = isPrivate 
              ? `${roomName} completa (${stay.guestCount || 1} huéspedes)`
              : `${roomName} · ${bedName}`

            return (
              <div key={stay.id} className="panel-card">
                <div className="card-left">
                  <div className="card-info" style={{ marginLeft: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 className="card-guest-name">{isPrivate ? `Titular: ${guestName}` : guestName}</h4>
                      <span className={`status-badge ${hasDebt ? 'debt' : 'available'}`}>
                        {hasDebt ? `Debe ${balance.toFixed(2)} BOB` : `Al día (${balance.toFixed(2)} BOB)`}
                      </span>
                    </div>
                    <p className="card-location">{locationText} · Límite 11:00 AM</p>
                  </div>
                </div>
                <div className="card-right">
                  <button type="button" className={`panel-action-btn ${hasDebt ? 'checkout-debt-btn' : 'checkout-ok-btn'}`} onClick={() => onQuickCheckout(stay)}>
                    {hasDebt ? 'Cobrar y salir' : 'Check-out'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="panel-footer">
        <button className="text-link">Ver todas las estadías →</button>
      </div>
    </div>
  )
}

// ------------------------------------
// PENDING PANEL
// ------------------------------------
interface PendingPanelProps {
  cleaningPending: CleaningTask[]
  maintenanceActive: MaintenanceIncident[]
  rooms: Room[]
  onOpenQuickAction: (roomId: string, bedId?: string) => void
}

export function PendingPanel({ cleaningPending, maintenanceActive, rooms, onOpenQuickAction }: PendingPanelProps) {
  const pendingCount = cleaningPending.length + maintenanceActive.length

  return (
    <div className="dashboard-panel pending-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="dot dot-warn"></span>
          <h3>PENDIENTES DE RECEPCIÓN</h3>
        </div>
        <span className="panel-count success-text">
          {pendingCount === 0 ? '✓ Resto de la operativa en orden' : `${pendingCount} tareas pendientes`}
        </span>
      </div>
      <div className="panel-content">
        {pendingCount === 0 ? (
          <div className="panel-empty">No hay tareas pendientes. Todo está al día.</div>
        ) : (
          <div className="pending-list">
            {cleaningPending.map(task => {
              const roomName = getRoomName(task.roomId, rooms)
              const bedName = getBedName(task.roomId, task.bedId, rooms)
              return (
                <div key={task.id} className="pending-card clickable" onClick={() => onOpenQuickAction(task.roomId, task.bedId || "")}>
                  <div className="pending-icon cleaning"><Sparkles size={16} /></div>
                  <div className="pending-info">
                    <h4 className="pending-title">{roomName} - {bedName}</h4>
                    <p className="pending-desc">Pendiente de limpieza y desinfección.</p>
                  </div>
                  <div className="pending-action">
                    <button className="panel-action-btn outline-btn">Marcar como lista</button>
                  </div>
                </div>
              )
            })}
            {maintenanceActive.map(inc => {
              const roomName = getRoomName(inc.roomId, rooms)
              const bedName = getBedName(inc.roomId, inc.bedId, rooms)
              return (
                <div key={inc.id} className="pending-card clickable" onClick={() => onOpenQuickAction(inc.roomId || "", inc.bedId || "")}>
                  <div className="pending-icon maintenance"><Wrench size={16} /></div>
                  <div className="pending-info">
                    <h4 className="pending-title">{roomName} {bedName ? `- ${bedName}` : ''}</h4>
                    <p className="pending-desc">{inc.reason}</p>
                  </div>
                  <div className="pending-action">
                    <button className="panel-action-btn outline-btn">Ver incidencia</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
