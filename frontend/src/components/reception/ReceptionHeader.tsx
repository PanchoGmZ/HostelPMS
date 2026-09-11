import { useEffect, useState } from 'react'
import {
  Clock,
  Plus,
  Zap,
  Search,
  RefreshCw,
  Wallet,
  Shirt,
  AlertTriangle,
  User,
} from 'lucide-react'
import type { CashShift } from '../../types/cash'

interface ReceptionHeaderProps {
  establishmentName: string
  userName: string
  userRole: string | null
  activeCashShift: CashShift | null
  pendingCleaningCount: number
  activeIncidentCount: number
  onNewReservation: () => void
  onNewEntry: () => void
  onSearchGuest: () => void
  onRefresh: () => void
  isRefreshing?: boolean
}

export function ReceptionHeader({
  establishmentName,
  userName,
  userRole,
  activeCashShift,
  pendingCleaningCount,
  activeIncidentCount,
  onNewReservation,
  onNewEntry,
  onSearchGuest,
  onRefresh,
  isRefreshing,
}: ReceptionHeaderProps) {
  // Live Clock
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const isShiftOpen = !!activeCashShift && activeCashShift.status === 'open'

  const formattedDate = now.toLocaleDateString('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const formattedTime = now.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <header className="reception-header">
      {/* Top Banner: Hostel, User & Operational Status */}
      <div className="reception-header-top">
        <div className="header-hostel-info">
          <span className="kicker" style={{ textTransform: 'capitalize' }}>{formattedDate}</span>
          <h1 className="reception-title">{establishmentName}</h1>
          <div className="reception-badges-row">
            {/* User session indicator */}
            <div className="status-pill" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
              <User size={13} />
              <span>{userName} ({userRole === 'admin' ? 'Admin' : 'Recepción'})</span>
            </div>

            {/* Cash Status */}
            <div className={`status-pill ${isShiftOpen ? 'cash-open' : 'cash-closed'}`}>
              <Wallet size={13} />
              <span>{isShiftOpen ? 'Caja Abierta' : 'Caja Cerrada'}</span>
            </div>

            {/* Pending Cleaning */}
            {pendingCleaningCount > 0 && (
              <div className="status-pill cleaning-pill" title={`${pendingCleaningCount} camas por limpiar`}>
                <Shirt size={13} />
                <span>{pendingCleaningCount} limpiezas pendientes</span>
              </div>
            )}

            {/* Active Incidents */}
            {activeIncidentCount > 0 && (
              <div className="status-pill maintenance-pill" title={`${activeIncidentCount} incidencias de mantenimiento`}>
                <AlertTriangle size={13} />
                <span>{activeIncidentCount} en mantenimiento</span>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Live Clock & Quick Action Buttons */}
        <div className="header-controls">
          <div className="live-clock-badge">
            <Clock size={16} />
            <strong>{formattedTime}</strong>
          </div>

          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Actualizar datos"
          >
            <RefreshCw size={15} className={isRefreshing ? 'loader' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="reception-actions-bar">
        <div className="quick-action-buttons">
          <button
            type="button"
            className="primary-button compact-button walkin-highlight-btn"
            onClick={onNewEntry}
          >
            <Zap size={16} />
            <span>Nuevo Ingreso</span>
          </button>

          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onNewReservation}
          >
            <Plus size={16} />
            <span>Nueva Reserva</span>
          </button>

          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onSearchGuest}
          >
            <Search size={16} />
            <span>Buscar / Ver Reserva</span>
          </button>
        </div>
      </div>
    </header>
  )
}
