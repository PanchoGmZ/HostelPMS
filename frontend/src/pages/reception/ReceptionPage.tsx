import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { getDocumentById } from '../../services/firebase/firestoreService'
import { listRooms } from '../../services/rooms/roomsService'
import { listStays } from '../../services/stays/staysService'
import { listReservations } from '../../services/reservations/reservationsService'
import { listFolios } from '../../services/folios/foliosService'
import { searchGuests } from '../../services/guests/guestsService'
import { listCashShifts } from '../../services/cash/cashService'
import { listOperations, updateCleaningStatus } from '../../services/operations/operationsService'
import { listInventory } from '../../services/inventory/inventoryService'

import type { Room, Bed } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Reservation } from '../../types/reservations'
import type { Folio } from '../../types/folios'
import type { Guest } from '../../types/guests'
import type { CashShift } from '../../types/cash'
import type { CleaningTask, MaintenanceIncident } from '../../types/operations'
import type { Product } from '../../types/inventory'

import { ReceptionHeader } from '../../components/reception/ReceptionHeader'
import { KanbanBoard } from '../../components/reception/KanbanBoard'
import { BedMatrix } from '../../components/reception/BedMatrix'
import { GuestStayDrawer } from '../../components/reception/GuestStayDrawer'
import { QuickActionModal } from '../../components/reception/QuickActionModal'
import { WalkInModal } from '../../components/reception/WalkInModal'
import { NewReservationModal } from '../../components/reception/NewReservationModal'
import { BedMaintenanceModal } from '../../components/reception/BedMaintenanceModal'
import { FastPOSModal } from '../../components/reception/FastPOSModal'
import { PaymentModal } from '../../components/reception/PaymentModal'
import { CheckoutModal } from '../../components/reception/CheckoutModal'
import { GuestSearchModal } from '../../components/reception/GuestSearchModal'
import { SummaryCards } from '../../components/reception/SummaryCards'
import { NewEntryInterceptorModal } from '../../components/reception/NewEntryInterceptorModal'

import './ReceptionPage.css'

interface EstablishmentInfo {
  name?: string
  currency?: string
}

function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function dateFromSeconds(seconds: number): string {
  const d = new Date(seconds * 1000)
  return toLocalDateString(d)
}

