import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase/config'
import type { ChangeBedPayload, CheckInPayload, CheckOutPayload, ExtendStayPayload, Stay } from '../../types/stays'

export async function listStays(establishmentId: string): Promise<Stay[]> {
  const reference = collection(db, `establishments/${establishmentId}/stays`)
  const snapshot = await getDocs(query(reference, orderBy('checkInDate', 'desc')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Stay[]
}

export async function checkInGuest(data: CheckInPayload) {
  const callable = httpsCallable<CheckInPayload, { success: boolean; stayId: string }>(
    getFunctions(),
    'checkInGuest'
  )
  return (await callable(data)).data
}

export async function checkOutGuest(data: CheckOutPayload) {
  const callable = httpsCallable<CheckOutPayload, { success: boolean; stayId: string }>(
    getFunctions(),
    'checkOutGuest'
  )
  return (await callable(data)).data
}

export async function changeBed(data: ChangeBedPayload) {
  const callable = httpsCallable<ChangeBedPayload, { success: boolean }>(
    getFunctions(),
    'changeBed'
  )
  return (await callable(data)).data
}

export async function extendStay(data: ExtendStayPayload) {
  const callable = httpsCallable<ExtendStayPayload, { success: boolean }>(
    getFunctions(),
    'extendStay'
  )
  return (await callable(data)).data
}

