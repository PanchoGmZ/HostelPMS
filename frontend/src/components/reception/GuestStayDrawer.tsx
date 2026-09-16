import { useState, useEffect } from 'react'
import {
  X,
  User,
  Calendar,
  BedDouble,
  DollarSign,
  PlusCircle,
  CreditCard,
  LogOut,
  ChevronDown,
  ChevronUp,
  Receipt,
  FileText,
  Phone,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'
import type { Room, Bed } from '../../types/rooms'

interface GuestStayDrawerProps {
  stay: Stay
  guest?: Guest
  folio?: Folio
  room?: Room
  bed?: Bed
  onClose: () => void
  onAddConsumption: (stay: Stay, folio?: Folio) => void
  onRecordPayment: (stay: Stay, folio?: Folio) => void
  onCheckout: (stay: Stay, folio?: Folio) => void
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

export function GuestStayDrawer({
  stay,
  guest,
  folio,
  room,
  bed,
  onClose,
  onAddConsumption,
  onRecordPayment,
  onCheckout,
}: GuestStayDrawerProps) {
  const [showFolioDetail, setShowFolioDetail] = useState(false)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const guestFullName = guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped alojado'
  const balance = folio?.balance ?? 0
  const hasDebt = balance > 0
  const bedDisplayName = bed?.label || (stay.bedIds?.[0] ? `Cama ${stay.bedIds[0]}` : 'Cama asignada')

  return (
    <div className="reception-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="reception-stay-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-guest-name"
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div>
            <span className="kicker">Huésped Activo</span>
            <h2 id="drawer-guest-name" className="drawer-title">
              {guestFullName}
            </h2>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Cerrar panel lateral"
          >
            <X size={20} />
          </button>
        </div>

        <div className="drawer-content">
          {/* Quick Info Grid */}
          <div className="drawer-card">
            <div className="drawer-info-row">
              <span className="info-label">
                <BedDouble size={16} /> Ubicación
              </span>
              <strong className="info-value">
                {room ? room.name : 'Habitación'} — {bedDisplayName}
              </strong>
            </div>

            <div className="drawer-info-row">
              <span className="info-label">
                <Calendar size={16} /> Check-in
              </span>
              <span className="info-value">{formatDateDisplay(stay.checkInDate)}</span>
            </div>

            <div className="drawer-info-row">
              <span className="info-label">
                <Calendar size={16} /> Salida Prevista
              </span>
              <span className="info-value">{formatDateDisplay(stay.expectedCheckOutDate)}</span>
            </div>

            <div className="drawer-info-row">
              <span className="info-label">
                <ShieldCheck size={16} /> Estado
              </span>
              <span className="status-badge available">Estadía activa</span>
            </div>
          </div>

          {/* Contact Details (if available) */}
          {guest && (guest.whatsapp || guest.email || guest.documentNumber) && (
            <div className="drawer-card contact-card">
              <h4 className="card-subtitle">
                <User size={15} /> Datos del Huésped
              </h4>
              <div className="contact-details">
                {guest.documentNumber && (
                  <div className="contact-item">
                    <span>Documento:</span> <strong>{guest.documentType?.toUpperCase()} {guest.documentNumber}</strong>
                  </div>
                )}
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
              </div>
            </div>
          )}

          {/* Balance Spotlight Card */}
          <div className={`drawer-balance-card ${hasDebt ? 'debt' : 'cleared'}`}>
            <div className="balance-info">
              <span className="balance-label">Saldo de la Cuenta</span>
              <div className="balance-amount">
                {balance.toFixed(2)} {folio?.currency ?? 'BOB'}
              </div>
              <span className="balance-status-text">
                {hasDebt ? '⚠️ Pago pendiente' : '✓ Cuenta al día / liquidada'}
              </span>
            </div>
            <button
              type="button"
              className="toggle-folio-btn"
              onClick={() => setShowFolioDetail(!showFolioDetail)}
              aria-expanded={showFolioDetail}
            >
              <FileText size={15} />
              <span>{showFolioDetail ? 'Ocultar cuenta' : 'Ver cuenta'}</span>
              {showFolioDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          {/* Folio Breakdown Detail (Collapsible On-Demand) */}
          {showFolioDetail && (
            <div className="drawer-folio-detail">
              <div className="detail-section">
                <h4>
                  <Receipt size={14} /> Consumos y Cargos ({folio?.charges?.length ?? 0})
                </h4>
                {(!folio?.charges || folio.charges.length === 0) ? (
                  <p className="empty-text">No hay consumos registrados aún.</p>
                ) : (
                  <div className="folio-items-list">
                    {folio.charges.map((charge) => (
                      <div key={charge.id} className="folio-item-row">
                        <div>
                          <strong>{charge.description}</strong>
                          <span className="item-meta">
                            Cant: {charge.quantity} × {charge.unitPrice} {folio.currency}
                          </span>
                        </div>
                        <span className="item-total">
                          {charge.amount} {folio.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h4>
                  <CreditCard size={14} /> Pagos Recibidos ({folio?.payments?.length ?? 0})
                </h4>
                {(!folio?.payments || folio.payments.length === 0) ? (
                  <p className="empty-text">Sin abonos o pagos registrados.</p>
                ) : (
                  <div className="folio-items-list">
                    {folio.payments.map((pmt) => (
                      <div key={pmt.id} className="folio-item-row payment">
                        <div>
                          <strong>Pago ({pmt.method})</strong>
                          {pmt.reference && <span className="item-meta">Ref: {pmt.reference}</span>}
                        </div>
                        <span className="item-total paid">
                          -{pmt.amount} {folio?.currency ?? 'BOB'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="folio-summary-bar">
                <div>Total Cargos: <strong>{folio?.totalCharges ?? 0} BOB</strong></div>
                <div>Total Pagado: <strong>{folio?.totalPaid ?? 0} BOB</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Bar */}
        <div className="drawer-actions">
          <button
            type="button"
            className="secondary-button drawer-action-btn"
            onClick={() => onAddConsumption(stay, folio)}
          >
            <PlusCircle size={17} />
            <span>+ Consumo</span>
          </button>

          <button
            type="button"
            className="secondary-button drawer-action-btn"
            onClick={() => onRecordPayment(stay, folio)}
          >
            <DollarSign size={17} />
            <span>Registrar Pago</span>
          </button>

          <button
            type="button"
            className="primary-button drawer-action-btn checkout-btn"
            onClick={() => onCheckout(stay, folio)}
          >
            <LogOut size={17} />
            <span>Check-out</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
