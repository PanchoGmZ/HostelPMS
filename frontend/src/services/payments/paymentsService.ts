import { apiPost } from '../api/apiClient'
import type { RecordPaymentPayload } from '../../types/folios'

export async function recordPayment(data: RecordPaymentPayload) {
  return await apiPost<{ success: boolean; paymentId: string }>(
    '/api/recordPayment',
    data
  )
}

export async function recordRefund(data: { establishmentId: string, stayId: string, paymentId: string, amount: number }) {
  return await apiPost<{ success: boolean; refundId: string }>(
    '/api/recordRefund',
    data
  )
}

export const processPayment = recordPayment


export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta de Débito/Crédito' },
  { id: 'transfer', label: 'Transferencia Bancaria' },
  { id: 'qr', label: 'Pago QR' },
] as const
