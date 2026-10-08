import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownAZ,
  BedDouble,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Eye,
  Filter,
  Lock,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
} from 'lucide-react'

import { useAuth } from '../../context/useAuth'
import { listStays } from '../../services/stays/staysService'
import { listRooms } from '../../services/rooms/roomsService'
import { searchGuests } from '../../services/guests/guestsService'
import { listReservations } from '../../services/reservations/reservationsService'
import { listFolios } from '../../services/folios/foliosService'
import { listCashShifts } from '../../services/cash/cashService'
import type { Stay, StayStatus } from '../../types/stays'
import type { Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation } from '../../types/reservations'
import type { CashShift } from '../../types/cash'
import { CheckInModal } from '../../components/reception/CheckInModal'
import { ExtendStayModal } from '../../components/reception/ExtendStayModal'
import { ChangeRoomModal } from '../../components/reception/ChangeRoomModal'
import { CheckoutModal } from '../../components/reception/CheckoutModal'
import { GuestStayDrawer } from '../../components/reception/GuestStayDrawer'
import { FastPOSModal } from '../../components/reception/FastPOSModal'
import { PaymentModal } from '../../components/reception/PaymentModal'
import type { Folio } from '../../types/folios'
import './StaysPage.css'


function formatDayMonthYearSplit(value?: { seconds: number } | null) {
  if (!value?.seconds) return { dayMonth: '-', year: '' }
  const d = new Date(value.seconds * 1000)
  return {
    dayMonth: d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }),
    year: d.getFullYear().toString()
  }
}


