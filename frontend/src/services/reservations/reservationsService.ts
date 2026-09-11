import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase/config'
import type { CancelReservationPayload, CreateReservationPayload, Reservation } from '../../types/reservations'

const path = (id: string) => `establishments/${id}/reservations`

export async function listReservations(establishmentId: string): Promise<Reservation[]> {
  const snapshot = await getDocs(query(collection(db, path(establishmentId)), orderBy('checkInDate', 'desc')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Reservation[]
}

export async function createReservation(data: CreateReservationPayload) {
  const callable = httpsCallable<CreateReservationPayload, { success: boolean; reservationId: string; totalAmount: number }>(
    getFunctions(),
    'createReservation'
  )
  return (await callable(data)).data
}

export async function cancelReservation(data: CancelReservationPayload) {
  const callable = httpsCallable<CancelReservationPayload, { success: boolean; message?: string }>(
    getFunctions(),
    'cancelReservation'
  )
  return (await callable(data)).data
}

