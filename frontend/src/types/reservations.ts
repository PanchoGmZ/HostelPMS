export type ReservationStatus = 'confirmed' | 'cancelled' | 'completed'

export interface ReservationLine {
  id: string
  bedId: string
  roomId: string
  saleMode: 'bed' | 'full_room'
  dateFrom: { seconds: number }
  dateTo: { seconds: number }
  guestId: string | null
  pricePerNight: Record<string, number>
  status: string
  createdAt: { seconds: number }
  updatedAt: { seconds: number }
}

export interface Reservation {
  id: string
  roomId: string
  bedIds: string[]
  primaryGuestId: string | null
  guestIds?: string[]
  checkInDate: { seconds: number }
  checkOutDate: { seconds: number }
  status: ReservationStatus
  channel: string
  totalAmount: number
  currency: string
  createdBy?: string
  createdAt?: { seconds: number }
  updatedAt?: { seconds: number }
  lines?: ReservationLine[]
  commissionPercent?: number
  guestCount?: number
  // v1.7: pricing mode + tarifa especial
  pricingMode?: 'standard' | 'manual'
  manualPricePerNight?: number | null
  specialRateReason?: string | null
  saleMode?: 'bed' | 'full_room'
}

export interface CreateReservationPayload {
  establishmentId: string
  guestId?: string
  saleMode: 'bed' | 'full_room'
  roomId: string
  bedIds: string[]
  checkIn: string
  checkOut: string
  pricePerNight: Record<string, Record<string, number>>
  channel: string
  commissionPercent?: number
  guestCount?: number
  guestIds?: string[]
  // v1.7
  pricingMode?: 'standard' | 'manual'
  manualPricePerNight?: number
  specialRateReason?: string
}

export interface CancelReservationPayload {
  establishmentId: string
  reservationId: string
  reason?: string
}

// v1.7
export interface ModifyReservationPayload {
  establishmentId: string
  reservationId: string
  primaryGuestId?: string
  guestIds?: string[]
  channel?: string
  commissionPercent?: number
  guestCount?: number
  pricingMode?: 'standard' | 'manual'
  manualPricePerNight?: number
  specialRateReason?: string
}