export function StaysPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [stays, setStays] = useState<Stay[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [folios, setFolios] = useState<Folio[]>([])
  const [activeCashShift, setActiveCashShift] = useState<CashShift | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | StayStatus>('active')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [selectedStayDetail, setSelectedStayDetail] = useState<Stay | null>(null)
  
  const [posData, setPosData] = useState<{ stay: Stay; folio?: Folio } | null>(null)
  const [paymentData, setPaymentData] = useState<{ stay: Stay; folio?: Folio } | null>(null)
  const [checkoutStay, setCheckoutStay] = useState<Stay | null>(null)
  const [extendStayStay, setExtendStayStay] = useState<Stay | null>(null)
  const [changeRoomStay, setChangeRoomStay] = useState<Stay | null>(null)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [nextStays, nextRooms, nextGuests, nextReservations, nextFolios, shifts] = await Promise.all([
        listStays(establishmentId),
        listRooms(establishmentId),
        searchGuests(establishmentId, ''),
        listReservations(establishmentId),
        listFolios(establishmentId),
        listCashShifts(establishmentId),
      ])
      setStays(nextStays)
      setRooms(nextRooms)
      setGuests(nextGuests)
      setReservations(nextReservations)
      setFolios(nextFolios)
      const shift = shifts.find((s) => s.status === 'open') ?? null
      setActiveCashShift(shift)
    } catch {
      setError('No se pudieron cargar las estadías. Verifica tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredStays = useMemo(() => {
    return stays.filter((stay) => {
      const matchesStatus = statusFilter === 'all' || stay.status === statusFilter
      const primaryGuest = guests.find((g) => stay.guestIds.includes(g.id))
      const room = rooms.find((r) => r.id === stay.roomId)
      const q = searchQuery.toLowerCase().trim()
      const matchesQuery =
        q === '' ||
        stay.id.toLowerCase().includes(q) ||
        (primaryGuest && `${primaryGuest.firstName} ${primaryGuest.lastName}`.toLowerCase().includes(q)) ||
        (primaryGuest && primaryGuest.documentNumber?.toLowerCase().includes(q)) ||
        (room && room.name.toLowerCase().includes(q))
      return matchesStatus && matchesQuery
    })
  }, [stays, statusFilter, searchQuery, guests, rooms])


  const activeStaysCount = stays.filter((s) => s.status === 'active').length

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <CircleAlert size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento activo para controlar estadías.</p>
      </div>
    )
  }

  return (
    <div className="stays-page-container">
      {/* Header */}
      <header className="stays-top-header-wrapper">
        <div>
          <div className="stays-breadcrumb-row">
            <span className="breadcrumb-muted">HUÉSPEDES ALOJADOS</span>
            <span className="breadcrumb-dot">•</span>
            <span className="breadcrumb-active-pill">
              <span className="dot" /> {activeStaysCount} Activas ahora
            </span>
          </div>
          <h1>Estadías</h1>
          <p>Flujo de estadía: Reserva → Check-in → <strong>Estadía activa</strong> → Check-out</p>
        </div>
        <button
          className="btn-checkin"
          type="button"
          onClick={() => setShowCheckInModal(true)}
        >
          <LogIn size={18} />
          Realizar Check-in
        </button>
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

      {/* Banner Sincronización */}
      <div className="stays-sync-banner">
        <div className="stays-sync-banner-content">
          <span className="sync-shield-icon-stays">
            <ShieldCheck size={20} />
          </span>
          <div className="stays-sync-texts">
            <strong>Validación y Procesamiento Seguro</strong>
            <span>Las transacciones de check-in y check-out son procesadas y validadas por el backend (Cloud Functions).</span>
          </div>
        </div>
        <span className="sync-atomic-badge">
          <Lock size={12} /> Transacción atómica
        </span>
      </div>

      {/* Toolbar */}
      <div className="stays-toolbar-row">
        <div className="stays-search-box">
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Buscar por huésped, doc o habitación..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="stays-filters-group">
          <div className="stays-filter-select-wrapper">
            <Filter size={14} color="#64748b" />
            <label style={{ margin: '0 4px', fontSize: 13 }}>Estado:</label>
            <select
              className="stays-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | StayStatus)}
            >
              <option value="active">Activas ({activeStaysCount})</option>
              <option value="checked_out">Finalizadas (Check-out)</option>
              <option value="all">Todas las estadías</option>
            </select>
          </div>
          <button className="btn-recents" type="button">
            <ArrowDownAZ size={14} /> Recientes
          </button>
        </div>
      </div>

      {/* Listado de Estadías */}
      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando estadías...
        </div>
      ) : stays.length === 0 ? (
        <div className="empty-state compact">
          <CalendarCheck size={32} />
          <h2>No hay estadías registradas</h2>
          <p>Realiza un check-in desde una reserva confirmada o walk-in para iniciar una estadía.</p>
        </div>
      ) : filteredStays.length === 0 ? (
        <div className="empty-state compact">
          <Search size={28} />
          <h2>Sin resultados</h2>
          <p>No se encontraron estadías con el filtro seleccionado.</p>
        </div>
      ) : (
        <div className="stays-list-container">
          {filteredStays.map((stay) => {
            const primaryGuest = guests.find((g) => stay.guestIds.includes(g.id))
            const room = rooms.find((r) => r.id === stay.roomId)
            const bedLabels = room?.beds
              .filter((b) => stay.bedIds.includes(b.id))
              .map((b) => b.label)
              .join(', ')

            const checkIn = formatDayMonthYearSplit(stay.checkInDate)
            
            // Determinar si mostrar fecha de salida prevista o real
            const outDateSource = stay.status === 'checked_out' ? stay.actualCheckOutDate : stay.expectedCheckOutDate
            const checkOut = formatDayMonthYearSplit(outDateSource)

            // Calcular noches
            const tIn = stay.checkInDate?.seconds ? stay.checkInDate.seconds * 1000 : 0
            const tOut = outDateSource?.seconds ? outDateSource.seconds * 1000 : 0
            const diffDays = tIn && tOut ? Math.max(1, Math.ceil((tOut - tIn) / (1000 * 3600 * 24))) : 1

            return (
              <article
                className={`stay-item-card ${stay.status !== 'active' ? 'is-inactive-card' : ''}`}
                key={stay.id}
              >
                {/* Izquierda: Huésped info */}
                <div className="stay-item-guest-col">
                  <div className="stay-icon-box">
                    <BedDouble size={24} />
                  </div>
                  <div className="stay-guest-info">
                    <div className="stay-guest-name-row">
                      <span className="stay-guest-name">
                        {primaryGuest ? `${primaryGuest.firstName} ${primaryGuest.lastName}` : 'Huésped sin identificar'}
                        {stay.guestIds.length > 1 && ` (+${stay.guestIds.length - 1})`}
                      </span>
                      <span
                        className={`stay-status-pill ${
                          stay.status === 'active' ? 'status-active' : 'status-inactive'
                        }`}
                      >
                        <span className="dot" /> {stay.status === 'active' ? 'Activa' : 'Finalizada'}
                      </span>
                    </div>
                    <div className="stay-guest-subinfo">
                      <span className="room-name">
                        Hab. {room?.name ?? stay.roomId}
                      </span>
                      {bedLabels && (
                        <>
                          <span className="dot-sep">•</span>
                          <span className="bed-name">Camas: {bedLabels}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Medio: Fechas y noches */}
                <div className="stay-item-dates-col">
                  <div className="date-block">
                    <small>
                      <Calendar size={13} /> CHECK-IN
                    </small>
                    <strong>
                      {checkIn.dayMonth}<br />{checkIn.year}
                    </strong>
                  </div>

                  <div className="nights-bubble">
                    <span className="nights-bubble-text">{diffDays} noches</span>
                    <ChevronRight size={14} />
                  </div>

                  <div className="date-block">
                    <small>
                      <Calendar size={13} /> {stay.status === 'checked_out' ? 'SALIDA REALIZADA' : 'SALIDA PREVISTA'}
                    </small>
                    <strong>
                      {checkOut.dayMonth}<br />{checkOut.year}
                    </strong>
                  </div>
                </div>

                {/* Derecha: Acciones */}
                <div className="stay-item-actions-col">
                  <button
                    className="btn-detalle"
                    type="button"
                    title="Ver detalle"
                    onClick={() => setSelectedStayDetail(stay)}
                  >
                    <Eye size={16} /> Detalle
                  </button>

                  {stay.status === 'active' && (
                    <>
                      <button
                        className="btn-detalle"
                        type="button"
                        style={{ color: 'var(--coral)' }}
                        title="Cambiar habitación o cama"
                        onClick={() => setChangeRoomStay(stay)}
                      >
                        <BedDouble size={16} /> Cambiar
                      </button>
                      <button
                        className="btn-detalle"
                        type="button"
                        style={{ color: 'var(--coral)' }}
                        title="Extender estadía"
                        onClick={() => setExtendStayStay(stay)}
                      >
                        <Calendar size={16} /> Extender
                      </button>
                      <button
                        className="btn-checkout"
                        type="button"
                        title="Realizar check-out"
                        onClick={() => setCheckoutStay(stay)}
                      >
                        <LogOut size={16} /> Check-out
                      </button>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="stays-page-footer">
        <div>
          Mostrando <strong>{filteredStays.length}</strong> estadía{filteredStays.length !== 1 ? 's' : ''}{' '}
          {statusFilter === 'active' ? 'activas' : ''} registrada{filteredStays.length !== 1 ? 's' : ''}
        </div>
        <div className="stays-footer-links">
          <span className="stable-badge">
            <span className="green-dot" /> Sincronizado con Cloud Functions
          </span>
        </div>
      </footer>

      {/* Modal de Check-In */}
      {showCheckInModal && (
        <CheckInModal
          establishmentId={establishmentId}
          rooms={rooms}
          guests={guests}
          reservations={reservations.filter((r) => r.status === 'confirmed')}
          activeCashShift={activeCashShift}
          onClose={() => setShowCheckInModal(false)}
          onSuccess={(msg) => {
            setShowCheckInModal(false)
            setSuccessMessage(msg)
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Drawer de Detalle de Estadía */}
      {selectedStayDetail && (
        <GuestStayDrawer
          stay={selectedStayDetail}
          guest={guests.find((g) => selectedStayDetail.guestIds.includes(g.id))}
          folio={folios.find((f) => f.stayId === selectedStayDetail.id)}
          room={rooms.find((r) => r.id === selectedStayDetail.roomId)}
          bed={rooms.find((r) => r.id === selectedStayDetail.roomId)?.beds.find((b) => selectedStayDetail.bedIds?.includes(b.id))}
          onClose={() => setSelectedStayDetail(null)}
          onAddConsumption={(stay, folio) => setPosData({ stay, folio })}
          onRecordPayment={(stay, folio) => setPaymentData({ stay, folio })}
          onCheckout={(stay) => {
            setCheckoutStay(stay)
          }}
          onExtendStay={(stay) => {
            setExtendStayStay(stay)
          }}
          onChangeRoom={(stay) => {
            setChangeRoomStay(stay)
          }}
        />
      )}

      {/* Modal de Confirmación de Check-Out (Nuevo) */}
      {checkoutStay && (
        <CheckoutModal
          establishmentId={establishmentId}
          stay={checkoutStay}
          guest={guests.find((g) => checkoutStay.guestIds.includes(g.id))}
          activeCashShift={activeCashShift}
          onClose={() => setCheckoutStay(null)}
          onExtendStay={() => {
            setCheckoutStay(null)
            setExtendStayStay(checkoutStay)
          }}
          onSuccess={(msg) => {
            setCheckoutStay(null)
            setSuccessMessage(msg)
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Extend Stay */}
      {extendStayStay && (
        <ExtendStayModal
          establishmentId={establishmentId}
          stay={extendStayStay}
          folio={folios.find((f) => f.stayId === extendStayStay.id)}
          rooms={rooms}
          activeCashShift={activeCashShift}
          onClose={() => setExtendStayStay(null)}
          onSuccess={(msg) => {
            setExtendStayStay(null)
            setSuccessMessage(msg)
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Change Room */}
      {changeRoomStay && (
        <ChangeRoomModal
          establishmentId={establishmentId}
          stay={changeRoomStay}
          rooms={rooms}
          currentRoom={rooms.find(r => r.id === changeRoomStay.roomId)}
          onClose={() => setChangeRoomStay(null)}
          onSuccess={(msg) => {
            setChangeRoomStay(null)
            setSuccessMessage(msg)
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Fast POS Modal */}
      {posData && (
        <FastPOSModal
          establishmentId={establishmentId}
          stay={posData.stay}
          folio={posData.folio}
          products={[]} // Not loaded in StaysPage normally, but enough for testing POS modal integration
          onClose={() => setPosData(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void load()
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* Payment Modal */}
      {paymentData && (
        <PaymentModal
          establishmentId={establishmentId}
          stay={paymentData.stay}
          folio={paymentData.folio}
          activeCashShift={activeCashShift}
          onClose={() => setPaymentData(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void load()
          }}
          onError={(err) => setError(err)}
        />
      )}
    </div>
  )
}



