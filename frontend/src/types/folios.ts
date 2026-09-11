export interface Charge {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  status: string
  productId?: string | null
  createdAt: { seconds: number }
}

export interface Payment {
  id: string
  amount: number
  method: string
  status: string
  reference?: string | null
  createdAt: { seconds: number }
}

export interface Folio {
  id: string
  stayId: string
  currency: string
  totalCharges: number
  totalPaid: number
  balance: number
  status: string
  charges: Charge[]
  payments: Payment[]
  createdAt: { seconds: number }
  updatedAt: { seconds: number }
}

export interface AddConsumptionPayload {
  establishmentId: string
  stayId: string
  description: string
  quantity: number
  unitPrice: number
  productId?: string | null
}

export type AddChargePayload = AddConsumptionPayload

export interface RecordPaymentPayload {
  establishmentId: string
  stayId: string
  amount: number
  method: string
  reference?: string | null
}

export type ProcessPaymentPayload = RecordPaymentPayload


