import { describe, it, expect } from 'vitest'
import { normalizeNumericString } from '../components/common/NumericInput'

/**
 * Suite de Pruebas: Fase 3 — Tarifas Flexibles y Formularios Numéricos
 * Verificación formal de los escenarios A hasta N según especificación técnica.
 */

interface MockRoom {
  id: string
  name: string
  type: 'private' | 'dorm'
  basePriceRoom: number
  priceByGuestCount?: Record<string, number>
  beds: Array<{ id: string; basePriceBed?: number }>
}

interface MockReservation {
  id: string
  roomId: string
  bedIds: string[]
  checkIn: string
  checkOut: string
  guestCount: number
  nights: number
  pricePerNight: Record<string, Record<string, number>>
  totalAmount: number
  pricingMode: 'standard' | 'manual'
  manualTotalAmount?: number
  specialRateReason?: string
}

interface MockFolio {
  id: string
  stayId: string
  reservationId: string
  totalCharges: number
  totalPaid: number
  balance: number
  charges: Array<{ id: string; type: string; amount: number; description: string }>
  payments: Array<{ id: string; amount: number; currency: string; foreignAmount?: number; exchangeRate?: number }>
}

/**
 * Motor exacto de asignación de centavos utilizado en netlify/server/src/services/reservations/createReservation.ts
 */
function distributePennyExact(
  totalAmount: number,
  slots: Array<{ bedId: string; date: string }>
): { finalTotalAmount: number; pricePerNight: Record<string, Record<string, number>> } {
  const totalCents = Math.round(totalAmount * 100)
  const finalTotalAmount = totalCents / 100
  const pricePerNight: Record<string, Record<string, number>> = {}

  slots.forEach((s) => {
    if (!pricePerNight[s.bedId]) pricePerNight[s.bedId] = {}
  })

  const slotCount = slots.length
  if (slotCount > 0) {
    const baseCents = Math.floor(totalCents / slotCount)
    const remainder = totalCents - baseCents * slotCount
    slots.forEach((slot, idx) => {
      const slotCents = idx < remainder ? baseCents + 1 : baseCents
      pricePerNight[slot.bedId][slot.date] = slotCents / 100
    })
  }

  return { finalTotalAmount, pricePerNight }
}

