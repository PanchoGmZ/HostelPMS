import { collection, doc, endAt, getDocs, orderBy, query, serverTimestamp, setDoc, startAt, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Guest } from '../../types/guests'

const path = (establishmentId: string) => `establishments/${establishmentId}/guests`
export async function searchGuests(establishmentId: string, text: string): Promise<Guest[]> {
  const term = text.trim().toLowerCase()
  const constraints = term ? [orderBy('searchName'), startAt(term), endAt(`${term}\uf8ff`)] : [orderBy('searchName')]
  const snapshot = await getDocs(query(collection(db, path(establishmentId)), ...constraints))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Guest[]
}
export async function saveGuest(establishmentId: string, guest: Omit<Guest, 'id' | 'searchName'>, guestId?: string) {
  const reference = guestId ? doc(db, path(establishmentId), guestId) : doc(collection(db, path(establishmentId)))
  const searchName = `${guest.firstName} ${guest.lastName}`.trim().toLowerCase()
  const payload = { ...guest, searchName, updatedAt: serverTimestamp() }
  if (guestId) await updateDoc(reference, payload)
  else await setDoc(reference, { ...payload, createdAt: serverTimestamp() })
}
