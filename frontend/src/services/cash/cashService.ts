import { collection, getDocs, orderBy, query } from 'firebase/firestore'

import { apiPost } from '../api/apiClient'
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
  return await apiPost<{ success: boolean; message: string }>(
    '/api/openCashShift',
    data
  )
}

export async function closeCashShift(data: CloseShiftPayload) {
  return await apiPost<{ success: boolean; shiftId: string; discrepancy: number }>(
    '/api/closeCashShift',
    data
  )
}

export async function addCashMovement(data: AddMovementPayload) {
  return await apiPost<{ success: boolean; movementId: string }>(
    '/api/addCashMovement',
    data
  )
}

export function calculateCashSummary(activeShift: CashShift | undefined) {
  if (!activeShift) return { cashIn: 0, cashOut: 0, expectedTotal: 0 }
  let cashIn = 0
  let cashOut = 0

  activeShift.movements?.forEach((m) => {
    if (m.method === 'cash' || !m.method) {
      if (m.type === 'in' || m.type === 'pago_folio') {
        cashIn += m.amount ?? 0
      } else if (m.type === 'out') {
        cashOut += m.amount ?? 0
      }
    }
  })

  const expectedTotal = (activeShift.openingAmount ?? 0) + cashIn - cashOut
  return { cashIn, cashOut, expectedTotal }
}

