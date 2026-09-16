import { useEffect, useState, useMemo } from 'react'
import {
  X,
  User,
  Calendar,
  BedDouble,
  DollarSign,
  MapPin,
  Loader2,
  ShieldCheck,
  Pencil,
  Phone,
  Mail
} from 'lucide-react'
import type { Guest } from '../../types/guests'
import type { Stay } from '../../types/stays'
import type { Folio } from '../../types/folios'
import type { Room } from '../../types/rooms'
import type { Reservation } from '../../types/reservations'
import { listStays } from '../../services/stays/staysService'
import { listFolios } from '../../services/folios/foliosService'
import { listRooms } from '../../services/rooms/roomsService'
import { listReservations } from '../../services/reservations/reservationsService'

interface GuestDetailModalProps {
  establishmentId: string
  guest: Guest
  onClose: () => void
  onEdit: () => void
}

function formatDateDisplay(val?: { seconds: number } | null | string): string {
  if (!val) return '-'
  if (typeof val === 'string') return val
  return new Date(val.seconds * 1000).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function GuestDetailModal({ establishmentId, guest, onClose, onEdit }: GuestDetailModalProps) {
  const [stays, setStays] = useState<Stay[]>([])
  const [folios, setFolios] = useState<Folio[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [st, fol, rm, res] = await Promise.all([
          listStays(establishmentId),
          listFolios(establishmentId),
          listRooms(establishmentId),
          listReservations(establishmentId),
        ])
        if (!active) return
        setStays(st)
        setFolios(fol)
        setRooms(rm)
        setReservations(res)
      } catch (err) {
        console.error('Error loading guest details', err)
      } finally {
        if (active) setLoading(false)
      }
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    void load()
    return () => {
      active = false
      document.body.style.overflow = originalOverflow
    }
  }, [establishmentId])

  // Data processing
  const activeStay = useMemo(() => {
    return stays.find((s) => s.status === 'active' && s.guestIds?.includes(guest.id))
  }, [stays, guest.id])

  const activeFolio = useMemo(() => {
    if (!activeStay) return null
    return folios.find((f) => f.stayId === activeStay.id)
  }, [activeStay, folios])

  const activeRoom = useMemo(() => {
    if (!activeStay) return null
    return rooms.find((r) => r.id === activeStay.roomId)
  }, [activeStay, rooms])

  const activeBed = useMemo(() => {
    if (!activeStay || !activeRoom) return null
    return activeRoom.beds.find((b) => activeStay.bedIds?.includes(b.id))
  }, [activeStay, activeRoom])

  const guestReservations = useMemo(() => {
    return reservations.filter(
      (r) =>
        r.primaryGuestId === guest.id &&
        (r.status === 'confirmed' || r.status === 'completed')
    ).sort((a, b) => {
      if (a.checkInDate && b.checkInDate) {
        return b.checkInDate.seconds - a.checkInDate.seconds
      }
      return 0
    })
  }, [reservations, guest.id])

  let ageStr = 'No registrada'
  if (guest.birthDate) {
    const bDate = new Date(guest.birthDate)
    const today = new Date()
    let age = today.getFullYear() - bDate.getFullYear()
    const m = today.getMonth() - bDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
      age--
    }
    ageStr = `${age} años`
  }

  const balance = activeFolio?.balance ?? 0
  const hasDebt = balance > 0
  const bedDisplayName = activeBed?.label || (activeStay?.bedIds?.[0] ? `Cama ${activeStay.bedIds[0].slice(-3)}` : 'Sin asignar')

  return (
    <div className="reception-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="reception-stay-drawer"
        style={{ maxWidth: '750px', width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="kicker">Perfil Completo</span>
            <h2 className="drawer-title">{guest.firstName} {guest.lastName}</h2>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '13px' }}>
              <span className={`status-badge ${activeStay ? 'available' : 'default'}`}>
                {activeStay ? 'Hospedado actualmente' : 'Sin estadía activa'}
              </span>
              <span style={{ color: 'var(--text-light)', borderLeft: '1px solid var(--line)', paddingLeft: '8px' }}>
                {guest.nationality || 'Sin nacionalidad'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="secondary-button compact-button" onClick={onEdit}>
              <Pencil size={15} /> Editar
            </button>
            <button type="button" className="drawer-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="drawer-content" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px' }}>
          {loading ? (
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 size={24} className="loader" />
            </div>
          ) : (
            <>
              {/* Left Column: Guest Data & Reservations */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="drawer-card contact-card">
                  <h4 className="card-subtitle"><User size={15} /> Datos del Huésped</h4>
                  <div className="contact-details">
                    <div className="contact-item">
                      <span>Documento:</span> <strong>{guest.documentType?.toUpperCase()} {guest.documentNumber || 'N/A'}</strong>
                    </div>
                    <div className="contact-item">
                      <span>Nacimiento:</span> <strong>{guest.birthDate || 'N/A'} ({ageStr})</strong>
                    </div>
                    {guest.whatsapp && (
                      <div className="contact-item">
                        <Phone size={13} /> <span>{guest.whatsapp}</span>
                      </div>
                    )}
                    {guest.email && (
                      <div className="contact-item">
                        <Mail size={13} /> <span>{guest.email}</span>
                      </div>
                    )}
                    <div className="contact-item" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--line)' }}>
                      <span>Ruta:</span> <strong>{guest.previousCity || 'N/A'} → {guest.nextCity || 'N/A'}</strong>
                    </div>
                    {guest.emergencyContact && (
                      <div className="contact-item">
                        <span>Emergencia:</span> <strong>{guest.emergencyContact}</strong>
                      </div>
                    )}
                    {guest.notes && (
                      <div className="contact-item" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--line)', display: 'block' }}>
                        <span style={{ display: 'block', marginBottom: '4px' }}>Notas:</span>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-light)', fontStyle: 'italic' }}>{guest.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="drawer-card">
                  <h4 className="card-subtitle"><Calendar size={15} /> Historial de Reservas</h4>
                  {guestReservations.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-light)' }}>Sin reservas activas o pasadas.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {guestReservations.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', paddingBottom: '8px', borderBottom: '1px solid var(--line-light)' }}>
                          <div>
                            <strong>{formatDateDisplay(r.checkInDate)}</strong> → <strong>{formatDateDisplay(r.checkOutDate)}</strong>
                            <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                              Habitación/Cama
                            </div>
                          </div>
                          <span className={`status-badge ${r.status === 'confirmed' ? 'available' : 'default'}`}>
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Active Stay & Folio */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {activeStay ? (
                  <>
                    <div className="drawer-card">
                      <h4 className="card-subtitle"><ShieldCheck size={15} /> Estadía Activa</h4>
                      <div className="drawer-info-row">
                        <span className="info-label"><BedDouble size={16} /> Ubicación</span>
                        <strong className="info-value">{activeRoom ? activeRoom.name : 'Habitación'} — {bedDisplayName}</strong>
                      </div>
                      <div className="drawer-info-row">
                        <span className="info-label"><Calendar size={16} /> Check-in</span>
                        <span className="info-value">{formatDateDisplay(activeStay.checkInDate)}</span>
                      </div>
                      <div className="drawer-info-row">
                        <span className="info-label"><Calendar size={16} /> Salida Prevista</span>
                        <span className="info-value">{formatDateDisplay(activeStay.expectedCheckOutDate)}</span>
                      </div>
                    </div>

                    <div className="drawer-card" style={{ background: hasDebt ? '#fff1f2' : 'var(--bg-card)' }}>
                      <h4 className="card-subtitle" style={{ color: hasDebt ? '#e11d48' : 'inherit' }}><DollarSign size={15} /> Resumen de Cuenta</h4>
                      <div className="drawer-info-row">
                        <span className="info-label">Total Cargado</span>
                        <span className="info-value">{(activeFolio?.totalCharges ?? 0).toFixed(2)} BOB</span>
                      </div>
                      <div className="drawer-info-row">
                        <span className="info-label">Total Pagado</span>
                        <span className="info-value">{(activeFolio?.totalPaid ?? 0).toFixed(2)} BOB</span>
                      </div>
                      <div className="drawer-info-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--line)' }}>
                        <span className="info-label"><strong>Saldo Pendiente</strong></span>
                        <strong className="info-value" style={{ color: hasDebt ? '#e11d48' : 'var(--teal-deep)', fontSize: '15px' }}>
                          {balance.toFixed(2)} BOB
                        </strong>
                      </div>
                      <div style={{ marginTop: '12px', textAlign: 'right' }}>
                        <span className={`status-badge ${hasDebt ? 'debt' : 'available'}`}>
                          {hasDebt ? 'Con Deuda' : 'Al Día'}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="drawer-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', color: 'var(--text-light)', textAlign: 'center' }}>
                    <MapPin size={32} style={{ marginBottom: '10px', opacity: 0.5 }} />
                    <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '4px' }}>Sin Estadía Activa</strong>
                    <p style={{ fontSize: '13px', margin: 0 }}>Este huésped no se encuentra alojado actualmente en el establecimiento.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
