import { describe, it, expect } from 'vitest';
import { calculateNightlyStatus } from './folioCalculations';
import type { Stay } from '../types/stays';
import type { Reservation } from '../types/reservations';
import type { Folio } from '../types/folios';

describe('folioCalculations', () => {

  const createMockStay = (checkInStr: string, expectedCheckOutStr: string, actualCheckOutStr: string | null = null): Stay => {
    return {
      id: 'stay-1',
      reservationId: 'res-1',
      guestIds: [],
      roomId: 'room-1',
      bedIds: [],
      checkInDate: { seconds: Math.floor(new Date(`${checkInStr}T12:00:00-04:00`).getTime() / 1000) },
      expectedCheckOutDate: { seconds: Math.floor(new Date(`${expectedCheckOutStr}T12:00:00-04:00`).getTime() / 1000) },
      actualCheckOutDate: actualCheckOutStr ? { seconds: Math.floor(new Date(`${actualCheckOutStr}T12:00:00-04:00`).getTime() / 1000) } : undefined,
      status: 'active',
      deposit: 0,
      documentVerified: true,
      createdBy: 'user',
      createdAt: { seconds: 0 },
      updatedAt: { seconds: 0 }
    };
  };

  const createMockReservation = (): Reservation => ({
    id: 'res-1',
    roomId: 'room-1',
    bedIds: [],
    primaryGuestId: 'guest-1',
    checkInDate: { seconds: 0 },
    checkOutDate: { seconds: 0 },
    status: 'confirmed',
    channel: 'direct',
    totalAmount: 1000,
    currency: 'BOB'
  });

  const createMockFolio = (charges: any[], payments: any[], balance: number): Folio => ({
    id: 'folio-1',
    stayId: 'stay-1',
    currency: 'BOB',
    totalCharges: charges.reduce((sum, c) => sum + c.amount, 0),
    totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
    balance,
    status: 'open',
    charges,
    payments,
    createdAt: { seconds: 0 },
    updatedAt: { seconds: 0 }
  });

  it('A. 10 noches a 100 BOB; 300 pagados; hoy es noche 6.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-11');
    const res = createMockReservation();
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 10 noche(s)', amount: 1000 }],
      [{ amount: 300, allocations: [{ type: 'lodging', amount: 300 }] }],
      -700
    );

    const result = calculateNightlyStatus(stay, res, folio, '2026-10-06');
    
    // Total nights = 10 (Oct 1 to Oct 10)
    // Noche 6 = 2026-10-06. Al comenzar el día 6, la noche 6 ya está "iniciada".
    // 2026-10-01 (1) a 2026-10-06 (6) = 6 noches iniciadas.
    // Oct 7, 8, 9, 10 = 4 noches futuras.
    expect(result.summary.nightsCovered).toBe(3);
    expect(result.paidUntilDate).toBe('2026-10-03');
    
    const initiatedNights = result.nights.filter(n => n.temporalStatus === 'iniciada');
    expect(initiatedNights.length).toBe(6);
    
    expect(result.summary.nightsFuture).toBe(4);
    
    // Deuda iniciada: 6 noches * 100 = 600. Pagado: 300. Pendiente: 300.
    expect(result.summary.lodgingDebtInitiated).toBe(30000); 
    // Deuda futura: 4 noches * 100 = 400.
    expect(result.summary.lodgingFuturePending).toBe(40000); 
    
    expect(result.summary.isReliable).toBe(true);
    expect(result.summary.actualFolioBalance).toBe(-70000);
  });

  it('B. 10 noches completamente pagadas por adelantado.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-11');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 10 noche(s)', amount: 1000 }],
      [{ amount: 1000, allocations: [{ type: 'lodging', amount: 1000 }] }],
      0
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-06');
    expect(result.summary.nightsCovered).toBe(10);
    expect(result.paidUntilDate).toBe('2026-10-10');
    expect(result.summary.lodgingDebtInitiated).toBe(0);
    expect(result.summary.lodgingFuturePending).toBe(0);
  });

  it('C. 250 BOB pagados sobre noches de 100: dos cubiertas y una parcial.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-04'); // 3 nights
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 3 noche(s)', amount: 300 }],
      [{ amount: 250, allocations: [{ type: 'lodging', amount: 250 }] }],
      -50
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-03');
    expect(result.summary.nightsCovered).toBe(2);
    expect(result.summary.nightsPartial).toBe(1);
    expect(result.nights[2].financialStatus).toBe('parcial');
    expect(result.nights[2].pendingAmount).toBe(5000);
  });

  it('D. Pago 300 hospedaje + 200 consumos: solamente 300 cubren noches.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-11');
    const folio = createMockFolio(
      [
        { description: 'Hospedaje · 10 noche(s)', amount: 1000 },
        { description: 'Soda', amount: 200 }
      ],
      [{ amount: 500, allocations: [{ type: 'lodging', amount: 300 }, { type: 'consumption', amount: 200 }] }],
      -700
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-06');
    expect(result.summary.nightsCovered).toBe(3);
    expect(result.summary.totalConsumptionsPending).toBe(0);
    expect(result.summary.isReliable).toBe(true);
  });

  it('E. Tarifa pactada de 1.000 BOB por tres noches, con centavos exactos.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-04');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 3 noche(s)', amount: 1000 }],
      [],
      -1000
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-02');
    expect(result.nights[0].cost).toBe(33334);
    expect(result.nights[1].cost).toBe(33333);
    expect(result.nights[2].cost).toBe(33333);
  });

  it('F. Extensión de 3 a 10 noches, con cargos separados y fechas estructuradas.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-11');
    const folio = createMockFolio(
      [
        { description: 'Hospedaje · 3 noche(s)', amount: 300 },
        { 
          description: 'Hospedaje adicional', 
          amount: 700, 
          type: 'lodging_extension', 
          quantity: 7, 
          serviceDate: { seconds: Math.floor(new Date('2026-10-04T12:00:00-04:00').getTime() / 1000) } 
        }
      ],
      [],
      -1000
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-02');
    expect(result.nights.length).toBe(10);
    expect(result.nights[0].cost).toBe(10000);
    expect(result.nights[3].cost).toBe(10000); // Noche de la extensión
    expect(result.summary.isReliable).toBe(true);
  });

  it('F2. Extensión sin metadata fiable: comportamiento global distribuido.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-11');
    const folio = createMockFolio(
      [
        { description: 'Hospedaje base', amount: 300 },
        { description: 'Hospedaje adicional', amount: 700, type: 'lodging_extension' } // sin quantity ni serviceDate
      ],
      [],
      -1000
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-02');
    expect(result.summary.isReliable).toBe(false);
    expect(result.summary.warnings.some(w => w.includes('Extensión sin datos estructurados'))).toBe(true);
    expect(result.nights[0].cost).toBe(10000); // fallback distibuyó globalmente 1000/10
  });

  it('G. Voluntariado de costo 0.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-04');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 3 noche(s)', amount: 0 }],
      [],
      0
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-03');
    expect(result.summary.nightsCovered).toBe(3);
    expect(result.nights[0].financialStatus).toBe('gratuita');
  });

  it('H. Refund parcial de hospedaje disminuye cobertura.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-04');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 3 noche(s)', amount: 300 }],
      [
        { amount: 300, allocations: [{ type: 'lodging', amount: 300 }] },
        { amount: -100, allocations: [{ type: 'lodging', amount: -100 }] }
      ],
      -100
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-03');
    expect(result.summary.nightsCovered).toBe(2);
    expect(result.paidUntilDate).toBe('2026-10-02');
  });

  it('I. Refund de consumo: no disminuye noches pagadas.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-04');
    const folio = createMockFolio(
      [
        { description: 'Hospedaje · 3 noche(s)', amount: 300 },
        { description: 'Soda', amount: 100 }
      ],
      [
        { amount: 400, allocations: [{ type: 'lodging', amount: 300 }, { type: 'consumption', amount: 100 }] },
        { amount: -50, allocations: [{ type: 'consumption', amount: -50 }] }
      ],
      -50
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-03');
    expect(result.summary.nightsCovered).toBe(3);
    expect(result.summary.totalConsumptionsPending).toBe(5000);
  });

  it('J. Pago histórico sin allocations: estado de cobertura no concluyente.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-04');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 3 noche(s)', amount: 300 }],
      [{ amount: 300 }], // sin allocations
      0
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-03');
    expect(result.summary.isReliable).toBe(false);
    expect(result.summary.unassignedPayments).toBe(30000);
    expect(result.nights[0].financialStatus).toBe('indeterminada');
  });

  it('K. Checkout sábado registrado domingo: no agrega noche del sábado.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-10', '2026-10-09');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 9 noche(s)', amount: 900 }],
      [],
      -900
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-11');
    expect(result.nights.length).toBe(9);
    expect(result.summary.nightsUnused).toBe(1);
    expect(result.nights[8].temporalStatus).toBe('no_utilizada');
  });

  it('L. Salida anticipada sin devolución: no genera saldo ficticio a favor.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-11', '2026-10-06');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 10 noche(s)', amount: 1000 }],
      [{ amount: 1000, allocations: [{ type: 'lodging', amount: 1000 }] }],
      0
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-12');
    expect(result.summary.nightsUnused).toBe(5);
    expect(result.summary.actualFolioBalance).toBe(0);
    expect(result.summary.isReliable).toBe(true);
  });

  it('N. Otros cargos y pagos sin asignación: conciliación exacta.', () => {
    const stay = createMockStay('2026-10-01', '2026-10-03');
    const folio = createMockFolio(
      [{ description: 'Hospedaje · 2 noche(s)', amount: 200 }],
      [
        { amount: 100, allocations: [{ type: 'lodging', amount: 100 }] },
        { amount: 50 } // unassigned
      ],
      -50
    );
    const result = calculateNightlyStatus(stay, createMockReservation(), folio, '2026-10-02');
    expect(result.summary.actualFolioBalance).toBe(-5000);
    expect(result.summary.unassignedPayments).toBe(5000);
    expect(result.summary.isReliable).toBe(false);
    expect(result.summary.warnings).toContain('Existen pagos históricos sin asignar. El cálculo puede ser parcial.');
  });
});
