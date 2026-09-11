import { getFunctions, httpsCallable } from 'firebase/functions'
import type { RecordPaymentPayload } from '../../types/folios'

export async function recordPayment(data: RecordPaymentPayload) {
  const callable = httpsCallable<RecordPaymentPayload, { success: boolean; paymentId: string }>(
    getFunctions(),
    'recordPayment'
  )
  return (await callable(data)).data
}

export const processPayment = recordPayment


export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta de Débito/Crédito' },
  { id: 'transfer', label: 'Transferencia Bancaria' },
  { id: 'qr', label: 'Pago QR' },
] as const
