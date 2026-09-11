import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase/config'
import type { AddMovementPayload, CashMovement, CashShift, CloseShiftPayload, OpenShiftPayload } from '../../types/cash'

export async function listCashShifts(establishmentId: string): Promise<CashShift[]> {
  const snapshot = await getDocs(query(collection(db, `establishments/${establishmentId}/cashShifts`), orderBy('openedAt', 'desc')))
  return Promise.all(
    snapshot.docs.map(async (item) => {
      const movements = await getDocs(collection(item.ref, 'movements'))
      return {
        id: item.id,
        ...item.data(),
        movements: movements.docs.map((movement) => ({ id: movement.id, ...movement.data() })) as CashMovement[],
      } as CashShift
    })
  )
}

export async function openCashShift(data: OpenShiftPayload) {
  const callable = httpsCallable<OpenShiftPayload, { success: boolean; shiftId: string }>(
    getFunctions(),
    'openCashShift'
  )
  return (await callable(data)).data
}

export async function closeCashShift(data: CloseShiftPayload) {
  const callable = httpsCallable<CloseShiftPayload, { success: boolean; shiftId: string; discrepancy: number }>(
    getFunctions(),
    'closeCashShift'
  )
  return (await callable(data)).data
}

export async function addCashMovement(data: AddMovementPayload) {
  const callable = httpsCallable<AddMovementPayload, { success: boolean; movementId: string }>(
    getFunctions(),
    'addCashMovement'
  )
  return (await callable(data)).data
}

