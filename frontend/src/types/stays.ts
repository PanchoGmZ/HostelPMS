export type StayStatus = 'active' | 'checked_out'

export interface StayMovement {
  id: string
  type: 'check_in' | 'check_out' | 'bed_change' | 'room_change'
  description: string
  createdBy: string
  createdAt: { seconds: number }
  // v1.17: campos extra para room_change
  fromRoomId?: string
  fromBedIds?: string[]
  toRoomId?: string
  toBedIds?: string[]
  effectiveDate?: string
  reason?: string
}

export interface Stay {
  id: string
  reservationId: string | null
  primaryGuestId?: string | null
  guestIds: string[]
  roomId: string
  bedIds: string[]
  checkInDate: { seconds: number }
  expectedCheckOutDate: { seconds: number }
  actualCheckOutDate?: { seconds: number } | null
  status: StayStatus
  guestCount?: number
  deposit: number
  documentVerified: boolean
  createdBy: string
  createdAt: { seconds: number }
  updatedAt: { seconds: number }
  // v1.17: historial de movimientos/ubicaciones
  movements?: StayMovement[]
  saleMode?: 'bed' | 'full_room'
}

// v1.17: Pago inicial en Check-in
export interface CheckInInitialPayment {
  amount: number
  method: 'cash' | 'card' | 'transfer' | 'qr'
  reference?: string | null
  currencyCode?: string
  receivedAmount?: number
}

export interface CheckInPayload {
  establishmentId: string
  reservationId?: string | null
  guestIds: string[]
  roomId: string
  bedIds: string[]
  expectedCheckOutDate: string
  deposit: number
  documentVerified: boolean
  // v1.17: pago opcional en el momento del check-in
  initialPayment?: CheckInInitialPayment
}

export interface CheckOutPayload {
  establishmentId: string
  stayId: string
  actualCheckOutDate?: string   // v1.17: YYYY-MM-DD, default = hoy
  notes?: string
}

export interface ChangeBedPayload {
  establishmentId: string
  reservationId: string
  lineId: string
  newBedId: string
}

// v1.17: Cambio de cama/habitación durante estadía activa (sin checkout)
export interface ChangeBedInStayPayload {
  establishmentId: string
  stayId: string
  toRoomId: string
  toBedIds: string[]
  effectiveDate: string   // YYYY-MM-DD, default = hoy
  reason?: string
}

export interface ExtendStayPayload {
  establishmentId: string
  stayId: string
  newCheckOutDate: string
  extraCharges?: number
  // v1.17: precio por noche explícito si no es reconstruible
  pricePerExtraNight?: number
}
