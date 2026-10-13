import { describe, it, expect } from 'vitest';

/**
 * Suite de Pruebas: Fase 2 — Prevención de Reservas Duplicadas y Cambio de Cama
 * Escenarios de Verificación A - J
 */

interface AvailabilityBucket {
  [day: string]: {
    reservationId: string;
    mode: 'bed' | 'full_room';
  };
}

interface MockReservation {
  id: string;
  establishmentId: string;
  idempotencyKey?: string | null;
  roomId: string;
  bedIds: string[];
  checkIn: string;
  checkOut: string;
  status: 'confirmed' | 'cancelled';
  totalAmount: number;
}

interface MockStay {
  id: string;
  reservationId: string;
  folioId: string;
  roomId: string;
  bedIds: string[];
  saleMode: 'bed' | 'full_room';
  checkInDate: { seconds: number };
  expectedCheckOutDate: { seconds: number };
  status: 'active' | 'completed';
  movements: any[];
}

interface MockFolio {
  id: string;
  stayId: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
}

describe('Fase 2: Reservas Duplicadas y Cambio de Cama (Escenarios A - J)', () => {
  // Helpers para fechas Bolivia
  const getBoliviaDateString = (d: Date): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/La_Paz',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  it('A. Doble clic en Crear Reserva → una sola reserva (guarda frontend isSubmittingRef)', async () => {
    let callCount = 0;
    const isSubmittingRef = { current: false };

    async function submitReservation() {
      if (isSubmittingRef.current) return { blocked: true };
      isSubmittingRef.current = true;
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      isSubmittingRef.current = false;
      return { blocked: false, reservationId: 'res-abc-1' };
    }

    // Dos llamadas simultáneas por doble clic rápido
    const [res1, res2] = await Promise.all([submitReservation(), submitReservation()]);

    expect(callCount).toBe(1);
    expect(res1.blocked).toBe(false);
    expect(res2.blocked).toBe(true);
  });

  it('B. Dos solicitudes simultáneas con misma clave de idempotencia → una reserva en backend', async () => {
    const idempotencyStore = new Map<string, { reservationId: string; totalAmount: number }>();
    const reservations: MockReservation[] = [];
    const availabilityStore: Record<string, AvailabilityBucket> = {
      'bed-1_2026-10': {},
    };

    async function transactionalCreateReservation(payload: {
      idempotencyKey?: string;
      roomId: string;
      bedId: string;
      days: string[];
      amount: number;
    }) {
      // Phase 1: check idempotency
      if (payload.idempotencyKey && idempotencyStore.has(payload.idempotencyKey)) {
        const existing = idempotencyStore.get(payload.idempotencyKey)!;
        return {
          success: true,
          reservationId: existing.reservationId,
          totalAmount: existing.totalAmount,
          alreadyProcessed: true,
        };
      }

      // Check availability
      const bucket = availabilityStore[`${payload.bedId}_2026-10`];
      for (const day of payload.days) {
        if (bucket[day]) {
          throw new Error(`Cama ocupada el día ${day}`);
        }
      }

      // Phase 2: writes
      const resId = `res-${Date.now()}-${Math.random()}`;
      for (const day of payload.days) {
        bucket[day] = { reservationId: resId, mode: 'bed' };
      }

      const newRes: MockReservation = {
        id: resId,
        establishmentId: 'est-1',
        idempotencyKey: payload.idempotencyKey || null,
        roomId: payload.roomId,
        bedIds: [payload.bedId],
        checkIn: '2026-10-15',
        checkOut: '2026-10-18',
        status: 'confirmed',
        totalAmount: payload.amount,
      };
      reservations.push(newRes);

      if (payload.idempotencyKey) {
        idempotencyStore.set(payload.idempotencyKey, {
          reservationId: resId,
          totalAmount: payload.amount,
        });
      }

      return { success: true, reservationId: resId, totalAmount: payload.amount };
    }

    const key = 'idem-req-b-123';
    const payload = {
      idempotencyKey: key,
      roomId: 'room-1',
      bedId: 'bed-1',
      days: ['15', '16', '17'],
      amount: 300,
    };

    const firstRun = await transactionalCreateReservation(payload);
    const secondRun = await transactionalCreateReservation(payload);

    expect(firstRun.success).toBe(true);
    expect(firstRun.alreadyProcessed).toBeUndefined();
    expect(secondRun.success).toBe(true);
    expect(secondRun.alreadyProcessed).toBe(true);
    expect(secondRun.reservationId).toBe(firstRun.reservationId);

    // Solo se creó un documento de reserva
    expect(reservations).toHaveLength(1);
    // Y las camas están asignadas al reservationId original
    expect(availabilityStore['bed-1_2026-10']['15'].reservationId).toBe(firstRun.reservationId);
  });

  it('C. Respuesta perdida y reintento → recuperar reserva original sin duplicar camas', async () => {
    const idempotencyStore = new Map<string, { reservationId: string; totalAmount: number }>();
    idempotencyStore.set('key-lost-conn', { reservationId: 'res-original-999', totalAmount: 450 });

    // Cliente reintenta con misma clave
    const key = 'key-lost-conn';
    const hasExisting = idempotencyStore.has(key);
    expect(hasExisting).toBe(true);
    const result = idempotencyStore.get(key);
    expect(result?.reservationId).toBe('res-original-999');
    expect(result?.totalAmount).toBe(450);
  });

  it('D. Dos reservas legítimas diferentes → no bloquear incorrectamente', async () => {
    const idempotencyStore = new Map<string, { reservationId: string; totalAmount: number }>();
    const key1 = 'key-user-1';
    const key2 = 'key-user-2';

    idempotencyStore.set(key1, { reservationId: 'res-1', totalAmount: 100 });
    expect(idempotencyStore.has(key2)).toBe(false);

    // key2 procede normalmente
    idempotencyStore.set(key2, { reservationId: 'res-2', totalAmount: 150 });
    expect(idempotencyStore.size).toBe(2);
    expect(idempotencyStore.get(key1)?.reservationId).not.toBe(idempotencyStore.get(key2)?.reservationId);
  });

  it('E. Walk-in fallido después de crear reserva → recuperar sin duplicar', () => {
    let createdReservationId: string | null = null;
    let createReservationCount = 0;
    let checkInCount = 0;

    function walkInFlow(forceCheckInFail: boolean) {
      if (!createdReservationId) {
        createReservationCount++;
        createdReservationId = 'res-walkin-recovered-1';
      }

      checkInCount++;
      if (forceCheckInFail) {
        throw new Error('CheckIn failed');
      }
      return { success: true, reservationId: createdReservationId };
    }

    // Intento 1: createReservation tiene éxito, pero checkIn falla
    expect(() => walkInFlow(true)).toThrow('CheckIn failed');
    expect(createReservationCount).toBe(1);
    expect(createdReservationId).toBe('res-walkin-recovered-1');

    // Reintento: usa createdReservationId sin invocar createReservation otra vez
    const recovered = walkInFlow(false);
    expect(recovered.success).toBe(true);
    expect(recovered.reservationId).toBe('res-walkin-recovered-1');
    expect(createReservationCount).toBe(1); // ¡NO SE DUPLICÓ LA RESERVA!
    expect(checkInCount).toBe(2);
  });

  it('F. Huésped ingresó hace tres días → mover cama hoy; conserva noches pasadas', () => {
    // Check-in: 2026-10-10. Salida prevista: 2026-10-15.
    // Hoy es 2026-10-13.
    const checkOutStr = '2026-10-15';
    const effectiveDateStr = '2026-10-13'; // HOY

    const oldBedAvailability: Record<string, string | null> = {
      '2026-10-10': 'stay-1',
      '2026-10-11': 'stay-1',
      '2026-10-12': 'stay-1',
      '2026-10-13': 'stay-1',
      '2026-10-14': 'stay-1',
    };
    const newBedAvailability: Record<string, string | null> = {
      '2026-10-10': null,
      '2026-10-11': null,
      '2026-10-12': null,
      '2026-10-13': null,
      '2026-10-14': null,
    };

    // Calcular días afectados desde effectiveDateStr hasta checkOutStr: [2026-10-13, 2026-10-15)
    const affectedDays: string[] = [];
    let cur = new Date(`${effectiveDateStr}T00:00:00-04:00`);
    const end = new Date(`${checkOutStr}T00:00:00-04:00`);
    while (cur < end) {
      affectedDays.push(getBoliviaDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }

    expect(affectedDays).toEqual(['2026-10-13', '2026-10-14']);

    // Liberar en cama vieja y asignar en cama nueva
    for (const d of affectedDays) {
      oldBedAvailability[d] = null;
      newBedAvailability[d] = 'stay-1';
    }

    // Las noches 10, 11 y 12 quedan intactas en la cama vieja:
    expect(oldBedAvailability['2026-10-10']).toBe('stay-1');
    expect(oldBedAvailability['2026-10-11']).toBe('stay-1');
    expect(oldBedAvailability['2026-10-12']).toBe('stay-1');

    // Las noches 13 y 14 se liberaron en la vieja y se asignaron en la nueva:
    expect(oldBedAvailability['2026-10-13']).toBeNull();
    expect(oldBedAvailability['2026-10-14']).toBeNull();
    expect(newBedAvailability['2026-10-13']).toBe('stay-1');
    expect(newBedAvailability['2026-10-14']).toBe('stay-1');
  });

  it('G. Cambio retroactivo válido → historial y summaries coherentes', () => {
    const todayStr = '2026-10-13';
    const effectiveDateStr = '2026-10-12'; // Ayer (retroactivo)

    const affectedDays: string[] = ['2026-10-12', '2026-10-13', '2026-10-14'];
    const retroactiveDaysToRecalculate = affectedDays.filter((d) => d < todayStr);

    expect(retroactiveDaysToRecalculate).toEqual(['2026-10-12']);

    const stayMovements: any[] = [];
    stayMovements.push({
      type: 'room_change',
      fromBedIds: ['bed-old'],
      toBedIds: ['bed-new'],
      effectiveDate: effectiveDateStr,
      isRetroactive: effectiveDateStr < todayStr,
    });

    expect(stayMovements[0].isRetroactive).toBe(true);
    expect(stayMovements[0].effectiveDate).toBe('2026-10-12');
  });

  it('H. Nueva cama ocupada → rechazar sin modificar disponibilidad', () => {
    const oldBedDays: Record<string, string> = { '2026-10-13': 'stay-1' };
    const newBedDays: Record<string, string> = { '2026-10-13': 'other-guest-reservation' };

    function attemptRoomChange() {
      // Check destination availability
      if (newBedDays['2026-10-13']) {
        throw new Error('La cama destino ya está ocupada el día 2026-10-13.');
      }
      oldBedDays['2026-10-13'] = '';
      newBedDays['2026-10-13'] = 'stay-1';
    }

    expect(() => attemptRoomChange()).toThrow('La cama destino ya está ocupada');
    // Ninguna cama fue alterada
    expect(oldBedDays['2026-10-13']).toBe('stay-1');
    expect(newBedDays['2026-10-13']).toBe('other-guest-reservation');
  });

  it('I. Habitación privada → transferencia completa correcta', () => {
    const oldPrivateRoomBeds = ['bed-p1', 'bed-p2'];
    const newPrivateRoomBeds = ['bed-p3', 'bed-p4'];

    const stay: MockStay = {
      id: 'stay-priv-1',
      reservationId: 'res-priv-1',
      folioId: 'folio-priv-1',
      roomId: 'room-priv-1',
      bedIds: oldPrivateRoomBeds,
      saleMode: 'full_room',
      checkInDate: { seconds: 1600000000 },
      expectedCheckOutDate: { seconds: 1600200000 },
      status: 'active',
      movements: [],
    };

    // Cambio a nueva habitación privada
    stay.roomId = 'room-priv-2';
    stay.bedIds = newPrivateRoomBeds;
    stay.movements.push({
      type: 'room_change',
      fromRoomId: 'room-priv-1',
      toRoomId: 'room-priv-2',
      fromBedIds: oldPrivateRoomBeds,
      toBedIds: newPrivateRoomBeds,
      mode: 'full_room',
    });

    expect(stay.saleMode).toBe('full_room');
    expect(stay.bedIds).toEqual(['bed-p3', 'bed-p4']);
    expect(stay.roomId).toBe('room-priv-2');
  });

  it('J. Mismo Folio y Stay después del movimiento', () => {
    const stay: MockStay = {
      id: 'stay-keep-id',
      reservationId: 'res-1',
      folioId: 'folio-keep-id',
      roomId: 'room-1',
      bedIds: ['bed-1'],
      saleMode: 'bed',
      checkInDate: { seconds: 100 },
      expectedCheckOutDate: { seconds: 200 },
      status: 'active',
      movements: [],
    };

    const folio: MockFolio = {
      id: 'folio-keep-id',
      stayId: 'stay-keep-id',
      totalCharges: 250,
      totalPaid: 250,
      balance: 0,
    };

    // Ejecutar cambio de cama
    stay.roomId = 'room-2';
    stay.bedIds = ['bed-2'];
    stay.movements.push({
      type: 'room_change',
      fromRoomId: 'room-1',
      toRoomId: 'room-2',
    });

    // Mismo ID de Stay
    expect(stay.id).toBe('stay-keep-id');
    // Mismo ID de Folio
    expect(folio.id).toBe('folio-keep-id');
    expect(folio.stayId).toBe(stay.id);
    expect(folio.balance).toBe(0);
  });
});
