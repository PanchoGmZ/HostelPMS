import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BedDouble,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  DoorOpen,
  Edit3,
  Eye,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Power,
  Search,
  ShieldCheck,
  User,
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
import './RoomsPage.css'

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

  // Filters, Search & View
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | RoomType>('all')
  const [floorFilter, setFloorFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'blocked'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

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

  // Extract unique floors for dropdown
  const availableFloors = useMemo(() => {
    const floors = new Set<string>()
    rooms.forEach((r) => {
      if (r.floor && r.floor.trim()) {
        floors.add(r.floor.trim())
      }
    })
    return Array.from(floors)
  }, [rooms])

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        q === '' ||
        room.name.toLowerCase().includes(q) ||
        room.floor?.toLowerCase().includes(q)

      const matchesType = typeFilter === 'all' || room.type === typeFilter

      const matchesFloor =
        floorFilter === 'all' ||
        (room.floor && room.floor.trim().toLowerCase() === floorFilter.toLowerCase())

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'available' &&
          room.beds.some((b) => b.isAvailable && !b.outOfServiceReason && !b.maintenanceBlocked)) ||
        (statusFilter === 'occupied' && room.beds.some((b) => b.isAvailable === false)) ||
        (statusFilter === 'blocked' &&
          (room.maintenanceBlocked ||
            room.beds.some((b) => b.maintenanceBlocked || b.outOfServiceReason)))

      return matchesSearch && matchesType && matchesFloor && matchesStatus
    })
  }, [rooms, searchQuery, typeFilter, floorFilter, statusFilter])

  // Summary Metrics
  const totalBedsCount = useMemo(() => {
    return rooms.reduce((acc, r) => acc + (r.beds?.length ?? 0), 0)
  }, [rooms])

  const availableBedsCount = useMemo(() => {
    return rooms.reduce(
      (acc, r) =>
        acc +
        r.beds.filter(
          (b) => b.status === 'active' && b.isAvailable && !b.outOfServiceReason && !b.maintenanceBlocked
        ).length,
      0
    )
  }, [rooms])

  const occupiedBedsCount = useMemo(() => {
    return rooms.reduce((acc, r) => acc + r.beds.filter((b) => b.isAvailable === false).length, 0)
  }, [rooms])

  const blockedBedsCount = useMemo(() => {
    return rooms.reduce(
      (acc, r) =>
        acc +
        r.beds.filter((b) => b.maintenanceBlocked || b.outOfServiceReason || b.status === 'inactive').length,
      0
    )
  }, [rooms])

  const occupiedPercentage = totalBedsCount > 0 ? Math.round((occupiedBedsCount / totalBedsCount) * 100) : 0
  const availablePercentage = totalBedsCount > 0 ? Math.round((availableBedsCount / totalBedsCount) * 100) : 0
  const operativeBedsCount = totalBedsCount - blockedBedsCount
  const operativesPercentage = totalBedsCount > 0 ? Math.round((operativeBedsCount / totalBedsCount) * 100) : 100

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
      setSuccessMessage(`Cama puesta fuera de servicio: ${reason}`)
      await reload()
    } catch {
      setError('No se pudo actualizar el estado de la cama.')
    }
  }

  return (
    <div className="rooms-page-container">
      {/* Header con breadcrumb superior y botón Nueva habitación */}
      <header className="rooms-top-header">
        <div>
          <div className="rooms-breadcrumb-row">
            <span className="breadcrumb-tag">● INVENTARIO FÍSICO</span>
            <span className="breadcrumb-sub">/ Capacidad Total</span>
          </div>
          <h1>Habitaciones y Camas</h1>
          <p>
            Organización visual de espacios, disponibilidad diaria en tiempo real y gestión de bloqueos por mantenimiento.
          </p>
        </div>

        <button
          className="btn-new-room"
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
        <div className="stay-notice" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      {/* Banner de Sincronización */}
      <div className="rooms-sync-banner">
        <div className="rooms-sync-banner-content">
          <span className="sync-shield-icon">
            <ShieldCheck size={18} />
          </span>
          <span>
            <strong>Sincronización de disponibilidad activa:</strong> La disponibilidad y bloqueo crítico de reservas en calendario son gestionados por el backend (Firestore availability).
          </span>
        </div>
        <span className="sync-connected-badge">
          <span className="dot" /> Conectado
        </span>
      </div>

      {/* Fila de Métricas / KPI Cards */}
      <div className="rooms-metrics-grid">
        {/* Tarjeta 1: HABITACIONES */}
        <div className="rooms-metric-card">
          <div className="rooms-metric-card-top">
            <span className="rooms-metric-title">HABITACIONES</span>
            <span className="metric-icon-circle">
              <DoorOpen size={16} />
            </span>
          </div>
          <div className="rooms-metric-card-value">
            <span className="metric-big-num">{rooms.length}</span>
            <span className="metric-unit">unidades activas</span>
          </div>
          <div className="rooms-metric-bar-track">
            <div className="rooms-metric-bar-fill" style={{ width: '40%', background: '#0f172a' }} />
          </div>
        </div>

        {/* Tarjeta 2: CAMAS LIBRES HOY */}
        <div className="rooms-metric-card">
          <div className="rooms-metric-card-top">
            <span className="rooms-metric-title">CAMAS LIBRES HOY</span>
            <span className="metric-pill-badge pill-free">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              Libre
            </span>
          </div>
          <div className="rooms-metric-card-value">
            <span className="metric-big-num text-green">{availableBedsCount}</span>
            <span className="metric-unit">/ {totalBedsCount} camas</span>
          </div>
          <div className="rooms-metric-bar-track">
            <div
              className="rooms-metric-bar-fill"
              style={{ width: `${availablePercentage}%`, background: '#10b981' }}
            />
          </div>
        </div>

        {/* Tarjeta 3: CAMAS OCUPADAS */}
        <div className="rooms-metric-card">
          <div className="rooms-metric-card-top">
            <span className="rooms-metric-title">CAMAS OCUPADAS</span>
            <span className="metric-pill-badge pill-occupied">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ea580c' }} />
              Ocupada
            </span>
          </div>
          <div className="rooms-metric-card-value">
            <span className="metric-big-num">{occupiedBedsCount}</span>
            <span className="metric-unit">hospedados ({occupiedPercentage}%)</span>
          </div>
          <div className="rooms-metric-bar-track">
            <div
              className="rooms-metric-bar-fill"
              style={{ width: `${occupiedPercentage}%`, background: '#ea580c' }}
            />
          </div>
        </div>

        {/* Tarjeta 4: FUERA DE SERVICIO */}
        <div className="rooms-metric-card">
          <div className="rooms-metric-card-top">
            <span className="rooms-metric-title">FUERA DE SERVICIO</span>
            <span className="metric-pill-badge pill-maintenance">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#64748b' }} />
              Mantenimiento
            </span>
          </div>
          <div className="rooms-metric-card-value">
            <span className="metric-big-num">{blockedBedsCount}</span>
            <span className="metric-unit">{operativesPercentage}% operativas</span>
          </div>
          <div className="rooms-metric-bar-track">
            <div
              className="rooms-metric-bar-fill"
              style={{
                width: `${totalBedsCount > 0 ? (blockedBedsCount / totalBedsCount) * 100 : 0}%`,
                background: '#94a3b8',
              }}
            />
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="rooms-toolbar-row">
        <div className="rooms-search-box">
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Buscar por nombre de habitación o piso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="rooms-filters-group">
          {/* Tipo de Habitación */}
          <div className="rooms-filter-select-wrapper">
            <Filter size={14} color="#64748b" />
            <select
              className="rooms-filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
            >
              <option value="all">Todos los tipos</option>
              <option value="dorm">Dormitorios</option>
              <option value="private">Habitaciones Privadas</option>
            </select>
          </div>

          {/* Pisos */}
          <div className="rooms-filter-select-wrapper">
            <select
              className="rooms-filter-select"
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
            >
              <option value="all">Todos los pisos</option>
              {availableFloors.map((floor) => (
                <option key={floor} value={floor}>
                  {floor}
                </option>
              ))}
            </select>
          </div>

          {/* Estados */}
          <div className="rooms-filter-select-wrapper">
            <select
              className="rooms-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">Todos los estados</option>
              <option value="available">Con camas disponibles</option>
              <option value="occupied">Con camas ocupadas</option>
              <option value="blocked">Con bloqueos / mantenimiento</option>
            </select>
          </div>

          {/* Selector de Vista: Grid vs List */}
          <div className="rooms-view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Vista de cuadrícula"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Vista de lista"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Lista / Grid de Habitaciones */}
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
        <div className={`rooms-cards-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
          {filteredRooms.map((room) => (
            <RoomCardItem
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

          {/* Tarjeta Dashed: Crear nueva habitación */}
          <div
            className="room-create-card-placeholder"
            onClick={() =>
              setRoomEditor({
                draft: blankRoom,
                newBeds: [{ label: 'Cama 1', basePriceBed: 0 }],
              })
            }
          >
            <div className="create-card-icon-circle">
              <Plus size={22} />
            </div>
            <h3>Crear nueva habitación</h3>
            <p>Configura nuevas camas, literas, tipos de habitación y políticas de precios.</p>
            <span className="create-card-action-link">
              Comenzar configuración <ChevronRight size={14} />
            </span>
          </div>
        </div>
      )}

      {/* Footer de la página */}
      <footer className="rooms-page-footer">
        <div>© 2025 HostelOps Cloud PMS — Sincronización en tiempo real habilitada.</div>
        <div className="rooms-footer-links">
          <span>Soporte técnico</span>
          <span>•</span>
          <span>Documentación API</span>
          <span>•</span>
          <span className="stable-badge">
            <span className="green-dot" /> v2.4.0 Estable
          </span>
        </div>
      </footer>

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

function RoomCardItem({
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const totalBeds = room.beds.length
  const availableBeds = room.beds.filter(
    (bed) => bed.status === 'active' && bed.isAvailable && !bed.outOfServiceReason && !bed.maintenanceBlocked
  ).length
  const occupiedBeds = room.beds.filter((bed) => bed.isAvailable === false).length
  const blockedBeds = room.beds.filter(
    (bed) => bed.maintenanceBlocked || bed.outOfServiceReason || bed.status === 'inactive'
  ).length

  // Status badge calculation
  let statusBadgeText = 'Disponible'
  let statusBadgeClass = 'badge-available'
  if (room.status === 'inactive') {
    statusBadgeText = 'Inactiva'
    statusBadgeClass = 'badge-inactive'
  } else if (room.maintenanceBlocked || blockedBeds === totalBeds && totalBeds > 0) {
    statusBadgeText = 'Mantenimiento'
    statusBadgeClass = 'badge-maintenance'
  } else if (totalBeds > 0 && occupiedBeds === totalBeds) {
    statusBadgeText = 'Ocupada'
    statusBadgeClass = 'badge-occupied'
  } else if (occupiedBeds > 0) {
    statusBadgeText = 'Ocup. Parcial'
    statusBadgeClass = 'badge-partial'
  }

  // Tariff calculation
  const tariffLabel =
    room.type === 'dorm' ? 'TARIFA CAMA' : room.basePriceRoom > 0 ? 'TARIFA BASE' : 'TARIFA'
  const firstBedPrice = room.beds.find((b) => b.basePriceBed > 0)?.basePriceBed
  const displayedPrice =
    room.type === 'dorm' && firstBedPrice != null
      ? firstBedPrice
      : room.basePriceRoom
  const tariffUnit =
    displayedPrice > 0
      ? room.type === 'dorm'
        ? 'BOB / cama'
        : 'BOB / noche'
      : 'BOB'

  // Availability text and progress
  let availLeftText = `${availableBeds} de ${totalBeds} camas libres`
  let availRightText = '100% libre'
  let progressFillClass = 'fill-green'
  let progressWidth = totalBeds > 0 ? (availableBeds / totalBeds) * 100 : 0

  if (room.maintenanceBlocked) {
    availLeftText = 'Mantenimiento bloqueante'
    availRightText = 'Bloqueada'
    progressFillClass = 'fill-red'
    progressWidth = 100
  } else if (totalBeds === 0) {
    availLeftText = 'Sin camas configuradas'
    availRightText = '-'
    progressWidth = 0
  } else if (occupiedBeds === totalBeds) {
    availLeftText = `0 de ${totalBeds} cama libre (Ocupada)`
    availRightText = '100% ocupada'
    progressFillClass = 'fill-orange'
    progressWidth = 100
  } else if (occupiedBeds > 0) {
    availLeftText = `${availableBeds} de ${totalBeds} camas libres`
    availRightText = `${occupiedBeds} ocupada${occupiedBeds > 1 ? 's' : ''}`
    progressFillClass = 'fill-orange'
    progressWidth = totalBeds > 0 ? ((totalBeds - occupiedBeds) / totalBeds) * 100 : 0
  }

  // Tags generation
  const tags: string[] = []
  if (totalBeds === 1) {
    tags.push(room.beds[0]?.label || '1 Cama')
  } else if (totalBeds > 1) {
    tags.push(`${totalBeds} Camas`)
  }
  if (room.amenities && room.amenities.length > 0) {
    tags.push(...room.amenities)
  }
  if (room.name.toLowerCase().includes('demo') && !tags.some((t) => t.toLowerCase().includes('demo'))) {
    tags.push('Demo Mode')
  }
  if (room.name.toLowerCase().includes('prueba') && !tags.some((t) => t.toLowerCase().includes('prueba'))) {
    tags.push('En pruebas')
  }

  const floorText = room.floor && room.floor.trim() ? room.floor : 'Sin piso asignado'
  const typeText = room.type === 'dorm' ? 'Dormitorio' : 'Privada'

  return (
    <article className={`room-item-card ${room.status === 'inactive' ? 'is-inactive-card' : ''}`}>
      {/* Header */}
      <div className="room-card-header-row">
        <div className="room-card-icon-box">
          <BedDouble size={20} />
        </div>

        <div className="room-card-title-col">
          <div className="room-card-name-line">
            <span className="room-card-name">{room.name}</span>
            <span className={`room-status-badge ${statusBadgeClass}`}>{statusBadgeText}</span>
          </div>
          <div className="room-card-subtitle">
            <DoorOpen size={13} style={{ color: '#94a3b8' }} />
            <span>
              {floorText} • {typeText}
            </span>
          </div>
        </div>

        {/* 3-dots Menu */}
        <div className="room-menu-wrapper" ref={menuRef}>
          <button
            type="button"
            className="room-card-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            title="Opciones de habitación"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="room-menu-dropdown">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit()
                }}
              >
                <Edit3 size={14} /> Editar habitación
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onAddBed()
                }}
              >
                <Plus size={14} /> Agregar cama
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onStatus()
                }}
              >
                <Power size={14} />{' '}
                {room.status === 'active' ? 'Desactivar habitación' : 'Activar habitación'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fila de Tarifa */}
      <div className="room-tariff-row">
        <span className="room-tariff-label">{tariffLabel}</span>
        <div className="room-tariff-value">
          <span className="tariff-amount">{displayedPrice}</span>
          <span className="tariff-unit">{tariffUnit}</span>
        </div>
      </div>

      {/* Barra de Ocupación / Disponibilidad */}
      <div className="room-avail-block">
        <div
          className={`room-avail-header ${
            occupiedBeds > 0 ? 'avail-orange' : 'avail-green'
          }`}
        >
          <span className="left-info">
            <User size={13} />
            {availLeftText}
          </span>
          <span className="right-info">{availRightText}</span>
        </div>
        <div className="room-progress-track">
          <div
            className={`room-progress-fill ${progressFillClass}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {/* Badges / Tags de Características */}
      <div className="room-tags-row">
        {tags.map((tag, idx) => (
          <span key={idx} className="room-tag-pill">
            {tag}
          </span>
        ))}
      </div>

      {/* Footer de la tarjeta */}
      <div className="room-card-footer">
        <div className="room-card-quick-actions">
          <button type="button" title="Editar habitación" onClick={onEdit}>
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            title={room.status === 'active' ? 'Desactivar habitación' : 'Activar habitación'}
            onClick={onStatus}
          >
            <Power size={15} />
          </button>
        </div>

        <button
          className="btn-manage-beds"
          type="button"
          onClick={onToggle}
        >
          {occupiedBeds === totalBeds && totalBeds > 0 ? 'Ver Huésped' : 'Gestionar Camas'}
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Panel Expandido de Gestión de Camas */}
      {isExpanded && (
        <div className="room-beds-expanded-section">
          <div className="beds-expanded-header">
            <strong>Mapa de camas ({room.beds.length})</strong>
            <button className="btn-add-bed-compact" type="button" onClick={onAddBed}>
              <Plus size={13} /> Agregar cama
            </button>
          </div>

          {room.maintenanceCount ? (
            <p className="maintenance-note" style={{ margin: '0 0 10px', color: '#b91c1c', fontSize: 11 }}>
              <Wrench size={13} style={{ display: 'inline', marginRight: 4 }} />
              {room.maintenanceCount} incidente{room.maintenanceCount === 1 ? '' : 's'} bloqueante{room.maintenanceCount === 1 ? '' : 's'}
            </p>
          ) : null}

          {room.beds.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              Sin camas registradas en esta habitación.
            </p>
          ) : (
            <div className="expanded-beds-grid">
              {room.beds.map((bed) => {
                const isBlocked = bed.maintenanceBlocked
                const isOutOfService = bed.status !== 'active' || Boolean(bed.outOfServiceReason)
                const isOccupied = bed.isAvailable === false && !isBlocked && !isOutOfService

                let statusDotColor = '#10b981'
                let statusText = 'Libre'
                if (isBlocked) {
                  statusDotColor = '#ca8a04'
                  statusText = 'Bloqueada'
                } else if (isOutOfService) {
                  statusDotColor = '#ea580c'
                  statusText = 'Fuera serv.'
                } else if (isOccupied) {
                  statusDotColor = '#ef4444'
                  statusText = 'Ocupada'
                }

                return (
                  <div key={bed.id} className="expanded-bed-tile">
                    <div className="expanded-bed-tile-info">
                      <BedDouble size={16} color="#0d9488" />
                      <div>
                        <div className="bed-label">{bed.label}</div>
                        <div className="bed-status-text">
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: statusDotColor,
                              display: 'inline-block',
                            }}
                          />
                          {statusText}
                        </div>
                      </div>
                    </div>

                    <div className="expanded-bed-tile-actions">
                      <button
                        type="button"
                        title="Ver detalle"
                        onClick={() => onViewBed(bed)}
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        type="button"
                        title="Editar cama"
                        onClick={() => onEditBed(bed)}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        title={
                          bed.status === 'active' && !bed.outOfServiceReason
                            ? 'Poner fuera de servicio'
                            : 'Reactivar cama'
                        }
                        onClick={() => onBedStatus(bed)}
                      >
                        <Power size={13} />
                      </button>
                    </div>
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
            placeholder="Ej. Dormitorio Jaguar, Habitación Bella..."
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
                onChange({
                  ...editor,
                  draft: {
                    ...draft,
                    basePriceRoom: event.target.value === '' ? 0 : Number(event.target.value),
                  },
                })
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
                    newBeds: [
                      ...editor.newBeds,
                      { label: `Cama ${editor.newBeds.length + 1}`, basePriceBed: 0 },
                    ],
                  })
                }
                title="Añadir una cama"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>
            {editor.newBeds.map((bed, index) => {
              const bedTypeMatch = bed.label.match(/\((.*?)\)/)
              const currentBedType = bedTypeMatch ? bedTypeMatch[1] : 'Unipersonal'
              const baseLabel = bed.label.replace(/\s*\(.*?\)/, '') || `Cama ${index + 1}`

              return (
                <div
                  className="form-row"
                  key={index}
                  style={{ gridTemplateColumns: '1fr 1fr 1.5fr auto', alignItems: 'center' }}
                >
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
                    placeholder="Precio base cama (BOB)"
                    value={bed.basePriceBed === 0 ? '' : bed.basePriceBed}
                    onChange={(event) => {
                      const newBeds = [...editor.newBeds]
                      newBeds[index] = {
                        ...bed,
                        basePriceBed: event.target.value === '' ? 0 : Number(event.target.value),
                      }
                      onChange({ ...editor, newBeds })
                    }}
                    title="Precio por noche para esta cama"
                  />
                  <button
                    type="button"
                    title="Eliminar cama"
                    onClick={() => {
                      const newBeds = [...editor.newBeds]
                      newBeds.splice(index, 1)
                      newBeds.forEach((b, i) => {
                        const tMatch = b.label.match(/\((.*?)\)/)
                        const t = tMatch ? tMatch[1] : 'Unipersonal'
                        b.label = `Cama ${i + 1} (${t})`
                      })
                      onChange({ ...editor, newBeds })
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      padding: '8px',
                    }}
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
          <button className="primary-button" style={{ background: '#f97316' }} type="submit">
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
          <input name="label" defaultValue={editor.bed?.label} placeholder="Cama A1, Cama Doble..." required />
        </label>
        <label>
          Precio por noche (BOB)
          <input name="price" type="number" min="0" defaultValue={editor.bed?.basePriceBed ?? 0} />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" style={{ background: '#f97316' }} type="submit">
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
          <button className="primary-button" style={{ background: '#f97316' }} type="button" onClick={onClose}>
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
          <button className="primary-button" style={{ background: '#ef4444' }} type="submit">
            Confirmar fuera de servicio
          </button>
        </div>
      </form>
    </div>
  )
}
