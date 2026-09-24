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
  if (!activeShift) return { cashIn: 0, cashOut: 0, expectedTotal: 0, byCurrency: {} }
  let cashIn = 0
  let cashOut = 0

  const byCurrency: Record<string, { in: number; out: number; expected: number }> = {}

  activeShift.movements?.forEach((m) => {
    if (m.method === 'cash' || !m.method) {
      const cur = m.currencyCode || 'BOB'
      const amount = m.receivedAmount ?? m.amount ?? 0

      if (!byCurrency[cur]) byCurrency[cur] = { in: 0, out: 0, expected: 0 }

      if (m.type === 'in' || m.type === 'payment' || m.type === 'pago_folio') {
        cashIn += m.amount ?? 0
        byCurrency[cur].in += amount
      } else if (m.type === 'out') {
        cashOut += m.amount ?? 0
        byCurrency[cur].out += amount
      }
    }
  })

  if (!byCurrency['BOB']) byCurrency['BOB'] = { in: 0, out: 0, expected: 0 }
  
  Object.keys(byCurrency).forEach(cur => {
    let opening = 0;
    if (cur === 'BOB') opening = activeShift.openingAmount ?? 0;
    byCurrency[cur].expected = opening + byCurrency[cur].in - byCurrency[cur].out;
  })

  const expectedTotal = (activeShift.openingAmount ?? 0) + cashIn - cashOut
  return { cashIn, cashOut, expectedTotal, byCurrency }
}

