import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { apiPost } from '../api/apiClient'
import type {
  CancelReservationPayload,
  CreateReservationPayload,
  ModifyReservationPayload,
  Reservation,
} from '../../types/reservations'

const path = (id: string) => `establishments/${id}/reservations`

export async function listReservations(establishmentId: string): Promise<Reservation[]> {
  const snapshot = await getDocs(query(collection(db, path(establishmentId)), orderBy('checkInDate', 'desc')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Reservation[]
}

export async function createReservation(data: CreateReservationPayload) {
  return await apiPost<{ success: boolean; reservationId: string; totalAmount: number }>(
    '/api/createReservation',
    data
  )
}

export async function cancelReservation(data: CancelReservationPayload) {
  return await apiPost<{ success: boolean; message?: string }>(
    '/api/cancelReservation',
    data
  )
}

// v1.7
export async function modifyReservation(data: ModifyReservationPayload) {
  return await apiPost<{ success: boolean; message?: string; newTotalAmount?: number }>(
    '/api/modifyReservation',
    data
  )
}
