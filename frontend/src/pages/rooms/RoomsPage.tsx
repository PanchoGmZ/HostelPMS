import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  BedDouble,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Edit3,
  Eye,
  Filter,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react'

import { useAuth } from '../../context/useAuth'
import {
  listRooms,
  saveBed,
  saveRoom,
  setBedStatus,
  setRoomStatus,
  type RoomForm,
} from '../../services/rooms/roomsService'
import { bedSchema, outOfServiceSchema, roomSchema } from '../../schemas/roomsSchema'
import type { Bed, Room, RoomType } from '../../types/rooms'

type RoomDraft = RoomForm
const blankRoom: RoomDraft = {
  name: '',
  floor: '',
  type: 'dorm',
  basePriceRoom: 0,
  status: 'active',
  amenities: [],
}

type RoomEditor = {
  id?: string
  draft: RoomDraft
  newBeds: Array<{ label: string; basePriceBed: number }>
}

export function RoomsPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | RoomType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'blocked'>('all')

  // Modals
  const [roomEditor, setRoomEditor] = useState<RoomEditor | null>(null)
  const [bedEditor, setBedEditor] = useState<{ roomId: string; bed?: Bed } | null>(null)
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null)
  const [outOfServiceTarget, setOutOfServiceTarget] = useState<{ roomId: string; bed: Bed } | null>(null)

  const reload = async () => {
    if (!establishmentId) return
    setIsLoading(true)
    setError(null)
    try {
      setRooms(await listRooms(establishmentId))
    } catch {
      setError('No se pudieron cargar las habitaciones.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!establishmentId) return
    let isCurrent = true
    void listRooms(establishmentId)
      .then((nextRooms) => {
        if (isCurrent) setRooms(nextRooms)
      })
      .catch(() => {
        if (isCurrent) setError('No se pudieron cargar las habitaciones.')
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [establishmentId])

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        q === '' ||
        room.name.toLowerCase().includes(q) ||
        room.floor?.toLowerCase().includes(q)

      const matchesType = typeFilter === 'all' || room.type === typeFilter

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'available' && room.beds.some((b) => b.isAvailable && !b.outOfServiceReason && !b.maintenanceBlocked)) ||
        (statusFilter === 'occupied' && room.beds.some((b) => b.isAvailable === false)) ||
        (statusFilter === 'blocked' && (room.maintenanceBlocked || room.beds.some((b) => b.maintenanceBlocked || b.outOfServiceReason)))

      return matchesSearch && matchesType && matchesStatus
    })
  }, [rooms, searchQuery, typeFilter, statusFilter])

  // Summary Metrics
  const totalBedsCount = useMemo(() => {
    return rooms.reduce((acc, r) => acc + (r.beds?.length ?? 0), 0)
  }, [rooms])

  const availableBedsCount = useMemo(() => {
    return rooms.reduce(
      (acc, r) =>
        acc +
        r.beds.filter((b) => b.status === 'active' && b.isAvailable && !b.outOfServiceReason && !b.maintenanceBlocked).length,
      0
    )
  }, [rooms])

  const occupiedBedsCount = useMemo(() => {
    return rooms.reduce((acc, r) => acc + r.beds.filter((b) => b.isAvailable === false).length, 0)
  }, [rooms])

  const blockedBedsCount = useMemo(() => {
    return rooms.reduce(
      (acc, r) =>
        acc + r.beds.filter((b) => b.maintenanceBlocked || b.outOfServiceReason || b.status === 'inactive').length,
      0
    )
  }, [rooms])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <CircleAlert size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Tu usuario no tiene un establecimiento asignado.</p>
      </div>
    )
  }

  const submitRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!roomEditor) return
    setError(null)

    const validation = roomSchema.safeParse(roomEditor.draft)
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Datos de habitación no válidos.')
      return
    }

    try {
      const roomId = await saveRoom(establishmentId, roomEditor.draft, roomEditor.id)
      for (const bed of roomEditor.newBeds.filter((item) => item.label.trim())) {
        await saveBed(establishmentId, roomId, {
          ...bed,
          status: 'active',
          outOfServiceReason: null,
        })
      }
      setRoomEditor(null)
      setSuccessMessage('Habitación guardada exitosamente.')
      await reload()
    } catch {
      setError('No se pudo guardar la habitación. Verifica tus permisos.')
    }
  }

  const submitBed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bedEditor) return
    setError(null)
    const form = new FormData(event.currentTarget)
    const label = String(form.get('label') ?? '')
    const basePriceBed = Number(form.get('price') ?? 0)

    const validation = bedSchema.safeParse({ label, basePriceBed })
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Datos de cama no válidos.')
      return
    }

    try {
      await saveBed(
        establishmentId,
        bedEditor.roomId,
        {
          label,
          basePriceBed,
          status: bedEditor.bed?.status ?? 'active',
          outOfServiceReason: bedEditor.bed?.outOfServiceReason ?? null,
        },
        bedEditor.bed?.id
      )
      setBedEditor(null)
      setSuccessMessage('Cama guardada exitosamente.')
      await reload()
    } catch {
      setError('No se pudo guardar la cama.')
    }
  }

  const handleBedToggleStatus = (room: Room, bed: Bed) => {
    if (bed.status === 'active' && !bed.outOfServiceReason) {
      // Prompt for out of service reason
      setOutOfServiceTarget({ roomId: room.id, bed })
    } else {
      // Restore to active
      void setBedStatus(establishmentId, room.id, bed, 'active', null).then(() => {
        setSuccessMessage(`Cama ${bed.label} restaurada a estado activo.`)
        void reload()
      })
    }
  }

  const submitOutOfService = async (reason: string) => {
    if (!outOfServiceTarget) return
    try {
      await setBedStatus(
        establishmentId,
        outOfServiceTarget.roomId,
        outOfServiceTarget.bed,
        'inactive',
        reason
      )
      setOutOfServiceTarget(null)
      setSuccessMessage(`Cama puestas fuera de servicio: ${reason}`)
      await reload()
    } catch {
      setError('No se pudo actualizar el estado de la cama.')
    }
  }

  return (
    <div className="dashboard-page rooms-page">
      <header className="page-header">
        <div>
          <span className="kicker">Inventario físico</span>
          <h1>Habitaciones y Camas</h1>
          <p>Organización visual de espacios, disponibilidad diaria y bloqueos de mantenimiento.</p>
        </div>
        <button
          className="primary-button compact-button"
          type="button"
          onClick={() =>
            setRoomEditor({
              draft: blankRoom,
              newBeds: [{ label: 'Cama 1', basePriceBed: 0 }],
            })
          }
        >
          <Plus size={18} />
          Nueva habitación
        </button>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}

      {successMessage && (
        <div className="stay-notice" style={{ background: '#eaf6ed', borderColor: '#b6e2c1', color: '#1e6631' }}>
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      <div className="stay-notice" style={{ marginBottom: '16px' }}>
        <ShieldCheck size={18} />
        <span>
          La disponibilidad y bloqueo crítico de reservas en calendario son gestionados por el backend (Firestore availability).
        </span>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div className="product-card" style={{ padding: '12px 14px' }}>
          <div className="product-top">
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Habitaciones</span>
            <BedDouble size={16} color="var(--teal)" />
          </div>
          <strong style={{ fontSize: '20px', color: 'var(--ink)' }}>{rooms.length}</strong>
        </div>

        <div className="product-card" style={{ padding: '12px 14px' }}>
          <div className="product-top">
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Camas Disponibles Hoy</span>
            <span style={{ fontSize: '11px', color: '#1b5e30', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1b5e30' }} /> Libre
            </span>
          </div>
          <strong style={{ fontSize: '20px', color: '#1b5e30' }}>
            {availableBedsCount} / {totalBedsCount}
          </strong>
        </div>

        <div className="product-card" style={{ padding: '12px 14px' }}>
          <div className="product-top">
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Camas Ocupadas Hoy</span>
            <span style={{ fontSize: '11px', color: '#b9381e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b9381e' }} /> Ocupada
            </span>
          </div>
          <strong style={{ fontSize: '20px', color: '#b9381e' }}>{occupiedBedsCount}</strong>
        </div>

        <div className="product-card" style={{ padding: '12px 14px' }}>
          <div className="product-top">
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Bloqueadas / Fuera Servicio</span>
            <span style={{ fontSize: '11px', color: '#806729', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#806729' }} /> Mantenimiento
            </span>
          </div>
          <strong style={{ fontSize: '20px', color: '#806729' }}>{blockedBedsCount}</strong>
        </div>
      </div>

      {/* Toolbar */}
      <div className="guest-toolbar" style={{ flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 250px' }}>
          <Search size={16} color="var(--muted)" />
          <input
            type="text"
            placeholder="Buscar por nombre de habitación o piso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="var(--muted)" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                background: 'var(--white)',
                fontSize: '12px',
              }}
            >
              <option value="all">Todos los tipos</option>
              <option value="dorm">Dormitorios</option>
              <option value="private">Habitaciones Privadas</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              background: 'var(--white)',
              fontSize: '12px',
            }}
          >
            <option value="all">Todos los estados</option>
            <option value="available">Con camas disponibles</option>
            <option value="occupied">Con camas ocupadas</option>
            <option value="blocked">Con bloqueos / mantenimiento</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando habitaciones...
        </div>
      ) : rooms.length === 0 ? (
        <div className="empty-state compact">
          <BedDouble size={32} />
          <h2>Aún no hay habitaciones</h2>
          <p>Agrega la primera habitación del hostel para comenzar.</p>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="empty-state compact">
          <Search size={28} />
          <h2>Sin resultados</h2>
          <p>No se encontraron habitaciones con el filtro aplicado.</p>
        </div>
      ) : (
        <div className="room-list">
          {filteredRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isExpanded={expanded === room.id}
              onToggle={() => setExpanded(expanded === room.id ? null : room.id)}
              onEdit={() =>
                setRoomEditor({
                  id: room.id,
                  draft: {
                    name: room.name,
                    floor: room.floor,
                    type: room.type,
                    basePriceRoom: room.basePriceRoom,
                    status: room.status,
                    amenities: room.amenities,
                  },
                  newBeds: [],
                })
              }
              onStatus={() =>
                void setRoomStatus(
                  establishmentId,
                  room.id,
                  room.status === 'active' ? 'inactive' : 'active'
                ).then(reload)
              }
              onAddBed={() => setBedEditor({ roomId: room.id })}
              onEditBed={(bed) => setBedEditor({ roomId: room.id, bed })}
              onViewBed={setSelectedBed}
              onBedStatus={(bed) => handleBedToggleStatus(room, bed)}
            />
          ))}
        </div>
      )}

      {/* Modales */}
      {roomEditor && (
        <RoomModal
          editor={roomEditor}
          onChange={(next) => setRoomEditor(next)}
          onClose={() => setRoomEditor(null)}
          onSubmit={submitRoom}
        />
      )}

      {bedEditor && (
        <BedModal
          editor={bedEditor}
          onClose={() => setBedEditor(null)}
          onSubmit={submitBed}
        />
      )}

      {selectedBed && (
        <BedDetail bed={selectedBed} onClose={() => setSelectedBed(null)} />
      )}

      {outOfServiceTarget && (
        <OutOfServiceModal
          bed={outOfServiceTarget.bed}
          onClose={() => setOutOfServiceTarget(null)}
          onConfirm={submitOutOfService}
        />
      )}
    </div>
  )
}

