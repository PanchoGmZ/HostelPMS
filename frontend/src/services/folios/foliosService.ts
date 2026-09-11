import { collection, getDocs, query, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../firebase/config'
import type { AddConsumptionPayload, Charge, Folio, Payment } from '../../types/folios'



const foliosRef = (establishmentId: string) => collection(db, `establishments/${establishmentId}/folios`)

async function populateFolioDetails(folioDocument: import('firebase/firestore').DocumentSnapshot): Promise<Folio> {
  const base = { id: folioDocument.id, ...folioDocument.data() } as Folio
  const [charges, payments] = await Promise.all([
    getDocs(query(collection(folioDocument.ref, 'charges'), where('status', '!=', 'voided'))),
    getDocs(query(collection(folioDocument.ref, 'payments'), where('status', '!=', 'refunded'))),
  ])
  return {
    ...base,
    charges: charges.docs.map((item) => ({ id: item.id, ...item.data() })) as Charge[],
    payments: payments.docs.map((item) => ({ id: item.id, ...item.data() })) as Payment[],
  }
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
  const callable = httpsCallable<AddConsumptionPayload, { success: boolean; message: string }>(
    getFunctions(),
    'addConsumption'
  )
  return (await callable(data)).data
}

export const addChargeToFolio = addConsumption


