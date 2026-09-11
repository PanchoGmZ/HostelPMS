import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import {
  createCleaningTask,
  createIncident,
  listOperations,
  updateCleaningStatus,
  updateIncidentStatus,
} from '../../services/operations/operationsService'
import { listRooms } from '../../services/rooms/roomsService'
import { cleaningTaskSchema, maintenanceIncidentSchema } from '../../schemas/operationsSchema'
import type { Room } from '../../types/rooms'
import type { CleaningTask, MaintenanceIncident, TaskStatus } from '../../types/operations'


export function OperationsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [cleaning, setCleaning] = useState<CleaningTask[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceIncident[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [modal, setModal] = useState<'cleaning' | 'maintenance' | null>(null)
  const [cleaningFilter, setCleaningFilter] = useState<'all' | TaskStatus>('all')
  const [maintenanceFilter, setMaintenanceFilter] = useState<'all' | 'blocking' | TaskStatus>('all')

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [opsData, roomsData] = await Promise.all([
        listOperations(establishmentId),
        listRooms(establishmentId),
      ])
      setCleaning(opsData.cleaning)
      setMaintenance(opsData.maintenance)
      setRooms(roomsData)
    } catch {
      setError('No se pudieron cargar las tareas operativas.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredCleaning = useMemo(() => {
    return cleaning.filter((task) => {
      if (cleaningFilter === 'all') return true
      return task.status === cleaningFilter
    })
  }, [cleaning, cleaningFilter])

  const filteredMaintenance = useMemo(() => {
    return maintenance.filter((incident) => {
      if (maintenanceFilter === 'all') return true
      if (maintenanceFilter === 'blocking') return incident.blocksResource && incident.status !== 'completed'
      return incident.status === maintenanceFilter
    })
  }, [maintenance, maintenanceFilter])

  const nextStatus = (status: TaskStatus): TaskStatus => {
    if (status === 'pending') return 'in_progress'
    if (status === 'in_progress') return 'completed'
    return 'pending'
  }

  const handleCleaningNext = async (task: CleaningTask) => {
    if (!establishmentId) return
    const next = nextStatus(task.status)
    try {
      await updateCleaningStatus(establishmentId, task.id, next)
      setSuccessMessage(`Estado de limpieza actualizado a: ${next}`)
      await load()
    } catch {
      setError('No se pudo actualizar el estado de la tarea de limpieza.')
    }
  }

  const handleIncidentNext = async (incident: MaintenanceIncident) => {
    if (!establishmentId) return
    const next = nextStatus(incident.status)
    try {
      await updateIncidentStatus(establishmentId, incident.id, next)
      setSuccessMessage(`Estado de mantenimiento actualizado a: ${next}`)
      await load()
    } catch {
      setError('No se pudo actualizar el estado del incidente de mantenimiento.')
    }
  }

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <ClipboardList size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento activo para controlar operaciones.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page operations-page">
      <header className="page-header">
        <div>
          <span className="kicker">Operación diaria</span>
          <h1>Housekeeping y Mantenimiento</h1>
          <p>Supervisa pendientes de limpieza, desinfección e incidentes bloqueantes del hostel.</p>
        </div>
        <div className="page-actions">
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setModal('maintenance')}
          >
            <Wrench size={16} /> Incidente Mantenimiento
          </button>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={() => setModal('cleaning')}
          >
            <Plus size={18} /> Tarea Limpieza
          </button>
        </div>
      </header>

      {error && (
        <div className="form-error">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success">
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      <div className="stay-notice" style={{ marginBottom: '16px' }}>
        <ShieldCheck size={18} />
        <span>
          Los incidentes marcados con "Bloquea el recurso" impiden la reserva y disponibilidad de camas en el servidor.
        </span>
      </div>

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando operaciones del hostel...
        </div>
      ) : (
        <div className="operations-grid">
          {/* Sección Limpieza / Housekeeping */}
          <section className="operation-section">
            <div className="section-heading" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <h2>
                <ClipboardList size={19} /> Limpieza (Housekeeping)
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  className="filter-select"
                  value={cleaningFilter}
                  onChange={(e) => setCleaningFilter(e.target.value as any)}
                >
                  <option value="all">Todas ({cleaning.length})</option>
                  <option value="pending">Pendientes</option>
                  <option value="in_progress">En Progreso</option>
                  <option value="completed">Completadas</option>
                </select>
              </div>
            </div>

            {filteredCleaning.length === 0 ? (
              <p className="muted" style={{ padding: '16px 0', fontSize: '13px' }}>
                Sin tareas de limpieza bajo el filtro seleccionado.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {filteredCleaning.map((task) => {
                  const room = rooms.find((r) => r.id === task.roomId)
                  const bed = room?.beds.find((b) => b.id === task.bedId)

                  return (
                    <OperationRow
                      key={task.id}
                      title={`Habitación ${room?.name ?? task.roomId}`}
                      detail={`${bed ? `Cama ${bed.label}` : 'Toda la habitación'} · ${task.notes || 'Sin observaciones'}`}
                      status={task.status}
                      onClick={() => handleCleaningNext(task)}
                    />
                  )
                })}
              </div>
            )}
          </section>

          {/* Sección Mantenimiento */}
          <section className="operation-section">
            <div className="section-heading" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <h2>
                <Wrench size={19} /> Mantenimiento
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={maintenanceFilter}
                  onChange={(e) => setMaintenanceFilter(e.target.value as any)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid var(--line)',
                    fontSize: '11px',
                  }}
                >
                  <option value="all">Todos ({maintenance.length})</option>
                  <option value="blocking">Solo Bloqueantes</option>
                  <option value="pending">Pendientes</option>
                  <option value="in_progress">En Progreso</option>
                  <option value="completed">Resueltos</option>
                </select>
              </div>
            </div>

            {filteredMaintenance.length === 0 ? (
              <p className="muted" style={{ padding: '16px 0', fontSize: '13px' }}>
                Sin incidentes de mantenimiento registrados.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {filteredMaintenance.map((incident) => {
                  const room = rooms.find((r) => r.id === incident.roomId)
                  return (
                    <OperationRow
                      key={incident.id}
                      title={incident.reason}
                      detail={
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {room ? `Hab. ${room.name}` : 'General / Sin hab.'}
                          {incident.blocksResource && (
                            <>
                              {' · '}
                              <AlertTriangle size={14} style={{ color: 'var(--warning-dark)' }} />
                              <span style={{ color: 'var(--warning-dark)', fontWeight: 600 }}>BLOQUEA DISPONIBILIDAD</span>
                            </>
                          )}
                        </span>
                      }
                      status={incident.status}
                      isBlocking={incident.blocksResource}
                      onClick={() => handleIncidentNext(incident)}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal Operaciones */}
      {modal && (
        <OperationModal
          type={modal}
          establishmentId={establishmentId}
          rooms={rooms}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setSuccessMessage(
              modal === 'cleaning' ? 'Tarea de limpieza agregada.' : 'Incidente de mantenimiento registrado.'
            )
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

function OperationRow({
  title,
  detail,
  status,
  isBlocking,
  onClick,
}: {
  title: string
  detail: React.ReactNode
  status: TaskStatus
  isBlocking?: boolean
  onClick: () => void
}) {
  const statusLabel =
    status === 'in_progress' ? 'En progreso' : status === 'completed' ? 'Completado' : 'Pendiente'

  return (
    <div
      className="operation-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        borderColor: isBlocking ? '#e8d8ae' : undefined,
        background: isBlocking ? '#fffdf5' : 'var(--white)',
      }}
    >
      <span className={`task-status ${status}`}>
        <CheckCircle2 size={15} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>{title}</strong>
        <small style={{ color: 'var(--muted)', fontSize: '13px' }}>{detail}</small>
      </span>
      <em style={{ textTransform: 'capitalize', color: 'var(--muted)', fontSize: '12px', marginRight: '8px' }}>{statusLabel}</em>
      {status !== 'completed' && (
        <button
          className={status === 'in_progress' ? "primary-button" : "secondary-button"}
          type="button"
          onClick={onClick}
          style={{ padding: '6px 12px', fontSize: '12px', minHeight: 'auto', fontWeight: 600 }}
          title={status === 'pending' ? 'Iniciar tarea' : 'Marcar como completado'}
        >
          {status === 'pending' ? 'Iniciar' : 'Completar'}
        </button>
      )}
    </div>
  )
}

interface OperationModalProps {
  type: 'cleaning' | 'maintenance'
  establishmentId: string
  rooms: Room[]
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}

function OperationModal({
  type,
  establishmentId,
  rooms,
  onClose,
  onSaved,
  onError,
}: OperationModalProps) {
  const [roomId, setRoomId] = useState<string>(rooms[0]?.id ?? '')
  const [bedId, setBedId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [blocksResource, setBlocksResource] = useState<boolean>(true)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedRoom = useMemo(() => rooms.find((r) => r.id === roomId), [rooms, roomId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (type === 'cleaning') {
      const validation = cleaningTaskSchema.safeParse({
        roomId,
        bedId: bedId || null,
        status: 'pending',
        notes: notes || null,
      })

      if (!validation.success) {
        setFormError(validation.error.issues[0]?.message ?? 'Datos de limpieza inválidos.')
        return
      }

      setSubmitting(true)
      try {
        await createCleaningTask(establishmentId, {
          roomId,
          bedId: bedId || null,
          status: 'pending',
          notes: notes || null,
        })
        onSaved()
      } catch {
        onError('No se pudo guardar la tarea de limpieza.')
      } finally {
        setSubmitting(false)
      }
    } else {
      const validation = maintenanceIncidentSchema.safeParse({
        roomId: roomId || null,
        bedId: bedId || null,
        reason,
        status: 'pending',
        blocksResource,
        resolution: null,
      })

      if (!validation.success) {
        setFormError(validation.error.issues[0]?.message ?? 'Datos de mantenimiento inválidos.')
        return
      }

      setSubmitting(true)
      try {
        await createIncident(establishmentId, {
          roomId: roomId || null,
          bedId: bedId || null,
          reason,
          status: 'pending',
          blocksResource,
          resolution: null,
        })
        onSaved()
      } catch {
        onError('No se pudo guardar el incidente de mantenimiento.')
      } finally {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '440px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Registro operativo</span>
            <h2>{type === 'cleaning' ? 'Nueva tarea de limpieza' : 'Nuevo incidente de mantenimiento'}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <label>
          Habitación
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">(Sin habitación específica)</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.type === 'dorm' ? 'Dormitorio' : 'Privada'})
              </option>
            ))}
          </select>
        </label>

        {selectedRoom && selectedRoom.beds.length > 0 && (
          <label>
            Cama específica (Opcional)
            <select value={bedId} onChange={(e) => setBedId(e.target.value)}>
              <option value="">(Toda la habitación / Sin cama)</option>
              {selectedRoom.beds.map((b) => (
                <option key={b.id} value={b.id}>
                  Cama: {b.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'cleaning' ? (
          <label>
            Observaciones o notas de limpieza
            <textarea
              rows={3}
              placeholder="Ej. Desinfección profunda, Cambio completo de sábanas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              Motivo del incidente
              <input
                type="text"
                placeholder="Ej. Fuga de agua en ducha, Tomacorriente defectuoso, Pinta dañada..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>
            <label className="check-label" style={{ marginTop: '8px' }}>
              <input
                type="checkbox"
                checked={blocksResource}
                onChange={(e) => setBlocksResource(e.target.checked)}
              />
              <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Bloquea la disponibilidad de reserva
                <AlertTriangle size={14} style={{ color: 'var(--warning-dark)' }} />
              </span>
            </label>
          </>
        )}

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar registro'}
          </button>
        </div>
      </form>
    </div>
  )
}