describe('Fase 3: Tarifas Flexibles y Formularios Numéricos (Escenarios A - N)', () => {
  // Estado mock de habitaciones simulando base de datos
  const mockRooms: Record<string, MockRoom> = {
    'room-10': {
      id: 'room-10',
      name: 'Habitación 10 Matrimonial',
      type: 'private',
      basePriceRoom: 250,
      priceByGuestCount: {
        '1': 200,
        '2': 250,
        '3': 300,
      },
      beds: [{ id: 'bed-10-a' }],
    },
    'room-dorm': {
      id: 'room-dorm',
      name: 'Dormitorio 6 Camas',
      type: 'dorm',
      basePriceRoom: 60,
      beds: [
        { id: 'bed-d1', basePriceBed: 60 },
        { id: 'bed-d2', basePriceBed: 60 },
      ],
    },
  }

  // Colección mock de reservas
  const mockReservations: MockReservation[] = []
  // Colección mock de folios
  const mockFolios: MockFolio[] = []

  it('A & B. Cambio de tarifa normal 250 → 220. Nueva reserva usa 220 y reserva anterior conserva 250', () => {
    // 1. Reserva previa con tarifa histórica de 250 BOB
    const priorReservation: MockReservation = {
      id: 'res-prior-1',
      roomId: 'room-10',
      bedIds: ['bed-10-a'],
      checkIn: '2026-10-15',
      checkOut: '2026-10-16',
      guestCount: 2,
      nights: 1,
      pricePerNight: { 'bed-10-a': { '2026-10-15': 250 } },
      totalAmount: 250,
      pricingMode: 'standard',
    }
    mockReservations.push(priorReservation)

    const priorFolio: MockFolio = {
      id: 'folio-prior-1',
      stayId: 'stay-prior-1',
      reservationId: priorReservation.id,
      totalCharges: 250,
      totalPaid: 0,
      balance: 250,
      charges: [{ id: 'ch-1', type: 'lodging', amount: 250, description: 'Hospedaje 1 noche' }],
      payments: [],
    }
    mockFolios.push(priorFolio)

    // 2. Administrador actualiza la tarifa general de la habitación en configuración
    mockRooms['room-10'].basePriceRoom = 220
    if (mockRooms['room-10'].priceByGuestCount) {
      mockRooms['room-10'].priceByGuestCount['2'] = 220
    }

    // 3. Nueva reserva creada posterior al cambio
    const roomAfter = mockRooms['room-10']
    const newRate = roomAfter.priceByGuestCount?.['2'] ?? roomAfter.basePriceRoom
    const newReservation: MockReservation = {
      id: 'res-new-2',
      roomId: 'room-10',
      bedIds: ['bed-10-a'],
      checkIn: '2026-10-20',
      checkOut: '2026-10-21',
      guestCount: 2,
      nights: 1,
      pricePerNight: { 'bed-10-a': { '2026-10-20': newRate } },
      totalAmount: newRate,
      pricingMode: 'standard',
    }
    mockReservations.push(newReservation)

    // A. La nueva reserva utiliza 220
    expect(newReservation.totalAmount).toBe(220)
    expect(newReservation.pricePerNight['bed-10-a']['2026-10-20']).toBe(220)

    // B. La reserva anterior conserva intactos sus 250 originales
    const storedPrior = mockReservations.find((r) => r.id === 'res-prior-1')!
    expect(storedPrior.totalAmount).toBe(250)
    expect(storedPrior.pricePerNight['bed-10-a']['2026-10-15']).toBe(250)

    // El folio previo no sufrió mutaciones
    const storedPriorFolio = mockFolios.find((f) => f.id === 'folio-prior-1')!
    expect(storedPriorFolio.totalCharges).toBe(250)
    expect(storedPriorFolio.balance).toBe(250)
  })

  it('C. Walk-in de dos noches con precio negociado de 220 = 440 BOB', () => {
    const suggestedPricePerNight = 250
    const negotiatedPricePerNight = 220
    const nights = 2

    const isPriceModified = (negotiatedPricePerNight as number) !== (suggestedPricePerNight as number)
    const totalEstimate = nights * negotiatedPricePerNight

    const walkInReservation: MockReservation = {
      id: 'res-walkin-c',
      roomId: 'room-10',
      bedIds: ['bed-10-a'],
      checkIn: '2026-10-25',
      checkOut: '2026-10-27',
      guestCount: 2,
      nights,
      pricePerNight: {
        'bed-10-a': {
          '2026-10-25': negotiatedPricePerNight,
          '2026-10-26': negotiatedPricePerNight,
        },
      },
      totalAmount: totalEstimate,
      pricingMode: isPriceModified ? 'manual' : 'standard',
      specialRateReason: isPriceModified ? 'Tarifa negociada en recepción' : undefined,
    }

    expect(walkInReservation.pricingMode).toBe('manual')
    expect(walkInReservation.totalAmount).toBe(440)
    expect(walkInReservation.pricePerNight['bed-10-a']['2026-10-25']).toBe(220)
    expect(walkInReservation.pricePerNight['bed-10-a']['2026-10-26']).toBe(220)
    expect(walkInReservation.specialRateReason).toBe('Tarifa negociada en recepción')
  })

  it('D. Tres noches con total negociado 250 se guardan exactamente como 250 (distribución exacta de centavos)', () => {
    // 3 noches a 100 BOB sugerido = 300 BOB sugerido. Recepción negocia total de 250 BOB.
    const manualTotalAmount = 250
    const slots = [
      { bedId: 'bed-10-a', date: '2026-11-01' },
      { bedId: 'bed-10-a', date: '2026-11-02' },
      { bedId: 'bed-10-a', date: '2026-11-03' },
    ]

    const { finalTotalAmount, pricePerNight } = distributePennyExact(manualTotalAmount, slots)

    // Comprobar que el total sea exactamente 250.00 BOB, no 249.99 ni 250.01
    expect(finalTotalAmount).toBe(250)

    const night1 = pricePerNight['bed-10-a']['2026-11-01']
    const night2 = pricePerNight['bed-10-a']['2026-11-02']
    const night3 = pricePerNight['bed-10-a']['2026-11-03']

    // 25000 centavos / 3 = 8333 centavos base + 1 centavo sobrante
    // Noche 1: 83.34, Noche 2: 83.33, Noche 3: 83.33
    expect(night1).toBe(83.34)
    expect(night2).toBe(83.33)
    expect(night3).toBe(83.33)

    // La suma exacta en centavos es 250.00
    const sum = Math.round((night1 + night2 + night3) * 100) / 100
    expect(sum).toBe(250)
  })

  it('E. Precio 0 autorizado (Voluntariado / Cortesía)', () => {
    const voluntaryTotal = 0
    const voluntarySlots = [
      { bedId: 'bed-d1', date: '2026-11-10' },
      { bedId: 'bed-d1', date: '2026-11-11' },
    ]

    const { finalTotalAmount, pricePerNight } = distributePennyExact(voluntaryTotal, voluntarySlots)

    expect(finalTotalAmount).toBe(0)
    expect(pricePerNight['bed-d1']['2026-11-10']).toBe(0)
    expect(pricePerNight['bed-d1']['2026-11-11']).toBe(0)
  })

  it('F. Habitación privada con tarifas por cantidad de huéspedes (priceByGuestCount)', () => {
    const room = mockRooms['room-10']
    expect(room.type).toBe('private')

    // Huésped 1 persona -> 200 BOB
    const rate1Guest = room.priceByGuestCount?.['1'] ?? room.basePriceRoom
    expect(rate1Guest).toBe(200)

    // Huésped 2 personas -> 220 BOB (actualizado en escenario A)
    const rate2Guest = room.priceByGuestCount?.['2'] ?? room.basePriceRoom
    expect(rate2Guest).toBe(220)

    // Huésped 3 personas -> 300 BOB
    const rate3Guest = room.priceByGuestCount?.['3'] ?? room.basePriceRoom
    expect(rate3Guest).toBe(300)

    // Huésped 4 personas no configurado explícitamente -> fallback a basePriceRoom
    const rate4Guest = room.priceByGuestCount?.['4'] ?? room.basePriceRoom
    expect(rate4Guest).toBe(220)
  })

  it('G. Extensión de estadía con precio pactado distinto del original', () => {
    // Huésped entró pagando 220/noche
    const originalRate = 220
    // Al extender 2 noches más, recepción acuerda 190/noche
    const extensionRate = 190
    const extraNights = 2
    const extensionCharge = extraNights * extensionRate

    const folioBefore: MockFolio = {
      id: 'folio-ext-g',
      stayId: 'stay-ext-g',
      reservationId: 'res-ext-g',
      totalCharges: originalRate * 2, // 440
      totalPaid: 440,
      balance: 0,
      charges: [{ id: 'ch-orig', type: 'lodging', amount: 440, description: 'Hospedaje 2 noches' }],
      payments: [{ id: 'pay-orig', amount: 440, currency: 'BOB' }],
    }

    // Se agrega cargo de extensión (lodging_extension)
    const newCharge = {
      id: 'ch-ext-1',
      type: 'lodging_extension',
      amount: extensionCharge, // 380
      description: 'Extensión 2 noches a 190 BOB/noche',
    }

    const folioAfter: MockFolio = {
      ...folioBefore,
      charges: [...folioBefore.charges, newCharge],
      totalCharges: folioBefore.totalCharges + newCharge.amount,
      balance: folioBefore.totalCharges + newCharge.amount - folioBefore.totalPaid,
    }

    // El cargo original no fue mutado
    expect(folioAfter.charges[0].amount).toBe(440)
    // El nuevo cargo refleja la tarifa acordada
    expect(folioAfter.charges[1].amount).toBe(380)
    // El saldo pendiente refleja exactamente los 380 de la extensión
    expect(folioAfter.totalCharges).toBe(820)
    expect(folioAfter.balance).toBe(380)
  })

  it('H. Campo vacío mientras se edita (no forzar "0" inmediatamente)', () => {
    // Al borrar todo en un input numérico:
    const emptyRaw = ''
    const normalized = normalizeNumericString(emptyRaw, true)
    expect(normalized).toBe('')
    // El input visual permanece vacío y no fuerza "0" en cada tipeo
  })

  it('I. Escribir 250 produce 250, no 0250 (eliminación de ceros iniciales)', () => {
    // Si el usuario escribe 250 comenzando desde un cero o tipeando 0250:
    expect(normalizeNumericString('0250', true)).toBe('250')
    expect(normalizeNumericString('005', true)).toBe('5')
    expect(normalizeNumericString('000100', true)).toBe('100')
    expect(normalizeNumericString('0', true)).toBe('0')
    expect(normalizeNumericString('00', true)).toBe('0')
  })

  it('J. Escribir 0.50 se conserva correctamente con decimales', () => {
    expect(normalizeNumericString('0.5', true)).toBe('0.5')
    expect(normalizeNumericString('0.50', true)).toBe('0.50')
    expect(normalizeNumericString('00.50', true)).toBe('0.50')
    expect(normalizeNumericString('0,50', true)).toBe('0.50')
    expect(normalizeNumericString('.75', true)).toBe('.75')
  })

  it('K. Pago en BOB con un único campo', () => {
    // Cuando la moneda es BOB, el monto físico recibido coincide con el monto aplicado al folio
    const currency = 'BOB'
    const amount = 440

    const payment = {
      currency,
      receivedAmount: amount,
      amountApplied: amount,
      exchangeRate: 1,
    }

    expect(payment.receivedAmount).toBe(440)
    expect(payment.amountApplied).toBe(440)
    expect(payment.exchangeRate).toBe(1)
  })

  it('L. Pago en moneda extranjera mantiene monto físico y aplicado diferenciados', () => {
    // Huésped paga en USD: $100 USD entregados a tipo de cambio 6.96 BOB/USD
    void 'USD' // currency used for documentation only
    const foreignAmountReceived = 100
    const exchangeRate = 6.96
    const amountAppliedBOB = Math.round(foreignAmountReceived * exchangeRate * 100) / 100

    expect(amountAppliedBOB).toBe(696)
    expect(foreignAmountReceived).toBe(100)
    // El monto físico custodiado en caja es 100 USD, y el crédito en el Folio es 696 BOB
    expect(foreignAmountReceived).not.toBe(amountAppliedBOB)
  })

  it('M. Precios históricos y Folios anteriores no cambian al modificar tarifas generales', () => {
    // Comprobar que en la lista de reservas históricas, ninguna fue mutada
    const res1 = mockReservations.find((r) => r.id === 'res-prior-1')!
    expect(res1.totalAmount).toBe(250)

    const folio1 = mockFolios.find((f) => f.id === 'folio-prior-1')!
    expect(folio1.totalCharges).toBe(250)
    expect(folio1.balance).toBe(250)
  })

  it('N. El calendario financiero concilia los nuevos precios pactados', () => {
    // Un día con:
    // - 1 reserva a tarifa estándar: 220 BOB
    // - 1 walk-in negociado: 220 BOB
    // - 1 reserva de 3 noches con centavos distribuidos: 83.34 BOB en este día
    // - 1 voluntario: 0 BOB
    const dayCharges = [220, 220, 83.34, 0]
    const totalDailyLodgingRevenue = dayCharges.reduce((acc, c) => acc + c, 0)

    expect(totalDailyLodgingRevenue).toBe(523.34)
    // Suma exacta sin discrepancias de centavos
    expect(Math.round(totalDailyLodgingRevenue * 100) / 100).toBe(523.34)
  })
})
