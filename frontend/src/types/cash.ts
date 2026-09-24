export type CashShiftStatus = 'open' | 'closed'

export interface CashMovement {
  id: string
  type: string
  amount: number
  method: string
  description?: string
  relatedFolioId?: string | null
  createdBy: string
  currencyCode?: string
  receivedAmount?: number
  createdAt: { seconds: number }
}

export interface CashShift {
  id: string
  establishmentId: string
  status: CashShiftStatus
  openingAmount: number
  closingAmount?: number | null
  openedBy: string
  closedBy?: string | null
  openedAt: { seconds: number }
  closedAt?: { seconds: number } | null
  movements: CashMovement[]
  totalExpected?: number
  totalActual?: number
  createdAt: { seconds: number }
  updatedAt: { seconds: number }
}

export interface OpenShiftPayload {
  establishmentId: string
  openingAmount: number
  notes?: string | null
}

export interface CloseShiftPayload {
  establishmentId: string
  cashShiftId: string
  closingAmount: number
  notes?: string | null
}


export interface AddMovementPayload {
  establishmentId: string
  shiftId: string
  type: 'in' | 'out'
  amount: number
  method: 'cash' | 'card' | 'transfer' | 'qr'
  currencyCode?: string
  receivedAmount?: number
  description: string
}

