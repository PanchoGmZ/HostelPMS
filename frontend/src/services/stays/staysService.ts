import { collection, getDocs, orderBy, query } from 'firebase/firestore'

import { db } from '../firebase/config'
import { apiPost } from '../api/apiClient'
import type { ChangeBedPayload, ChangeBedInStayPayload, CheckInPayload, CheckOutPayload, ExtendStayPayload, Stay } from '../../types/stays'

export async function listStays(establishmentId: string): Promise<Stay[]> {
  const reference = collection(db, `establishments/${establishmentId}/stays`)
  const snapshot = await getDocs(query(reference, orderBy('checkInDate', 'desc')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Stay[]
}

export async function checkInGuest(data: CheckInPayload) {
  return await apiPost<{ success: boolean; stayId: string }>(
    '/api/checkInGuest',
    data
  )
}

export async function checkOutGuest(data: CheckOutPayload) {
  return await apiPost<{ success: boolean; message: string }>(
    '/api/checkOutGuest',
    data
  )
}

export async function changeBed(data: ChangeBedPayload) {
  return await apiPost<{ success: boolean; message?: string }>(
    '/api/changeBed',
    data
  )
}

// v1.17: cambio de habitación/cama durante estadía activa sin checkout
export async function changeBedInStay(data: ChangeBedInStayPayload) {
  return await apiPost<{ success: boolean; message?: string }>(
    '/api/changeBedInStay',
    data
  )
}

export async function extendStay(data: ExtendStayPayload) {
  return await apiPost<{ success: boolean; message?: string }>(
    '/api/extendStay',
    data
  )
}
