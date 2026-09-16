import { collection, getDocs, query, where } from 'firebase/firestore'

import { db } from '../firebase/config'
import { apiPost } from '../api/apiClient'
import type { AddConsumptionPayload, Folio } from '../../types/folios'



const foliosRef = (establishmentId: string) => collection(db, `establishments/${establishmentId}/folios`)

async function populateFolioDetails(folioDocument: import('firebase/firestore').DocumentSnapshot): Promise<Folio> {
  const data = folioDocument.data();
  return { 
    id: folioDocument.id, 
    ...data,
    charges: data?.charges || [],
    payments: data?.payments || [],
  } as Folio;
}

export async function listFolios(establishmentId: string): Promise<Folio[]> {
  const folioSnapshot = await getDocs(foliosRef(establishmentId))
  return Promise.all(folioSnapshot.docs.map((docSnap) => populateFolioDetails(docSnap)))
}

export async function getFolioByStayId(establishmentId: string, stayId: string): Promise<Folio | null> {
  const q = query(foliosRef(establishmentId), where('stayId', '==', stayId))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null
  return populateFolioDetails(snapshot.docs[0])
}

export async function addConsumption(data: AddConsumptionPayload) {
  return await apiPost<{ success: boolean; message: string; chargeId: string; paymentId?: string }>(
    '/api/addConsumption',
    data
  )
}

export const addChargeToFolio = addConsumption