function RoomCard({
  room,
  isExpanded,
  onToggle,
  onEdit,
  onStatus,
  onAddBed,
  onEditBed,
  onViewBed,
  onBedStatus,
}: {
  room: Room
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onStatus: () => void
  onAddBed: () => void
  onEditBed: (bed: Bed) => void
  onViewBed: (bed: Bed) => void
  onBedStatus: (bed: Bed) => void
}) {
  const activeBeds = room.beds.filter(
    (bed) => bed.status === 'active' && !bed.outOfServiceReason && !bed.maintenanceBlocked
  ).length

  return (
    <article className={`room-card ${room.status === 'inactive' ? 'is-inactive' : ''}`}>
      <button className="room-heading" type="button" onClick={onToggle}>
        <div className="room-heading-top">
          <span className="room-icon">
            <BedDouble size={21} />
          </span>
          <span className="room-title">
            <strong>{room.name}</strong>
            <small>
              Piso {room.floor || '-'} · {room.type === 'dorm' ? 'Dormitorio' : 'Privada'} · {room.basePriceRoom} BOB
            </small>
          </span>
          {isExpanded ? <ChevronUp size={19} color="var(--muted)" /> : <ChevronDown size={19} color="var(--muted)" />}
        </div>
        
        <div className="room-badges">
          <span className="room-capacity" style={{ border: '1px solid var(--line)', background: 'var(--white)', padding: '2px 8px', borderRadius: '4px' }}>
            {activeBeds}/{room.beds.length} camas
          </span>
          {room.maintenanceBlocked && (
            <span className="maintenance-badge">Mantenimiento</span>
          )}
          {room.cleaningCount ? (
            <span className="maintenance-badge" style={{ background: '#eaf2f6', color: '#1e4c66' }}>
              Limpieza
            </span>
          ) : null}
        </div>
      </button>

      <div className="room-actions">
        <button type="button" title="Editar habitación" onClick={onEdit}>
          <Edit3 size={16} />
        </button>
        <button
          type="button"
          title={room.status === 'active' ? 'Desactivar habitación' : 'Activar habitación'}
          onClick={onStatus}
        >
          <Power size={16} />
        </button>
      </div>

      {isExpanded && (
        <div className="bed-panel">
          <div className="bed-panel-header">
            <span className="eyebrow">Mapa visual de camas</span>
            <button className="small-button" type="button" onClick={onAddBed}>
              <Plus size={15} /> Agregar cama
            </button>
          </div>

          {room.maintenanceCount ? (
            <p className="maintenance-note">
              <Wrench size={14} style={{ display: 'inline', marginRight: '4px' }} />
              {room.maintenanceCount} incidente{room.maintenanceCount === 1 ? '' : 's'} bloqueante{room.maintenanceCount === 1 ? '' : 's'} de mantenimiento
            </p>
          ) : null}

          {room.beds.length === 0 ? (
            <p className="muted">Sin camas registradas en esta habitación.</p>
          ) : (
            <div className="bed-grid">
              {room.beds.map((bed) => {
                const isBlocked = bed.maintenanceBlocked
                const isOutOfService = bed.status !== 'active' || Boolean(bed.outOfServiceReason)
                const isOccupied = bed.isAvailable === false && !isBlocked && !isOutOfService
                const isCleaning = bed.cleaningPending

                let statusLabel = 'Disponible hoy'
                let statusColor = '#1b5e30'
                let badgeStyle = {}

                if (isBlocked) {
                  statusLabel = 'Mantenimiento (Bloqueada)'
                  statusColor = '#806729'
                  badgeStyle = { background: '#fff8df', borderColor: '#e8d8ae' }
                } else if (isOutOfService) {
                  statusLabel = `Fuera de servicio (${bed.outOfServiceReason || 'Inactiva'})`
                  statusColor = '#b95e1e'
                  badgeStyle = { background: '#f1f1eb', borderColor: '#dce3dc' }
                } else if (isOccupied) {
                  statusLabel = 'Ocupada hoy'
                  statusColor = '#b9381e'
                  badgeStyle = { background: '#fde8e4', borderColor: '#f0b4a4' }
                } else if (isCleaning) {
                  statusLabel = 'Pendiente de limpieza'
                  statusColor = '#1e4c66'
                  badgeStyle = { background: '#eaf2f6', borderColor: '#b6cee2' }
                }

                return (
                  <div
                    className={`bed-item ${isOutOfService || isBlocked ? 'bed-disabled' : ''}`}
                    key={bed.id}
                    style={badgeStyle}
                  >
                    <span className="bed-visual">
                      <BedDouble size={20} />
                    </span>
                    <span>
                      <strong>{bed.label}</strong>
                      <small style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }} />
                        {statusLabel}
                      </small>
                    </span>
                    <button type="button" title="Ver detalle" onClick={() => onViewBed(bed)}>
                      <Eye size={14} />
                    </button>
                    <button type="button" title="Editar cama" onClick={() => onEditBed(bed)}>
                      <Edit3 size={14} />
                    </button>
                    <button type="button" title="Cambiar estado" onClick={() => onBedStatus(bed)}>
                      <Power size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function RoomModal({
  editor,
  onChange,
  onClose,
  onSubmit,
}: {
  editor: RoomEditor
  onChange: (editor: RoomEditor) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const draft = editor.draft
  return (
    <div className="modal-backdrop">
      <form className="modal-form" onSubmit={onSubmit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Configuración</span>
            <h2>{editor.id ? 'Editar habitación' : 'Nueva habitación'}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <label>
          Nombre de la habitación
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...editor, draft: { ...draft, name: event.target.value } })}
            placeholder="Ej. Dormitorio Jaguar, Habitación Andes..."
            required
            title="Ingresa el nombre de la habitación"
          />
        </label>

        <div className="form-row">
          <label>
            Piso / Nivel
            <select
              value={draft.floor}
              onChange={(event) => onChange({ ...editor, draft: { ...draft, floor: event.target.value } })}
              title="Selecciona el piso o nivel"
            >
              <option value="Planta Baja">Planta Baja</option>
              <option value="Piso 1">Piso 1</option>
              <option value="Piso 2">Piso 2</option>
              <option value="Piso 3">Piso 3</option>
              <option value="Piso 4">Piso 4</option>
              <option value="Piso 5">Piso 5</option>
            </select>
          </label>
          <label>
            Precio base habitación (BOB)
            <input
              type="number"
              min="0"
              value={draft.basePriceRoom === 0 ? '' : draft.basePriceRoom}
              placeholder="0"
              onChange={(event) =>
                onChange({ ...editor, draft: { ...draft, basePriceRoom: event.target.value === '' ? 0 : Number(event.target.value) } })
              }
              title="Precio base por noche"
            />
          </label>
        </div>

        <label>
          Tipo de habitación
          <select
            value={draft.type}
            onChange={(event) =>
              onChange({ ...editor, draft: { ...draft, type: event.target.value as RoomType } })
            }
            title="Selecciona el tipo de habitación"
          >
            <option value="dorm">Dormitorio Compartido</option>
            <option value="private">Habitación Privada</option>
          </select>
        </label>

        {!editor.id && (
          <div className="new-beds">
            <div className="bed-panel-header">
              <span className="eyebrow">Camas iniciales</span>
              <button
                className="small-button"
                type="button"
                onClick={() =>
                  onChange({
                    ...editor,
                    newBeds: [...editor.newBeds, { label: `Cama ${editor.newBeds.length + 1}`, basePriceBed: 0 }],
                  })
                }
                title="Añadir una cama"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>
            {editor.newBeds.map((bed, index) => {
              const bedTypeMatch = bed.label.match(/\((.*?)\)/);
              const currentBedType = bedTypeMatch ? bedTypeMatch[1] : 'Unipersonal';
              const baseLabel = bed.label.replace(/\s*\(.*?\)/, '') || `Cama ${index + 1}`;
              
              return (
                <div className="form-row" key={index} style={{ gridTemplateColumns: '1fr 1fr 1.5fr auto', alignItems: 'center' }}>
                  <input
                    value={baseLabel}
                    disabled
                    title="Etiqueta generada automáticamente"
                    style={{ background: 'var(--paper)', color: 'var(--muted)' }}
                  />
                  <select
                    value={currentBedType}
                    onChange={(event) => {
                      const newBeds = [...editor.newBeds]
                      newBeds[index] = { ...bed, label: `${baseLabel} (${event.target.value})` }
                      onChange({ ...editor, newBeds })
                    }}
                    title="Tipo de cama"
                  >
                    <option value="Unipersonal">Unipersonal</option>
                    <option value="Matrimonial">Matrimonial</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    placeholder="Precio base de cama (BOB)"
                    value={bed.basePriceBed === 0 ? '' : bed.basePriceBed}
                    onChange={(event) => {
                      const newBeds = [...editor.newBeds]
                      newBeds[index] = { ...bed, basePriceBed: event.target.value === '' ? 0 : Number(event.target.value) }
                      onChange({ ...editor, newBeds })
                    }}
                    title="Precio por noche para esta cama"
                  />
                  <button
                    type="button"
                    title="Eliminar cama"
                    onClick={() => {
                       const newBeds = [...editor.newBeds];
                       newBeds.splice(index, 1);
                       // Update labels to maintain sequence
                       newBeds.forEach((b, i) => {
                          const tMatch = b.label.match(/\((.*?)\)/);
                          const t = tMatch ? tMatch[1] : 'Unipersonal';
                          b.label = `Cama ${i + 1} (${t})`;
                       });
                       onChange({ ...editor, newBeds });
                    }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '8px' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" type="submit">
            Guardar habitación
          </button>
        </div>
      </form>
    </div>
  )
}

function BedModal({
  editor,
  onClose,
  onSubmit,
}: {
  editor: { roomId: string; bed?: Bed }
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="modal-backdrop">
      <form className="modal-form" onSubmit={onSubmit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Capacidad</span>
            <h2>{editor.bed ? 'Editar cama' : 'Nueva cama'}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <label>
          Etiqueta de la cama
          <input name="label" defaultValue={editor.bed?.label} placeholder="Cama A1, Litera Superior..." required />
        </label>
        <label>
          Precio por noche (BOB)
          <input name="price" type="number" min="0" defaultValue={editor.bed?.basePriceBed ?? 0} />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" type="submit">
            Guardar cama
          </button>
        </div>
      </form>
    </div>
  )
}

function BedDetail({ bed, onClose }: { bed: Bed; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-form bed-detail" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <div>
            <span className="kicker">Detalle de cama</span>
            <h2>{bed.label}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
          <p>
            <strong>Estado administrativo:</strong>{' '}
            {bed.outOfServiceReason
              ? `Fuera de Servicio (${bed.outOfServiceReason})`
              : bed.status === 'active'
              ? 'Activa'
              : 'Inactiva'}
          </p>
          <p>
            <strong>Bloqueo por Mantenimiento:</strong>{' '}
            {bed.maintenanceBlocked ? 'Sí (Incidente activo bloqueante 🟡)' : 'No'}
          </p>
          <p>
            <strong>Estado de Limpieza:</strong>{' '}
            {bed.cleaningPending ? 'Pendiente de Limpieza 🔵' : 'Limpia ✓'}
          </p>
          <p>
            <strong>Disponibilidad calendario hoy:</strong>{' '}
            {bed.isAvailable === false ? 'Ocupada 🔴' : 'Disponible 🟢'}
          </p>
          <p>
            <strong>Precio por noche:</strong> {bed.basePriceBed} BOB
          </p>
        </div>
        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button className="primary-button" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function OutOfServiceModal({
  bed,
  onClose,
  onConfirm,
}: {
  bed: Bed
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const validation = outOfServiceSchema.safeParse({ reason })
    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Debes ingresar un motivo.')
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '400px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker" style={{ color: 'var(--coral)' }}>Acción de disponibilidad</span>
            <h2>Poner fuera de servicio</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && <div className="form-error">{formError}</div>}

        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
          Indica el motivo por el cual la cama <strong>{bed.label}</strong> quedará fuera de servicio.
        </p>

        <label>
          Motivo / Causa
          <input
            type="text"
            placeholder="Ej. Colchón dañado, Fuga de agua, Pintura seca..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" style={{ background: 'var(--coral)' }} type="submit">
            Confirmar fuera de servicio
          </button>
        </div>
      </form>
    </div>
  )
}
