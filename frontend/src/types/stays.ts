export type StayStatus = 'active' | 'checked_out'

export interface StayMovement {
  id: string
  type: 'check_in' | 'check_out' | 'bed_change'
  description: string
  createdBy: string
  createdAt: { seconds: number }
}

export interface Stay {
  id: string
  reservationId: string | null
  guestIds: string[]
  roomId: string
  bedIds: string[]
  checkInDate: { seconds: number }
  expectedCheckOutDate: { seconds: number }
  actualCheckOutDate?: { seconds: number } | null
  status: StayStatus
  deposit: number
  documentVerified: boolean
  createdBy: string
  createdAt: { seconds: number }
  updatedAt: { seconds: number }
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
}

export interface CheckOutPayload {
  establishmentId: string
  stayId: string
  notes?: string
}

export interface ChangeBedPayload {
  establishmentId: string
  reservationId: string
  lineId: string
  newBedId: string
}

export interface ExtendStayPayload {
  establishmentId: string
  stayId: string
  newCheckOutDate: string
  extraCharges?: number
}


