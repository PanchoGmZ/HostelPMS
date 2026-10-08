import { useMemo } from 'react';
import { calculateNightlyStatus } from '../../utils/folioCalculations';
import type { FolioNightlyCalculation } from '../../utils/folioCalculations';
import type { Stay } from '../../types/stays';
import type { Folio } from '../../types/folios';
import { AlertTriangle } from 'lucide-react';
import './NightlyPaymentOverview.css';

interface Props {
  stay: Stay;
  folio?: Folio;
  referenceDateStr: string;
}

export function NightlyPaymentOverview({ stay, folio, referenceDateStr }: Props) {
  const data = useMemo(() => {
    if (!folio) return null;
    return calculateNightlyStatus(stay, null as any, folio, referenceDateStr);
  }, [stay, folio, referenceDateStr]);

  if (!folio || !data) {
    return <div className="overview-loading">Calculando cobertura de noches...</div>;
  }

  const { summary, nights } = data;

  const renderNightBox = (night: FolioNightlyCalculation['nights'][0]) => {
    let boxClass = 'night-box ';
    let title = `${night.date} - ${night.cost / 100} BOB`;

    if (night.temporalStatus === 'no_utilizada') {
      boxClass += 'unused';
      title += ' (No utilizada)';
    } else if (night.financialStatus === 'indeterminada') {
      boxClass += 'indeterminate';
      title += ' (Indeterminada)';
    } else if (night.financialStatus === 'cubierta' || night.financialStatus === 'gratuita') {
      boxClass += 'covered';
      if (night.temporalStatus === 'futura') boxClass += ' future';
      title += night.financialStatus === 'gratuita' ? ' (Gratuita)' : ' (Pagada)';
    } else if (night.financialStatus === 'parcial') {
      boxClass += 'partial';
      title += ` (Pagado: ${night.coveredAmount / 100} BOB, Falta: ${night.pendingAmount / 100} BOB)`;
    } else {
      // pendiente
      boxClass += night.temporalStatus === 'futura' ? 'pending-future' : 'pending-debt';
      title += ' (Pendiente)';
    }

    return (
      <div key={night.date} className={boxClass} title={title}>
        <span className="night-date-label">{night.date.split('-')[2]}</span>
      </div>
    );
  };

  return (
    <div className="nightly-overview-container">
      <h4 className="overview-title">Control de Noches</h4>
      
      {!summary.isReliable && (
        <div className="overview-warning-banner">
          <AlertTriangle size={16} />
          <div className="warning-text">
            <strong>Cobertura No Verificable</strong>
            {summary.warnings.map((w, i) => <span key={i} className="warning-line">{w}</span>)}
          </div>
        </div>
      )}

      <div className="overview-summary-grid">
        <div className="summary-item">
          <span className="summary-label">Noches Iniciadas</span>
          <strong className="summary-value">{summary.nightsCovered + summary.nightsPartial + summary.nightsPending - summary.nightsFuture - summary.nightsUnused + summary.nightsFuture}</strong>
          {/* Wait, total initiated is nights with temporalStatus === 'iniciada' */}
        </div>
        
        <div className="summary-item">
          <span className="summary-label">Pagado Hasta</span>
          <strong className="summary-value">{data.paidUntilDate ? data.paidUntilDate : '-'}</strong>
        </div>

        <div className="summary-item debt">
          <span className="summary-label">Deuda Alojamiento (Hoy)</span>
          <strong className="summary-value">{(summary.lodgingDebtInitiated / 100).toFixed(2)} BOB</strong>
        </div>

        <div className="summary-item">
          <span className="summary-label">Pendiente Futuro</span>
          <strong className="summary-value">{(summary.lodgingFuturePending / 100).toFixed(2)} BOB</strong>
        </div>

        <div className="summary-item consumption">
          <span className="summary-label">Consumos / Otros</span>
          <strong className="summary-value">{((summary.totalConsumptionsPending + summary.totalOtherPending) / 100).toFixed(2)} BOB</strong>
        </div>

        {summary.unassignedPayments > 0 && (
          <div className="summary-item unassigned">
            <span className="summary-label">Pagos Sin Clasificar</span>
            <strong className="summary-value">{(summary.unassignedPayments / 100).toFixed(2)} BOB</strong>
          </div>
        )}
      </div>

      <div className="nights-timeline-scroll">
        <div className="nights-timeline">
          {nights.map(renderNightBox)}
        </div>
      </div>
      
      <div className="nights-legend">
        <div className="legend-item"><span className="legend-color covered"></span> Cubierta</div>
        <div className="legend-item"><span className="legend-color partial"></span> Parcial</div>
        <div className="legend-item"><span className="legend-color pending-debt"></span> Pendiente (Iniciada)</div>
        <div className="legend-item"><span className="legend-color pending-future"></span> Futura</div>
        <div className="legend-item"><span className="legend-color unused"></span> No utilizada</div>
      </div>
    </div>
  );
}