export function ReceptionPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [establishment, setEstablishment] = useState<EstablishmentInfo | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [stays, setStays] = useState<Stay[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [folios, setFolios] = useState<Folio[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [cashShifts, setCashShifts] = useState<CashShift[]>([])
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([])
  const [incidents, setIncidents] = useState<MaintenanceIncident[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Drawer / Modals State
  const [drawerStay, setDrawerStay] = useState<Stay | null>(null)
  const [quickActionBed, setQuickActionBed] = useState<{ bed: Bed; room: Room } | null>(null)
  const [walkInBed, setWalkInBed] = useState<{ bed: Bed; room: Room } | null>(null)
  const [reservationModalData, setReservationModalData] = useState<{ bed?: Bed; room?: Room } | null>(null)
  const [maintenanceBed, setMaintenanceBed] = useState<{ bed: Bed; room: Room } | null>(null)
  const [posData, setPosData] = useState<{ stay: Stay; folio?: Folio } | null>(null)
  const [paymentData, setPaymentData] = useState<{ stay: Stay; folio?: Folio } | null>(null)
  const [checkoutData, setCheckoutData] = useState<{ stay: Stay; guest?: Guest; folio?: Folio } | null>(null)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [interceptorOpen, setInterceptorOpen] = useState(false)

  // Load all operational data in parallel
  const loadData = useCallback(async (isSilent = false) => {
    if (!establishmentId) return
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const [
        estDoc,
        roomsData,
        staysData,
        resData,
        foliosData,
        guestsData,
        shiftsData,
        opsData,
        invData,
      ] = await Promise.all([
        getDocumentById<EstablishmentInfo>('establishments', establishmentId),
        listRooms(establishmentId),
        listStays(establishmentId),
        listReservations(establishmentId),
        listFolios(establishmentId),
        searchGuests(establishmentId, ''),
        listCashShifts(establishmentId),
        listOperations(establishmentId),
        listInventory(establishmentId),
      ])

      setEstablishment(estDoc)
      setRooms(roomsData)
      setStays(staysData)
      setReservations(resData)
      setFolios(foliosData)
      setGuests(guestsData)
      setCashShifts(shiftsData)
      setCleaningTasks(opsData.cleaning)
      setIncidents(opsData.maintenance)
      setProducts(invData.products)

      // If drawer is open, refresh the active stay reference
      if (drawerStay) {
        const updated = staysData.find((s) => s.id === drawerStay.id)
        if (updated) setDrawerStay(updated)
      }
    } catch {
      setError('No se pudieron actualizar los datos de recepción.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [establishmentId, drawerStay])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  // Computed data
  const todayStr = toLocalDateString(new Date())

  const totalBeds = useMemo(() => {
    return rooms.reduce((acc, room) => acc + (room.status === 'active' ? room.beds.filter(b => b.status === 'active').length : 0), 0)
  }, [rooms])

  const occupiedBeds = useMemo(() => {
    return stays.filter(s => s.status === 'active').reduce((acc, stay) => acc + (stay.bedIds?.length || 1), 0)
  }, [stays])

  // Active open cash shift
  const activeCashShift = useMemo(() => {
    return cashShifts.find((s) => s.status === 'open') ?? null
  }, [cashShifts])

  // Pending cleaning tasks
  const pendingCleaning = useMemo(() => {
    return cleaningTasks.filter((t) => t.status !== 'completed')
  }, [cleaningTasks])

  // Active incidents
  const activeIncidents = useMemo(() => {
    return incidents.filter((i) => i.status !== 'completed')
  }, [incidents])

  // Today's arrivals (Confirmed reservations starting today)
  const todayArrivals = useMemo(() => {
    return reservations.filter((r) => {
      if (r.status !== 'confirmed') return false
      if (!r.checkInDate) return false
      const dateStr = dateFromSeconds(r.checkInDate.seconds)
      return dateStr === todayStr
    })
  }, [reservations, todayStr])

  // Today's departures (Active stays expected to check out today)
  const todayDepartures = useMemo(() => {
    return stays.filter((s) => {
      if (s.status !== 'active') return false
      if (!s.expectedCheckOutDate) return false
      const dateStr = dateFromSeconds(s.expectedCheckOutDate.seconds)
      return dateStr === todayStr
    })
  }, [stays, todayStr])

  // Handle clicking on any bed in the grid
  const handleBedClick = (
    bed: Bed,
    room: Room,
    stay?: Stay
  ) => {
    if (stay && stay.status === 'active') {
      // Occupied bed -> Open GuestStayDrawer directly!
      setDrawerStay(stay)
    } else {
      // Available, dirty, or maintenance -> Open QuickActionModal
      setQuickActionBed({ bed, room })
    }
  }

  // Mark a dirty bed clean directly
  const handleMarkClean = async (bed: Bed, room: Room) => {
    if (!establishmentId) return
    const bedName = bed.label || `Cama ${bed.id.slice(-3)}`
    const task = cleaningTasks.find(
      (t) => (t.bedId === bed.id || t.roomId === room.id) && t.status !== 'completed'
    )
    if (task) {
      try {
        await updateCleaningStatus(establishmentId, task.id, 'completed')
        setSuccessMessage(`${bedName} marcada como limpia y disponible.`)
        setQuickActionBed(null)
        void loadData(true)
      } catch {
        setError('No se pudo actualizar el estado de limpieza.')
      }
    } else {
      setQuickActionBed(null)
      void loadData(true)
    }
  }

  // Drawer matching data
  const drawerGuest = useMemo(() => {
    if (!drawerStay) return undefined
    return guests.find((g) => drawerStay.guestIds?.includes(g.id))
  }, [drawerStay, guests])

  const drawerFolio = useMemo(() => {
    if (!drawerStay) return undefined
    return folios.find((f) => f.stayId === drawerStay.id)
  }, [drawerStay, folios])

  const drawerRoom = useMemo(() => {
    if (!drawerStay) return undefined
    return rooms.find((r) => r.id === drawerStay.roomId)
  }, [drawerStay, rooms])

  const drawerBed = useMemo(() => {
    if (!drawerStay || !drawerRoom) return undefined
    return drawerRoom.beds.find((b) => drawerStay.bedIds?.includes(b.id))
  }, [drawerStay, drawerRoom])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <CircleAlert size={36} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión con una cuenta autorizada para operar la recepción.</p>
      </div>
    )
  }

  return (
    <div className="reception-page">
      {/* Header with status badges and quick action buttons */}
      <ReceptionHeader
        establishmentName={establishment?.name ?? 'Hostel Principal'}
        userName={session?.user.displayName ?? 'Recepcionista'}
        userRole={session?.roles[establishmentId] ?? 'reception'}
        activeCashShift={activeCashShift}
        pendingCleaningCount={pendingCleaning.length}
        activeIncidentCount={activeIncidents.length}
        onNewReservation={() => setReservationModalData({})}
        onNewEntry={() => setInterceptorOpen(true)}
        onSearchGuest={() => setSearchModalOpen(true)}
        onRefresh={() => void loadData(true)}
        isRefreshing={refreshing}
      />

      {/* Global error or success notification */}
      {error && (
        <div className="form-error" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success" role="status">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Summary KPIs */}
      <SummaryCards
        totalBeds={totalBeds}
        occupiedBeds={occupiedBeds}
        arrivalsToday={todayArrivals.length}
        departuresToday={todayDepartures.length}
        cleaningPending={pendingCleaning.length}
        maintenanceActive={activeIncidents.length}
      />

      <div className="reception-dashboard-layout">
        <div className="reception-sidebar-panel kanban-container">
          <KanbanBoard
            todayArrivals={todayArrivals}
            todayDepartures={todayDepartures}
            cleaningPending={pendingCleaning}
            maintenanceActive={activeIncidents}
            guests={guests}
            rooms={rooms}
            folios={folios}
            onCheckInReservation={(res) => {
              const resRoom = rooms.find((r) => r.id === res.roomId)
              const resBed = resRoom?.beds.find((b) => res.bedIds?.includes(b.id))
              if (resRoom && resBed) {
                setWalkInBed({ bed: resBed, room: resRoom })
              } else {
                setReservationModalData({})
              }
            }}
            onOpenStayDetail={(stay) => setDrawerStay(stay)}
            onQuickCheckout={(stay) => {
              const g = guests.find((item) => stay.guestIds?.includes(item.id))
              const f = folios.find((item) => item.stayId === stay.id)
              setCheckoutData({ stay, guest: g, folio: f })
            }}
            onOpenQuickAction={(roomId, bedId) => {
               const room = rooms.find(r => r.id === roomId);
               if (!room) return;
               const bed = room.beds.find(b => b.id === bedId);
               if (bed) {
                  setQuickActionBed({ room, bed });
               }
            }}
          />
        </div>

        <div className="reception-main-panel">
          {/* Bed Matrix / Room Grid */}
          {loading ? (
            <div className="screen-state inline-state">
              <span className="loader" />
              Cargando plano de habitaciones y camas...
            </div>
          ) : (
            <BedMatrix
              rooms={rooms}
              stays={stays}
              guests={guests}
              folios={folios}
              todayReservations={todayArrivals}
              onBedClick={handleBedClick}
            />
          )}
        </div>
      </div>

      {/* 1. Guest Stay Drawer (Cama Ocupada) */}
      {drawerStay && (
        <GuestStayDrawer
          stay={drawerStay}
          guest={drawerGuest}
          folio={drawerFolio}
          room={drawerRoom}
          bed={drawerBed}
          onClose={() => setDrawerStay(null)}
          onAddConsumption={(stay, folio) => setPosData({ stay, folio })}
          onRecordPayment={(stay, folio) => setPaymentData({ stay, folio })}
          onCheckout={(stay, folio) => setCheckoutData({ stay, guest: drawerGuest, folio })}
        />
      )}

      {/* 2. Quick Action Modal (Cama Libre / Sucia / Mantenimiento) */}
      {quickActionBed && (
        <QuickActionModal
          bed={quickActionBed.bed}
          room={quickActionBed.room}
          onClose={() => setQuickActionBed(null)}
          onSelectWalkIn={(b, r) => {
            setQuickActionBed(null)
            setWalkInBed({ bed: b, room: r })
          }}
          onSelectReservation={(b, r) => {
            setQuickActionBed(null)
            setReservationModalData({ bed: b, room: r })
          }}
          onSelectMaintenance={(b, r) => {
            setQuickActionBed(null)
            setMaintenanceBed({ bed: b, room: r })
          }}
          onMarkClean={(b, r) => void handleMarkClean(b, r)}
        />
      )}

      {/* 3. WalkIn Modal */}
      {walkInBed && (
        <WalkInModal
          establishmentId={establishmentId}
          bed={walkInBed.bed}
          room={walkInBed.room}
          existingGuests={guests}
          onClose={() => setWalkInBed(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void loadData(true)
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* 4. New Reservation Modal */}
      {reservationModalData && (
        <NewReservationModal
          establishmentId={establishmentId}
          initialBed={reservationModalData.bed}
          initialRoom={reservationModalData.room}
          rooms={rooms}
          guests={guests}
          onClose={() => setReservationModalData(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void loadData(true)
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* 5. Fast POS Modal */}
      {posData && (
        <FastPOSModal
          establishmentId={establishmentId}
          stay={posData.stay}
          folio={posData.folio}
          products={products}
          onClose={() => setPosData(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void loadData(true)
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* 6. Payment Modal */}
      {paymentData && (
        <PaymentModal
          establishmentId={establishmentId}
          stay={paymentData.stay}
          folio={paymentData.folio}
          activeCashShift={activeCashShift}
          onClose={() => setPaymentData(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void loadData(true)
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* 7. Checkout Modal */}
      {checkoutData && (
        <CheckoutModal
          establishmentId={establishmentId}
          stay={checkoutData.stay}
          guest={checkoutData.guest}
          folio={checkoutData.folio}
          onClose={() => setCheckoutData(null)}
          onOpenPayment={() => {
            setPaymentData({ stay: checkoutData.stay, folio: checkoutData.folio })
          }}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            setDrawerStay(null)
            void loadData(true)
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* 8. Maintenance Modal */}
      {maintenanceBed && (
        <BedMaintenanceModal
          establishmentId={establishmentId}
          bed={maintenanceBed.bed}
          room={maintenanceBed.room}
          onClose={() => setMaintenanceBed(null)}
          onSuccess={(msg) => {
            setSuccessMessage(msg)
            void loadData(true)
          }}
          onError={(err) => setError(err)}
        />
      )}

      {/* 9. Guest Search Modal */}
      {searchModalOpen && (
        <GuestSearchModal
          guests={guests}
          stays={stays}
          reservations={reservations}
          rooms={rooms}
          onClose={() => setSearchModalOpen(false)}
          onSelectStay={(stay) => setDrawerStay(stay)}
          onSelectReservation={(res) => {
            const r = rooms.find((item) => item.id === res.roomId)
            const b = r?.beds.find((item) => res.bedIds?.includes(item.id))
            if (r && b) {
              setWalkInBed({ bed: b, room: r })
            }
          }}
        />
      )}

      {/* 10. Interceptor Nuevo Ingreso */}
      {interceptorOpen && (
        <NewEntryInterceptorModal
          onClose={() => setInterceptorOpen(false)}
          onHasReservation={() => {
            setInterceptorOpen(false)
            setSearchModalOpen(true)
          }}
          onWalkIn={() => {
            setInterceptorOpen(false)
            const firstAvailableRoom = rooms.find((r) => r.beds.some((b) => b.isAvailable))
            const firstBed = firstAvailableRoom?.beds.find((b) => b.isAvailable)
            if (firstAvailableRoom && firstBed) {
              setWalkInBed({ bed: firstBed, room: firstAvailableRoom })
            } else {
              setError('No hay camas disponibles actualmente para un walk-in.')
            }
          }}
        />
      )}
    </div>
  )
}
