import type { Stay } from '../types/stays';
import type { Reservation } from '../types/reservations';
import type { Folio } from '../types/folios';

export interface NightStatus {
  date: string; // YYYY-MM-DD
  cost: number; // in cents
  coveredAmount: number; // in cents
  pendingAmount: number; // in cents
  temporalStatus: 'iniciada' | 'futura' | 'no_utilizada';
  financialStatus: 'cubierta' | 'parcial' | 'pendiente' | 'gratuita' | 'indeterminada';
}

export interface FolioNightlyCalculation {
  nights: NightStatus[];
  paidUntilDate: string | null;
  summary: {
    nightsCovered: number;
    nightsPartial: number;
    nightsPending: number;
    nightsFuture: number;
    nightsUnused: number;

    lodgingDebtInitiated: number; // cents
    lodgingFuturePending: number; // cents

    totalConsumptionsPending: number; // cents
    totalOtherPending: number; // cents

    unassignedPayments: number; // cents
    actualFolioBalance: number; // cents

    isReliable: boolean;
    warnings: string[];
  };
}

function getLocalYYYYMMDD(seconds: number): string {
  // Use America/La_Paz timezone explicitly to format YYYY-MM-DD
  const date = new Date(seconds * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  // Simple date math without shifting timezone
  const parts = dateStr.split('-');
  const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export function calculateNightlyStatus(
  stay: Stay,
  _reservation: Reservation,
  folio: Folio,
  referenceDateStr: string // YYYY-MM-DD
): FolioNightlyCalculation {
  const warnings: string[] = [];
  let isReliable = true;

  // 1. Gather Lodging Charges
  const lodgingCharges = folio.charges.filter(c => 
    c.type === 'lodging' || 
    c.type === 'lodging_extension' || 
    (!c.type && c.description.toLowerCase().includes('hospedaje'))
  );
  const consumptionCharges = folio.charges.filter(c => !lodgingCharges.includes(c));

  let totalLodgingChargesCents = 0;
  let totalConsumptionChargesCents = 0;
  let totalOtherChargesCents = 0;

  lodgingCharges.forEach(c => totalLodgingChargesCents += Math.round(c.amount * 100));
  consumptionCharges.forEach(c => totalConsumptionChargesCents += Math.round(c.amount * 100));

  // 2. Gather Payments and Allocations
  let lodgingPaymentsCents = 0;
  let consumptionPaymentsCents = 0;
  let unassignedPaymentsCents = 0;
  let otherPaymentsCents = 0;

  folio.payments.forEach(p => {
    const paymentAmountCents = Math.round(p.amount * 100);
    
    if (!p.allocations || p.allocations.length === 0) {
      unassignedPaymentsCents += paymentAmountCents;
      isReliable = false;
      if (!warnings.includes('Existen pagos históricos sin asignar. El cálculo puede ser parcial.')) {
        warnings.push('Existen pagos históricos sin asignar. El cálculo puede ser parcial.');
      }
    } else {
      let sumAllocations = 0;
      p.allocations.forEach(alloc => {
        const allocCents = Math.round(alloc.amount * 100);
        sumAllocations += allocCents;
        if (alloc.type === 'lodging') {
          lodgingPaymentsCents += allocCents;
        } else if (alloc.type === 'consumption') {
          consumptionPaymentsCents += allocCents;
        } else if (alloc.type === 'other') {
          otherPaymentsCents += allocCents;
        } else {
          unassignedPaymentsCents += allocCents;
        }
      });
      // Safety check: if allocations don't sum up to amount, the rest is unassigned
      if (sumAllocations !== paymentAmountCents) {
         unassignedPaymentsCents += (paymentAmountCents - sumAllocations);
      }
    }
  });

  // 3. Reconstruct Nights
  const checkInStr = getLocalYYYYMMDD(stay.checkInDate.seconds);
  const expectedCheckOutStr = getLocalYYYYMMDD(stay.expectedCheckOutDate.seconds);
  const actualCheckOutStr = stay.actualCheckOutDate ? getLocalYYYYMMDD(stay.actualCheckOutDate.seconds) : null;

  // Calculate total nights
  let currentDate = checkInStr;
  let totalExpectedNights = 0;
  while (currentDate < expectedCheckOutStr && totalExpectedNights < 365) {
    totalExpectedNights++;
    currentDate = addDays(currentDate, 1);
  }

  // Parse lodging charges structurally
  const dateCosts: Record<string, number> = {};
  for (let d = checkInStr; d < expectedCheckOutStr; d = addDays(d, 1)) {
    dateCosts[d] = 0;
  }

  let hasUnreliableData = false;

  const extensionCharges = lodgingCharges.filter(c => c.type === 'lodging_extension');
  const baseCharges = lodgingCharges.filter(c => c.type !== 'lodging_extension');

  if (baseCharges.length > 1) {
    hasUnreliableData = true;
    warnings.push('Múltiples cargos base de hospedaje detectados sin metadatos estructurados. Distribuyendo suma total globalmente.');
  }

  extensionCharges.forEach(ext => {
    if (!ext.serviceDate || !ext.quantity || ext.quantity <= 0) {
      hasUnreliableData = true;
      warnings.push(`Extensión sin datos estructurados suficientes (${ext.id}). Distribución puede ser imprecisa.`);
      // Add amount to base charges to distribute it globally as fallback
      baseCharges.push(ext);
      return;
    }
    const startStr = getLocalYYYYMMDD(ext.serviceDate.seconds);
    const amountCents = Math.round(ext.amount * 100);
    const nights = ext.quantity;
    
    const basePrice = Math.floor(amountCents / nights);
    const remainder = amountCents - (basePrice * nights);
    
    let curDate = startStr;
    for (let i = 0; i < nights; i++) {
      if (dateCosts[curDate] !== undefined) {
        dateCosts[curDate] += (i === 0 ? basePrice + remainder : basePrice);
      } else {
        warnings.push(`Extensión aplica a fecha fuera de rango de la estadía (${curDate}).`);
        hasUnreliableData = true;
      }
      curDate = addDays(curDate, 1);
    }
  });

  // Process base charges on the remaining free days
  // All extensions that lacked structured data were added to baseCharges
  const baseDates = Object.keys(dateCosts).filter(d => dateCosts[d] === 0);
  baseDates.sort();

  let totalBaseCents = 0;
  baseCharges.forEach(c => totalBaseCents += Math.round(c.amount * 100));

  if (baseDates.length > 0 && totalBaseCents > 0) {
    const basePrice = Math.floor(totalBaseCents / baseDates.length);
    const remainder = totalBaseCents - (basePrice * baseDates.length);
    
    baseDates.forEach((d, i) => {
      dateCosts[d] += (i === 0 ? basePrice + remainder : basePrice);
    });
  } else if (baseDates.length === 0 && totalBaseCents > 0) {
    hasUnreliableData = true;
    warnings.push('Existen cargos base pero no hay noches libres para asignarles costo.');
    const allDates = Object.keys(dateCosts);
    if (allDates.length > 0) {
      const basePrice = Math.floor(totalBaseCents / allDates.length);
      const remainder = totalBaseCents - (basePrice * allDates.length);
      allDates.forEach((d, i) => {
        dateCosts[d] += (i === 0 ? basePrice + remainder : basePrice);
      });
    }
  }

  let nightlyCostsCents: number[] = [];
  currentDate = checkInStr;
  while (currentDate < expectedCheckOutStr) {
    nightlyCostsCents.push(dateCosts[currentDate] || 0);
    currentDate = addDays(currentDate, 1);
  }

  if (totalExpectedNights === 0) {
    isReliable = false;
    warnings.push('No hay noches calculables válidas.');
  }

  if (hasUnreliableData) {
    isReliable = false;
  }

  // 4. Assign Payments and Statuses
  let currentLodgingBolsa = lodgingPaymentsCents;
  const nights: NightStatus[] = [];
  
  let nightsCovered = 0;
  let nightsPartial = 0;
  let nightsPending = 0;
  let nightsFuture = 0;
  let nightsUnused = 0;

  let lodgingDebtInitiated = 0;
  let lodgingFuturePending = 0;
  let paidUntilDate: string | null = null;
  let consecutiveCovered = true;

  currentDate = checkInStr;
  for (let i = 0; i < totalExpectedNights; i++) {
    const cost = nightlyCostsCents[i] || 0;
    let coveredAmount = 0;
    
    let financialStatus: NightStatus['financialStatus'] = 'indeterminada';
    if (!isReliable && currentLodgingBolsa === 0 && unassignedPaymentsCents > 0) {
      financialStatus = 'indeterminada';
    }

    if (cost === 0) {
      financialStatus = 'gratuita';
      coveredAmount = 0;
    } else if (currentLodgingBolsa >= cost) {
      financialStatus = 'cubierta';
      coveredAmount = cost;
      currentLodgingBolsa -= cost;
      if (consecutiveCovered) paidUntilDate = currentDate;
    } else if (currentLodgingBolsa > 0) {
      financialStatus = 'parcial';
      coveredAmount = currentLodgingBolsa;
      currentLodgingBolsa = 0;
      consecutiveCovered = false;
    } else {
      financialStatus = financialStatus === 'indeterminada' ? 'indeterminada' : 'pendiente';
      consecutiveCovered = false;
    }

    const pendingAmount = cost - coveredAmount;

    let temporalStatus: NightStatus['temporalStatus'] = 'iniciada';
    if (actualCheckOutStr && currentDate >= actualCheckOutStr) {
      temporalStatus = 'no_utilizada';
      nightsUnused++;
    } else if (currentDate > referenceDateStr) {
      temporalStatus = 'futura';
      nightsFuture++;
      lodgingFuturePending += pendingAmount;
    } else {
      temporalStatus = 'iniciada';
      lodgingDebtInitiated += pendingAmount;
    }

    if (financialStatus === 'cubierta' || financialStatus === 'gratuita') nightsCovered++;
    else if (financialStatus === 'parcial') nightsPartial++;
    else nightsPending++;

    nights.push({
      date: currentDate,
      cost,
      coveredAmount,
      pendingAmount,
      temporalStatus,
      financialStatus
    });

    currentDate = addDays(currentDate, 1);
  }

  // 5. Conciliation
  const actualFolioBalanceCents = Math.round(folio.balance * 100);
  const totalConsumptionsPending = totalConsumptionChargesCents - consumptionPaymentsCents;
  const totalOtherPending = totalOtherChargesCents - otherPaymentsCents;
  
  const lodgingPendingTotal = totalLodgingChargesCents - lodgingPaymentsCents;

  const theoreticalBalance = - (lodgingPendingTotal + totalConsumptionsPending + totalOtherPending - unassignedPaymentsCents);

  if (Math.abs(theoreticalBalance - actualFolioBalanceCents) > 1) { 
    isReliable = false;
    warnings.push(`Error de conciliación: Balance Teórico (${theoreticalBalance/100}) no coincide con Folio.balance (${actualFolioBalanceCents/100}).`);
  }

  return {
    nights,
    paidUntilDate,
    summary: {
      nightsCovered,
      nightsPartial,
      nightsPending,
      nightsFuture,
      nightsUnused,
      
      lodgingDebtInitiated,
      lodgingFuturePending,
      
      totalConsumptionsPending,
      totalOtherPending,
      
      unassignedPayments: unassignedPaymentsCents,
      actualFolioBalance: actualFolioBalanceCents,
      
      isReliable,
      warnings
    }
  };
}
