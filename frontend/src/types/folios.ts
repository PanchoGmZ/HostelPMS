export interface Charge {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  status: string
  productId?: string | null
  type?: string
  serviceDate?: { seconds: number }
  createdAt: { seconds: number }
}

export interface PaymentAllocation {
  type: 'lodging' | 'consumption' | 'other' | 'unassigned'
  amount: number
}

export interface Payment {
  id: string
  amount: number
  method: string
  status: string
  reference?: string | null
  currencyCode?: string
  receivedAmount?: number
  allocations?: PaymentAllocation[]
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
  items: { productId: string; quantity: number }[]
  payNow?: {
    method: 'cash' | 'card' | 'transfer' | 'qr'
    reference?: string
    currencyCode?: string
    receivedAmount?: number
  }
}

export type AddChargePayload = AddConsumptionPayload

export interface RecordPaymentPayload {
  establishmentId: string
  stayId: string
  amount: number
  method: string
  reference?: string | null
  currencyCode?: string
  receivedAmount?: number
  idempotencyKey?: string
  expectedBalance?: number
  allocations?: PaymentAllocation[]
}

export type ProcessPaymentPayload = RecordPaymentPayload
