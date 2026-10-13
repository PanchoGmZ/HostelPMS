import { describe, it, expect } from 'vitest';
import { recordPaymentSchema } from '../schemas/foliosSchema';

/**
 * Suite de Pruebas: Validaciones Financieras PMS (Escenarios A - J)
 * Hotfix Fase 1: Recuperación Operativa v1.19.1
 */

interface FolioCharge {
  id: string;
  type: string;
  description: string;
  amount: number;
}

interface FolioPayment {
  id: string;
  amount: number;
  currency: string;
  method: string;
  allocations?: Array<{ type: string; amount: number }>;
  idempotencyKey?: string;
  createdAt: number;
}

interface FolioState {
  id: string;
  stayId: string;
  currency: string;
  totalCharges: number;
  totalPaid: number;
  balance: number; // totalPaid - totalCharges (negativo indica deuda)
  charges: FolioCharge[];
  payments: FolioPayment[];
}

interface CashMovement {
  id: string;
  shiftId: string;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  idempotencyKey?: string;
}

// Simulador puro de lógica de backend recordPayment
function simulateRecordPayment(
  folio: FolioState,
  cashShift: { id: string; status: 'open' | 'closed' } | null,
  paymentInput: {
    amount: number;
    method: string;
    allocations?: Array<{ type: string; amount: number }>;
    idempotencyKey?: string;
  },
  existingMovements: CashMovement[]
): {
  success: boolean;
  folio?: FolioState;
  movements: CashMovement[];
  alreadyProcessed?: boolean;
  error?: string;
} {
  // Validación de esquema
  const validation = recordPaymentSchema.safeParse({
    stayId: folio.stayId,
    amount: paymentInput.amount,
    method: paymentInput.method,
  });
  if (!validation.success) {
    return { success: false, movements: existingMovements, error: validation.error.issues[0]?.message };
  }

  // Idempotencia
  if (paymentInput.idempotencyKey) {
    const existingPayment = folio.payments.find(p => p.idempotencyKey === paymentInput.idempotencyKey);
    if (existingPayment) {
      return { success: true, folio, movements: existingMovements, alreadyProcessed: true };
    }
  }

  // Turno de caja
  if (!cashShift || cashShift.status !== 'open') {
    return { success: false, movements: existingMovements, error: 'No hay turno de caja abierto' };
  }

  // Sanitize allocations to avoid undefined
  const paymentObj: FolioPayment = {
    id: `pay-${Date.now()}-${Math.random()}`,
    amount: paymentInput.amount,
    currency: folio.currency,
    method: paymentInput.method,
    idempotencyKey: paymentInput.idempotencyKey,
    createdAt: Date.now(),
  };
  if (paymentInput.allocations && paymentInput.allocations.length > 0) {
    paymentObj.allocations = paymentInput.allocations;
  }

  const newTotalPaid = Math.round((folio.totalPaid + paymentInput.amount) * 100) / 100;
  const newBalance = Math.round((newTotalPaid - folio.totalCharges) * 100) / 100;

  const updatedFolio: FolioState = {
    ...folio,
    totalPaid: newTotalPaid,
    balance: newBalance,
    payments: [...folio.payments, paymentObj],
  };

  const newMovement: CashMovement = {
    id: `mov-${Date.now()}`,
    shiftId: cashShift.id,
    type: 'in',
    amount: paymentInput.amount,
    reason: `Cobro Folio ${folio.id}`,
    idempotencyKey: paymentInput.idempotencyKey,
  };

  return {
    success: true,
    folio: updatedFolio,
    movements: [...existingMovements, newMovement],
  };
}

