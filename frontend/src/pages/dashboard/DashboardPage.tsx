import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  Briefcase,
  CheckCircle,
  Clock,
  Package,
  RefreshCw,
  Shirt,
  Users,
  Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { getDocumentById } from '../../services/firebase/firestoreService'
import { listRooms } from '../../services/rooms/roomsService'
import { listStays } from '../../services/stays/staysService'
import { listOperations } from '../../services/operations/operationsService'
import { listInventory } from '../../services/inventory/inventoryService'
import type { Room } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { CleaningTask, MaintenanceIncident } from '../../types/operations'
import './DashboardPage.css'

interface Establishment {
  name?: string
  currency?: string
  checkInTime?: string
  checkOutTime?: string
}

interface DashboardData {
  rooms: Room[]
  stays: Stay[]
  cleaningTasks: CleaningTask[]
  incidents: MaintenanceIncident[]
  lowStockCount: number
}

// Local date helpers (timezone-safe)
function todayLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function dateFromSeconds(seconds: number) {
  const d = new Date(seconds * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DashboardPage() {
  const { session, error: authError } = useAuth()
  const navigate = useNavigate()
  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [data, setData] = useState<DashboardData>({
    rooms: [],
    stays: [],
    cleaningTasks: [],
    incidents: [],
    lowStockCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const establishmentId = session?.establishmentId

  // Live clock
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!establishmentId) return
    const loadData = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [est, rooms, stays, ops, inv] = await Promise.all([
          getDocumentById<Establishment>('establishments', establishmentId),
          listRooms(establishmentId),
          listStays(establishmentId),
          listOperations(establishmentId),
          listInventory(establishmentId),
        ])
        const lowStockCount = inv.products.filter(
          (p) => p.lowStock || (p.currentStock <= p.minimumStock && p.minimumStock > 0)
        ).length
        setEstablishment(est)
        setData({
          rooms,
          stays: stays.filter((s) => s.status === 'active'),
          cleaningTasks: ops.cleaning.filter((t) => t.status !== 'completed'),
          incidents: ops.maintenance.filter((i) => i.status !== 'completed'),
          lowStockCount,
        })
      } catch {
        setLoadError('No se pudieron cargar los datos del establecimiento.')
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [establishmentId])

  // Computed metrics
  const today = todayLocal()

  const totalBeds = useMemo(
    () => data.rooms.reduce((acc, r) => acc + r.beds.length, 0),
    [data.rooms]
  )
  const occupiedBeds = useMemo(
    () => data.rooms.reduce((acc, r) => acc + r.beds.filter((b) => !b.isAvailable).length, 0),
    [data.rooms]
  )
  const availableBeds = totalBeds - occupiedBeds

  const activeGuests = useMemo(
    () => data.stays.reduce((acc, s) => acc + s.guestIds.length, 0),
    [data.stays]
  )

  const departuresCount = useMemo(
    () =>
      data.stays.filter(
        (s) =>
          s.expectedCheckOutDate && dateFromSeconds(s.expectedCheckOutDate.seconds) === today
      ).length,
    [data.stays, today]
  )

  const roomsOccupied = useMemo(
    () => data.rooms.filter((r) => r.beds.some((b) => !b.isAvailable)).length,
    [data.rooms]
  )
  const roomsTotal = data.rooms.length

  const cleaningPending = data.cleaningTasks.filter((t) => t.status === 'pending').length
  const maintenancePending = data.incidents.filter((i) => i.status === 'pending').length
  const blockingIncidents = data.incidents.filter(
    (i) => i.blocksResource && i.status !== 'completed'
  ).length

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <AlertTriangle size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Tu usuario aún no tiene un rol asignado para operar el PMS.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page dashboard-home">
      <header className="page-header">
        <div>
          <span className="kicker">
            {new Date().toLocaleDateString('es-BO', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
          <h1>
            Buen día, {session?.user?.displayName?.split(' ')[0] ?? 'recepción'}
          </h1>
          <p>{establishment?.name ?? 'Tu operación empieza aquí.'}</p>
        </div>
        <div className="header-cluster">
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => window.location.reload()}
            title="Actualizar datos"
          >
            <RefreshCw size={15} /> Actualizar
          </button>
          <div className="header-time">
            <Clock size={16} />
            <span>
              {time.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </header>

      {(authError || loadError) && (
        <div className="form-error" role="alert">
          {authError ?? loadError}
        </div>
      )}

      {/* Alerta crítica de bloqueos de mantenimiento */}
      {!loading && blockingIncidents > 0 && (
        <div
          className="stay-notice critical"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/operations')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/operations')}
        >
          <AlertTriangle size={18} />
          <span>
            <strong>
              {blockingIncidents} incidente
              {blockingIncidents === 1 ? '' : 's'} bloqueante
              {blockingIncidents === 1 ? '' : 's'}
            </strong>{' '}
            de mantenimiento activo{blockingIncidents === 1 ? '' : 's'}. Revisar antes de aceptar
            reservas. → Ir a Operaciones
          </span>
        </div>
      )}

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando información del hostel...
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* Card Principal - Habitaciones y Camas */}
          <Card className="card-main" onClick={() => navigate('/rooms')}>
            <div className="card-content">
              <div className="card-icon">
                <BedDouble size={32} />
              </div>
              <div className="card-info">
                <span className="card-label">Habitaciones hoy</span>
                <h2 className="card-value">
                  {roomsOccupied}/{roomsTotal}
                </h2>
                <p className="card-detail">Ocupadas</p>
                <div className="card-metric">
                  <span className="metric-badge occupied">{occupiedBeds}</span>
                  <span className="metric-text">camas ocupadas de {totalBeds}</span>
                </div>
              </div>
            </div>
            <div className="card-footer">Ir a habitaciones →</div>
          </Card>

          {/* Huéspedes Alojados */}
          <Card className="card-medium" onClick={() => navigate('/stays')}>
            <div className="card-icon">
              <Users size={28} />
            </div>
            <h3>Huéspedes Alojados</h3>
            <p className="card-big-value">{activeGuests}</p>
            <p className="card-detail">{data.stays.length} estadías activas</p>
            <div className="card-footer">Ver estadías →</div>
          </Card>

          {/* Camas Disponibles */}
          <Card className="card-medium available" onClick={() => navigate('/rooms')}>
            <div className="card-icon available">
              <Zap size={28} />
            </div>
            <h3>Camas Disponibles</h3>
            <p className="card-big-value">{availableBeds}</p>
            <p className="card-detail">Listas para check-in hoy</p>
            <div className="card-footer">Ver habitaciones →</div>
          </Card>

          {/* Salidas Hoy */}
          <Card
            className={`card-small ${departuresCount > 0 ? 'alert' : ''}`}
            onClick={() => navigate('/stays')}
          >
            <div className="card-icon">
              <BookOpen size={24} />
            </div>
            <div>
              <h4>Salidas Hoy</h4>
              <p className="card-status">
                {departuresCount > 0
                  ? `${departuresCount} check-out${departuresCount > 1 ? 's' : ''} esperado${departuresCount > 1 ? 's' : ''}`
                  : 'Sin salidas programadas'}
              </p>
            </div>
            {departuresCount > 0 && <div className="alert-dot" />}
          </Card>

          {/* Limpieza */}
          <Card
            className={`card-small ${cleaningPending > 0 ? 'alert' : ''}`}
            onClick={() => navigate('/operations')}
          >
            <div className="card-icon">
              <Shirt size={24} />
            </div>
            <div>
              <h4>Limpieza</h4>
              <p className="card-status">
                {cleaningPending > 0
                  ? `${cleaningPending} tarea${cleaningPending > 1 ? 's' : ''} pendiente${cleaningPending > 1 ? 's' : ''}`
                  : 'Al día ✓'}
              </p>
            </div>
            {cleaningPending > 0 && <div className="alert-dot" />}
          </Card>

          {/* Mantenimiento */}
          <Card
            className={`card-small ${maintenancePending > 0 ? 'alert' : ''}`}
            onClick={() => navigate('/operations')}
          >
            <div className="card-icon">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4>Mantenimiento</h4>
              <p className="card-status">
                {maintenancePending > 0
                  ? `${maintenancePending} incidente${maintenancePending > 1 ? 's' : ''} abierto${maintenancePending > 1 ? 's' : ''}${
                      blockingIncidents > 0
                        ? ` (${blockingIncidents} bloqueante${blockingIncidents > 1 ? 's' : ''})`
                        : ''
                    }`
                  : 'Sin incidentes ✓'}
              </p>
            </div>
            {maintenancePending > 0 && <div className="alert-dot" />}
          </Card>

          {/* Inventario Bajo */}
          <Card
            className={`card-small ${data.lowStockCount > 0 ? 'alert' : ''}`}
            onClick={() => navigate('/inventory')}
          >
            <div className="card-icon">
              <Package size={24} />
            </div>
            <div>
              <h4>Inventario</h4>
              <p className="card-status">
                {data.lowStockCount > 0
                  ? `${data.lowStockCount} producto${data.lowStockCount > 1 ? 's' : ''} con stock bajo`
                  : 'Stock suficiente ✓'}
              </p>
            </div>
            {data.lowStockCount > 0 && <div className="alert-dot" />}
          </Card>

          {/* Caja */}
          <Card className="card-small" onClick={() => navigate('/cash')}>
            <div className="card-icon">
              <Briefcase size={24} />
            </div>
            <div>
              <h4>Caja</h4>
              <p className="card-status">
                Ir a caja y pagos
              </p>
            </div>
          </Card>

          {/* Reservas */}
          <Card className="card-small" onClick={() => navigate('/reservations')}>
            <div className="card-icon">
              <CheckCircle size={24} />
            </div>
            <div>
              <h4>Reservas</h4>
              <p className="card-status">Ver todas las reservas</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      className={`dashboard-card ${className}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {children}
    </div>
  )
}
