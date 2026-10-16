import { useMemo, useState } from 'react';
import type { Stay } from '../../types/stays';
import type { Folio } from '../../types/folios';
import type { Guest } from '../../types/guests';
import type { Room } from '../../types/rooms';
import { calculateNightlyStatus } from '../../utils/folioCalculations';
import { DollarSign, AlertTriangle, Eye, CheckCircle2, User, Calendar, LogOut } from 'lucide-react';
import './DashboardStaysPanel.css';

interface Props {
  stays: Stay[];
  folios: Folio[];
  guests: Guest[];
  rooms: Room[];
  onViewDetails: (stay: Stay) => void;
  onRecordPayment: (stay: Stay, folio?: Folio) => void;
  onExtendStay?: (stay: Stay, folio?: Folio) => void;
  onCheckout?: (stay: Stay, folio?: Folio) => void;
}

export function DashboardStaysPanel({ stays, folios, guests, rooms, onViewDetails, onRecordPayment, onExtendStay, onCheckout }: Props) {
  const [filter, setFilter] = useState<'all' | 'debt' | 'clear' | 'unassigned' | 'overdue'>('all');

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }, []);

  const data = useMemo(() => {
    let pendingStaysCount = 0;
    let totalVerifiableDebt = 0;
    let unassignedStaysCount = 0;
    let overdueCount = 0;

    const list = stays.filter(s => s.status === 'active').map(stay => {
      const folio = folios.find(f => f.stayId === stay.id);
      const guest = guests.find(g => stay.guestIds?.includes(g.id));
      const room = rooms.find(r => r.id === stay.roomId);
      const bedName = room?.beds.find(b => stay.bedIds?.includes(b.id))?.label || 'Cama';
      
      const calc = folio ? calculateNightlyStatus(stay, null as any, folio, todayStr) : null;

      // v1.20: detectar estadía vencida
      const expectedCheckOutStr = stay.expectedCheckOutDate
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stay.expectedCheckOutDate.seconds * 1000))
        : null;
      const isOverdue = expectedCheckOutStr ? expectedCheckOutStr < todayStr : false;

      if (calc) {
        if (calc.summary.lodgingDebtInitiated > 0) pendingStaysCount++;
        if (calc.summary.isReliable) totalVerifiableDebt += calc.summary.lodgingDebtInitiated;
        if (calc.summary.unassignedPayments > 0) unassignedStaysCount++;
      }
      if (isOverdue) overdueCount++;

      return { stay, folio, guest, room, bedName, calc, isOverdue, expectedCheckOutStr };
    });

    return { list, pendingStaysCount, totalVerifiableDebt, unassignedStaysCount, overdueCount };
  }, [stays, folios, guests, rooms, todayStr]);

  const filteredList = useMemo(() => {
    return data.list.filter(item => {
      if (filter === 'overdue') return item.isOverdue;
      if (!item.calc) return filter === 'all';
      if (filter === 'debt') return item.calc.summary.lodgingDebtInitiated > 0;
      if (filter === 'clear') return item.calc.summary.lodgingDebtInitiated === 0 && item.calc.summary.unassignedPayments === 0;
      if (filter === 'unassigned') return item.calc.summary.unassignedPayments > 0;
      return true;
    });
  }, [data.list, filter]);

  return (
    <div className="dashboard-stays-panel">
      <div className="stays-panel-header">
        <h3>Cobros y Estadías</h3>
        <div className="stays-indicators">
          <div className="indicator-item debt">
            <span className="indicator-val">{data.pendingStaysCount}</span>
            <span className="indicator-lbl">Con deuda de hospedaje</span>
          </div>
          <div className="indicator-item money">
            <span className="indicator-val">{(data.totalVerifiableDebt / 100).toFixed(2)} BOB</span>
            <span className="indicator-lbl">Pendiente (verificable)</span>
          </div>
          {data.overdueCount > 0 && (
            <div className="indicator-item" style={{ background: 'var(--coral-bg, #fff5f5)', borderColor: 'var(--coral, #f43f5e)' }}>
              <span className="indicator-val" style={{ color: 'var(--coral, #f43f5e)' }}>{data.overdueCount}</span>
              <span className="indicator-lbl">Estadías vencidas</span>
            </div>
          )}
        </div>
      </div>

      <div className="stays-filters">
        <button type="button" className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
        <button type="button" className={`filter-btn ${filter === 'debt' ? 'active' : ''}`} onClick={() => setFilter('debt')}>Con deuda</button>
        <button type="button" className={`filter-btn ${filter === 'clear' ? 'active' : ''}`} onClick={() => setFilter('clear')}>Al día</button>
        <button type="button" className={`filter-btn ${filter === 'unassigned' ? 'active' : ''}`} onClick={() => setFilter('unassigned')}>Sin clasificar</button>
        {data.overdueCount > 0 && (
          <button type="button" className={`filter-btn ${filter === 'overdue' ? 'active' : ''}`} style={{ color: 'var(--coral, #f43f5e)' }} onClick={() => setFilter('overdue')}>
            <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
            Vencidas ({data.overdueCount})
          </button>
        )}
      </div>

      <div className="stays-list">
        {filteredList.length === 0 ? (
          <div className="stays-list-empty">No hay estadías que coincidan con el filtro.</div>
        ) : (
          filteredList.map(({ stay, folio, guest, room, bedName, calc, isOverdue, expectedCheckOutStr }) => {
            const guestName = guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped desconocido';
            const debt = calc ? calc.summary.lodgingDebtInitiated / 100 : 0;
            const paidUntil = calc?.paidUntilDate || '-';
            
            return (
              <div key={stay.id} className={`stays-list-item${isOverdue ? ' overdue-item' : ''}`}>
                <div className="stays-list-item-info">
                  <div className="stays-list-item-title">
                    <User size={14} /> {guestName}
                    {isOverdue && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '8px', background: 'var(--coral-bg, #fff5f5)', color: 'var(--coral, #f43f5e)', border: '1px solid var(--coral, #f43f5e)' }}>
                        <AlertTriangle size={10} style={{ display: 'inline', marginRight: '2px', verticalAlign: '-1px' }} />
                        Vencida {expectedCheckOutStr}
                      </span>
                    )}
                  </div>
                  <div className="stays-list-item-meta">
                    <span className="room-badge">{room?.name} - {bedName}</span>
                  </div>
                </div>

                <div className="stays-list-item-finances">
                  {!calc ? (
                    <span className="status-label warn">Sin folio</span>
                  ) : !calc.summary.isReliable ? (
                    <span className="status-label warn"><AlertTriangle size={12}/> Info incompleta</span>
                  ) : debt > 0 ? (
                    <div className="finance-col">
                      <span className="status-label debt">Debe: {debt.toFixed(2)} BOB</span>
                      <span className="sub-lbl">({calc.summary.nightsPending} noches pend.)</span>
                    </div>
                  ) : (
                    <div className="finance-col">
                      <span className="status-label clear"><CheckCircle2 size={12}/> Al día</span>
                      <span className="sub-lbl">Pagado hasta: {paidUntil}</span>
                    </div>
                  )}
                </div>

                <div className="stays-list-item-actions">
                  <button type="button" className="secondary-button icon-only" title="Ver Detalle" onClick={() => onViewDetails(stay)}>
                    <Eye size={16} />
                  </button>
                  <button type="button" className="secondary-button icon-only" title="Registrar Pago" onClick={() => onRecordPayment(stay, folio)}>
                    <DollarSign size={16} />
                  </button>
                  {isOverdue && onExtendStay && (
                    <button type="button" className="secondary-button icon-only" title="Extender estadía" style={{ color: 'var(--coral, #f43f5e)' }} onClick={() => onExtendStay(stay, folio)}>
                      <Calendar size={16} />
                    </button>
                  )}
                  {isOverdue && onCheckout && (
                    <button type="button" className="secondary-button icon-only" title="Registrar salida atrasada" style={{ color: 'var(--coral, #f43f5e)' }} onClick={() => onCheckout(stay, folio)}>
                      <LogOut size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