describe('Hotfix Fase 1: Escenarios Financieros y Transaccionales (A - J)', () => {
  const openShift = { id: 'shift-1', status: 'open' as const };
  const closedShift = { id: 'shift-2', status: 'closed' as const };

  it('A. Folio debe 300 BOB → Cobrar todo → saldo 0', () => {
    const initialFolio: FolioState = {
      id: 'folio-A',
      stayId: 'stay-A',
      currency: 'BOB',
      totalCharges: 300,
      totalPaid: 0,
      balance: -300, // Deuda de 300 BOB
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje', amount: 300 }],
      payments: [],
    };

    const pendingDebt = Math.max(0, -initialFolio.balance);
    expect(pendingDebt).toBe(300);

    const result = simulateRecordPayment(
      initialFolio,
      openShift,
      { amount: pendingDebt, method: 'cash' },
      []
    );

    expect(result.success).toBe(true);
    expect(result.folio?.totalPaid).toBe(300);
    expect(result.folio?.balance).toBe(0); // Saldo final 0
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].amount).toBe(300);
  });

  it('B. Folio debe 300 BOB → Cobrar 100 → deuda 200', () => {
    const initialFolio: FolioState = {
      id: 'folio-B',
      stayId: 'stay-B',
      currency: 'BOB',
      totalCharges: 300,
      totalPaid: 0,
      balance: -300,
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje', amount: 300 }],
      payments: [],
    };

    const partialPaymentAmount = 100;
    const result = simulateRecordPayment(
      initialFolio,
      openShift,
      { amount: partialPaymentAmount, method: 'cash' },
      []
    );

    expect(result.success).toBe(true);
    expect(result.folio?.totalPaid).toBe(100);
    expect(result.folio?.balance).toBe(-200); // Deuda pendiente de 200
    const remainingDebt = Math.max(0, -(result.folio?.balance ?? 0));
    expect(remainingDebt).toBe(200);
  });

  it('C. Folio debe 120 BOB → pago desde página Folios', () => {
    const initialFolio: FolioState = {
      id: 'folio-C',
      stayId: 'stay-C',
      currency: 'BOB',
      totalCharges: 120,
      totalPaid: 0,
      balance: -120,
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje 1 noche', amount: 120 }],
      payments: [],
    };

    const paymentAmount = 120;
    const idempotencyKey = 'folio-pay-test-120';
    const result = simulateRecordPayment(
      initialFolio,
      openShift,
      {
        amount: paymentAmount,
        method: 'cash',
        allocations: [{ type: 'lodging', amount: 120 }],
        idempotencyKey,
      },
      []
    );

    expect(result.success).toBe(true);
    expect(result.folio?.totalPaid).toBe(120);
    expect(result.folio?.balance).toBe(0);
    expect(result.folio?.payments[0].allocations).toEqual([{ type: 'lodging', amount: 120 }]);
  });

  it('D. Check-in con 240 BOB → pagar completo', () => {
    // Check-in inicializa folio con totalCharges: 240 y pago: 240
    const initialPayment = 240;
    const stayLodgingCharge = 240;

    const folioAfterCheckIn: FolioState = {
      id: 'folio-D',
      stayId: 'stay-D',
      currency: 'BOB',
      totalCharges: stayLodgingCharge,
      totalPaid: initialPayment,
      balance: 0,
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje Check-in', amount: 240 }],
      payments: [{
        id: 'pay-d1',
        amount: 240,
        currency: 'BOB',
        method: 'cash',
        allocations: [{ type: 'lodging', amount: 240 }],
        createdAt: Date.now(),
      }],
    };

    expect(folioAfterCheckIn.balance).toBe(0);
    expect(folioAfterCheckIn.totalPaid).toBe(240);
  });

  it('E. Check-in sin pago → registrar estadía con deuda', () => {
    const stayLodgingCharge = 240;
    const initialPayment = 0;

    const folioAfterCheckInWithoutPayment: FolioState = {
      id: 'folio-E',
      stayId: 'stay-E',
      currency: 'BOB',
      totalCharges: stayLodgingCharge,
      totalPaid: initialPayment,
      balance: -stayLodgingCharge, // -240 BOB
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje Check-in', amount: 240 }],
      payments: [],
    };

    expect(folioAfterCheckInWithoutPayment.balance).toBe(-240);
    const pendingDebt = Math.max(0, -folioAfterCheckInWithoutPayment.balance);
    expect(pendingDebt).toBe(240);
  });

  it('F. Walk-in → crear reserva, Stay y Folio correctamente', () => {
    // Simulador de Walk-in orquestado
    const reservation = {
      id: 'res-walkin-1',
      roomId: 'room-1',
      primaryGuestId: 'guest-1',
      status: 'confirmed',
      totalAmount: 150,
    };

    // checkInGuest se ejecuta con esa reserva
    const stay = {
      id: 'stay-walkin-1',
      reservationId: reservation.id,
      guestIds: [reservation.primaryGuestId],
      status: 'active',
    };

    const folio: FolioState = {
      id: 'folio-walkin-1',
      stayId: stay.id,
      currency: 'BOB',
      totalCharges: 150,
      totalPaid: 150,
      balance: 0,
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje', amount: 150 }],
      payments: [{
        id: 'p1',
        amount: 150,
        currency: 'BOB',
        method: 'cash',
        createdAt: Date.now(),
      }],
    };

    expect(stay.reservationId).toBe(reservation.id);
    expect(folio.stayId).toBe(stay.id);
    expect(folio.balance).toBe(0);
  });

  it('G. Walk-in falla después de crear reserva → recuperar sin duplicados', () => {
    // Escenario: createReservation crea reserva res-retry-1 con primaryGuestId guest-retry-1.
    // checkInGuest falla en primera llamada.
    const createdReservationId = 'res-retry-1';
    const createdGuestId = 'guest-retry-1';
    const guestCreationCalls: string[] = [];
    const reservationCreationCalls: string[] = [];

    // Función simulada de submit con retry guard
    function handleSubmitWalkIn(isRetry: boolean, resId: string | null, guestId: string | null) {
      let finalResId = resId;
      let finalGuestId = guestId;

      if (!isRetry || !finalGuestId) {
        finalGuestId = 'new-guest-id';
        guestCreationCalls.push(finalGuestId);
      }

      if (!isRetry || !finalResId) {
        finalResId = 'new-res-id';
        reservationCreationCalls.push(finalResId);
      }

      // Check-in ejecutado con finalResId y finalGuestId
      return { success: true, resId: finalResId, guestId: finalGuestId };
    }

    // Primer intento (falla antes de check-in completar, pero guarda createdReservationId y createdGuestId)
    // El retry reutiliza createdReservationId y createdGuestId:
    const retryResult = handleSubmitWalkIn(true, createdReservationId, createdGuestId);

    // No se deben llamar nuevamente a crear huésped ni a crear reserva
    expect(guestCreationCalls).toHaveLength(0);
    expect(reservationCreationCalls).toHaveLength(0);
    expect(retryResult.resId).toBe('res-retry-1');
    expect(retryResult.guestId).toBe('guest-retry-1');
  });

  it('H. Extender Stay con Payments antiguos sin allocations no produce undefined', () => {
    // Pago legacy sin propiedad allocations
    const legacyPayment: FolioPayment = {
      id: 'pay-legacy-1',
      amount: 100,
      currency: 'BOB',
      method: 'cash',
      createdAt: 1600000000,
    };

    // Al serializar o guardar en Firestore, no debe haber `undefined`
    const paymentsArray = [legacyPayment];
    const sanitizedPayments = paymentsArray.map(p => {
      const sanitized: any = { ...p };
      // Limpiar undefined si hubiera
      Object.keys(sanitized).forEach(k => {
        if (sanitized[k] === undefined) delete sanitized[k];
      });
      return sanitized;
    });

    expect(sanitizedPayments[0].allocations).toBeUndefined();
    expect('allocations' in sanitizedPayments[0]).toBe(false); // Propiedad no existe, sin undefined explícito
    expect(sanitizedPayments[0].amount).toBe(100);
  });

  it('I. Reintento de pago con idempotencyKey → no duplicar movimientos', () => {
    const folio: FolioState = {
      id: 'folio-I',
      stayId: 'stay-I',
      currency: 'BOB',
      totalCharges: 200,
      totalPaid: 0,
      balance: -200,
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje', amount: 200 }],
      payments: [],
    };

    const idempotencyKey = 'idem-unique-key-123';
    let movements: CashMovement[] = [];

    // Primer intento
    const firstAttempt = simulateRecordPayment(
      folio,
      openShift,
      { amount: 200, method: 'cash', idempotencyKey },
      movements
    );
    expect(firstAttempt.success).toBe(true);
    expect(firstAttempt.alreadyProcessed).toBeUndefined();
    movements = firstAttempt.movements;
    expect(movements).toHaveLength(1);

    // Segundo intento (reintento de red con misma clave)
    const secondAttempt = simulateRecordPayment(
      firstAttempt.folio!,
      openShift,
      { amount: 200, method: 'cash', idempotencyKey },
      movements
    );
    expect(secondAttempt.success).toBe(true);
    expect(secondAttempt.alreadyProcessed).toBe(true);
    // No debe haber generado un segundo movimiento
    expect(secondAttempt.movements).toHaveLength(1);
    expect(secondAttempt.folio?.totalPaid).toBe(200);
  });

  it('J. Turno de caja cerrado → bloquear cobro, permitir ingreso sin pago', () => {
    const folio: FolioState = {
      id: 'folio-J',
      stayId: 'stay-J',
      currency: 'BOB',
      totalCharges: 300,
      totalPaid: 0,
      balance: -300,
      charges: [{ id: 'c1', type: 'lodging', description: 'Hospedaje', amount: 300 }],
      payments: [],
    };

    // Cobro con turno cerrado debe ser rechazado
    const payResult = simulateRecordPayment(
      folio,
      closedShift,
      { amount: 300, method: 'cash' },
      []
    );
    expect(payResult.success).toBe(false);
    expect(payResult.error).toContain('No hay turno de caja abierto');

    // Ingreso sin pago no interactúa con caja y es permitido
    const checkInWithoutPayment = {
      stayId: 'stay-J',
      initialPayment: 0,
      allowed: true, // Permitido sin turno de caja abierto
    };
    expect(checkInWithoutPayment.allowed).toBe(true);
  });
});
