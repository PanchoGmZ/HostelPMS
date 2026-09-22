import { LogIn, LogOut, FileText, User, Sparkles, Wrench, Edit2 } from 'lucide-react'
import type { Reservation } from '../../types/reservations'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'
import type { Folio } from '../../types/folios'
import type { CleaningTask, MaintenanceIncident } from '../../types/operations'
import './KanbanBoard.css'

interface KanbanBoardProps {
  todayArrivals: Reservation[]
  todayDepartures: Stay[]
  cleaningPending: CleaningTask[]
  maintenanceActive: MaintenanceIncident[]
  guests: Guest[]
  rooms: Room[]
  folios: Folio[]
  onCheckInReservation: (reservation: Reservation) => void
  onOpenStayDetail: (stay: Stay) => void
  onQuickCheckout: (stay: Stay) => void
  onOpenQuickAction: (roomId: string, bedId?: string) => void
  onModifyReservation?: (reservation: Reservation) => void
}

export function KanbanBoard({
  todayArrivals,
  todayDepartures,
  cleaningPending,
  maintenanceActive,
  guests,
  rooms,
  folios,
  onCheckInReservation,
  onOpenStayDetail,
  onQuickCheckout,
  onOpenQuickAction,
  onModifyReservation,
}: KanbanBoardProps) {

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
    <div className="kanban-board">
      {/* COLUMNA 1: LLEGADAS */}
      <div className="kanban-column arrivals-col">
        <div className="kanban-col-header">
          <div className="kanban-col-title">
            <span className="dot dot-teal"></span>
            <h3>Llegadas (To Do)</h3>
            <span className="kanban-count">{todayArrivals.length}</span>
          </div>
        </div>
        <div className="kanban-list">
          {todayArrivals.length === 0 ? (
            <div className="kanban-empty">No hay llegadas programadas.</div>
          ) : (
            todayArrivals.map((res) => {
              const guestName = getGuestName(res.primaryGuestId)
              const roomName = getRoomName(res.roomId)
              return (
                <div key={res.id} className="kanban-card">
                  <div className="card-header">
                    <span className="card-tag tag-low">Reserva</span>
                  </div>
                  <h4 className="card-title">{guestName}</h4>
                  <p className="card-desc">{roomName} • {res.bedIds?.length ?? 1} cama(s)</p>
                  <div className="card-footer">
                    <div className="card-avatars">
                      <div className="avatar"><User size={12}/></div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* v1.7: botón Modificar solo para confirmadas */}
                      {onModifyReservation && (
                        <button type="button" className="kanban-action-btn" style={{ background: 'var(--paper)', color: 'var(--text)', border: '1px solid var(--line)' }} onClick={() => onModifyReservation(res)}>
                          <Edit2 size={13} /> Modificar
                        </button>
                      )}
                      <button type="button" className="kanban-action-btn checkin" onClick={() => onCheckInReservation(res)}>
                        <LogIn size={14} /> Check-in
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* COLUMNA 2: SALIDAS */}
      <div className="kanban-column departures-col">
        <div className="kanban-col-header">
          <div className="kanban-col-title">
            <span className="dot dot-coral"></span>
            <h3>Salidas (In Progress)</h3>
            <span className="kanban-count">{todayDepartures.length}</span>
          </div>
        </div>
        <div className="kanban-list">
          {todayDepartures.length === 0 ? (
            <div className="kanban-empty">No hay salidas para hoy.</div>
          ) : (
            todayDepartures.map((stay) => {
              const guestName = getGuestName(stay.guestIds?.[0])
              const roomName = getRoomName(stay.roomId)
              const folio = folios.find((f) => f.stayId === stay.id)
              const balance = folio?.balance ?? 0
              const hasDebt = balance > 0

              return (
                <div key={stay.id} className="kanban-card">
                  <div className="card-header">
                    <span className={`card-tag ${hasDebt ? 'tag-high' : 'tag-completed'}`}>
                      {hasDebt ? 'Debe dinero' : 'Al día'}
                    </span>
                  </div>
                  <h4 className="card-title">{guestName}</h4>
                  <p className="card-desc">{roomName} • Saldo: {balance.toFixed(2)}</p>
                  
                  <div className="card-footer">
                    <button type="button" className="kanban-icon-btn" title="Ver cuenta" onClick={() => onOpenStayDetail(stay)}>
                      <FileText size={15} />
                    </button>
                    <button type="button" className="kanban-action-btn checkout" onClick={() => onQuickCheckout(stay)}>
                      <LogOut size={14} /> Salida
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* COLUMNA 3: PENDIENTES (Limpieza / Mantenimiento) */}
      <div className="kanban-column pending-col">
        <div className="kanban-col-header">
          <div className="kanban-col-title">
            <span className="dot dot-warn"></span>
            <h3>Pendientes (Tasks)</h3>
            <span className="kanban-count">{cleaningPending.length + maintenanceActive.length}</span>
          </div>
        </div>
        <div className="kanban-list">
          {(cleaningPending.length === 0 && maintenanceActive.length === 0) ? (
            <div className="kanban-empty">Todo limpio y ordenado.</div>
          ) : (
            <>
              {cleaningPending.map(task => (
                <div key={task.id} className="kanban-card clickable" onClick={() => onOpenQuickAction(task.roomId, task.bedId || "")}>
                  <div className="card-header">
                    <span className="card-tag tag-warn">Limpieza</span>
                  </div>
                  <h4 className="card-title">{getRoomName(task.roomId)}</h4>
                  <p className="card-desc">Cama pendiente de limpieza</p>
                  <div className="card-footer">
                     <Sparkles size={14} color="var(--muted)"/>
                  </div>
                </div>
              ))}
              {maintenanceActive.map(inc => (
                <div key={inc.id} className="kanban-card clickable" onClick={() => onOpenQuickAction(inc.roomId || "", inc.bedId || "")}>
                  <div className="card-header">
                    <span className="card-tag tag-high">Mantenimiento</span>
                  </div>
                  <h4 className="card-title">{getRoomName(inc.roomId)}</h4>
                  <p className="card-desc">{inc.reason}</p>
                  <div className="card-footer">
                     <Wrench size={14} color="var(--muted)"/>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
