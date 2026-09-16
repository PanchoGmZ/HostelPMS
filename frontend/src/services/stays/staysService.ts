import { collection, getDocs, orderBy, query } from 'firebase/firestore'

import { db } from '../firebase/config'
import { apiPost } from '../api/apiClient'
import type { ChangeBedPayload, CheckInPayload, CheckOutPayload, ExtendStayPayload, Stay } from '../../types/stays'

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

export async function extendStay(data: ExtendStayPayload) {
  return await apiPost<{ success: boolean; message?: string }>(
    '/api/extendStay',
    data
  )
}

