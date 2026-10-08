import { useMemo, useState } from 'react';
import type { Stay } from '../../types/stays';
import type { Folio } from '../../types/folios';
import type { Guest } from '../../types/guests';
import type { Room } from '../../types/rooms';
import { calculateNightlyStatus } from '../../utils/folioCalculations';
import { DollarSign, AlertTriangle, Eye, CheckCircle2, User } from 'lucide-react';
import './DashboardStaysPanel.css';

interface Props {
  stays: Stay[];
  folios: Folio[];
  guests: Guest[];
  rooms: Room[];
  onViewDetails: (stay: Stay) => void;
  onRecordPayment: (stay: Stay, folio?: Folio) => void;
}

export function DashboardStaysPanel({ stays, folios, guests, rooms, onViewDetails, onRecordPayment }: Props) {
  const [filter, setFilter] = useState<'all' | 'debt' | 'clear' | 'unassigned'>('all');

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }, []);

  const data = useMemo(() => {
    let pendingStaysCount = 0;
    let totalVerifiableDebt = 0;
    let unassignedStaysCount = 0;

    const list = stays.filter(s => s.status === 'active').map(stay => {
      const folio = folios.find(f => f.stayId === stay.id);
      const guest = guests.find(g => stay.guestIds?.includes(g.id));
      const room = rooms.find(r => r.id === stay.roomId);
      const bedName = room?.beds.find(b => stay.bedIds?.includes(b.id))?.label || 'Cama';
      
      const calc = folio ? calculateNightlyStatus(stay, null as any, folio, todayStr) : null;

      if (calc) {
        if (calc.summary.lodgingDebtInitiated > 0) pendingStaysCount++;
        if (calc.summary.isReliable) totalVerifiableDebt += calc.summary.lodgingDebtInitiated;
        if (calc.summary.unassignedPayments > 0) unassignedStaysCount++;
      }

      return { stay, folio, guest, room, bedName, calc };
    });

    return { list, pendingStaysCount, totalVerifiableDebt, unassignedStaysCount };
  }, [stays, folios, guests, rooms, todayStr]);

  const filteredList = useMemo(() => {
    return data.list.filter(item => {
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
          <div className="indicator-item warn">
            <span className="indicator-val">{data.unassignedStaysCount}</span>
            <span className="indicator-lbl">Con historial sin clasificar</span>
          </div>
        </div>
      </div>

      <div className="stays-filters">
        <button type="button" className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
        <button type="button" className={`filter-btn ${filter === 'debt' ? 'active' : ''}`} onClick={() => setFilter('debt')}>Con deuda</button>
        <button type="button" className={`filter-btn ${filter === 'clear' ? 'active' : ''}`} onClick={() => setFilter('clear')}>Al día</button>
        <button type="button" className={`filter-btn ${filter === 'unassigned' ? 'active' : ''}`} onClick={() => setFilter('unassigned')}>Sin clasificar</button>
      </div>

      <div className="stays-list">
        {filteredList.length === 0 ? (
          <div className="stays-list-empty">No hay estadías que coincidan con el filtro.</div>
        ) : (
          filteredList.map(({ stay, folio, guest, room, bedName, calc }) => {
            const guestName = guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped desconocido';
            const debt = calc ? calc.summary.lodgingDebtInitiated / 100 : 0;
            const paidUntil = calc?.paidUntilDate || '-';
            
            return (
              <div key={stay.id} className="stays-list-item">
                <div className="stays-list-item-info">
                  <div className="stays-list-item-title">
                    <User size={14} /> {guestName}
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
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
