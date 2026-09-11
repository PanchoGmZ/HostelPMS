import { collection, doc, getDocs, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { EstablishmentSettings, SettingItem } from '../../types/settings'

const root = (id: string) => `establishments/${id}`

export async function loadSettings(establishmentId: string) {
  const base = root(establishmentId)
  const [establishment, ratePlans, channels, promotions] = await Promise.all([
    getDoc(doc(db, base)),
    getDocs(collection(db, `${base}/ratePlans`)),
    getDocs(collection(db, `${base}/bookingChannels`)),
    getDocs(collection(db, `${base}/promotions`)),
  ])
  return {
    establishment: establishment.exists()
      ? ({ id: establishment.id, ...establishment.data() } as EstablishmentSettings)
      : null,
    ratePlans: ratePlans.docs.map((item) => ({ id: item.id, ...item.data() })) as SettingItem[],
    channels: channels.docs.map((item) => ({ id: item.id, ...item.data() })) as SettingItem[],
    promotions: promotions.docs.map((item) => ({ id: item.id, ...item.data() })) as SettingItem[],
  }
}

export async function saveSettings(
  establishmentId: string,
  values: Omit<EstablishmentSettings, 'id'>
) {
  await updateDoc(doc(db, root(establishmentId)), { ...values, updatedAt: serverTimestamp() })
}

export async function saveSettingItem(
  establishmentId: string,
  type: 'ratePlans' | 'bookingChannels' | 'promotions',
  item: Omit<SettingItem, 'id'>,
  id?: string
) {
  const reference = id
    ? doc(db, `${root(establishmentId)}/${type}`, id)
    : doc(collection(db, `${root(establishmentId)}/${type}`))

  if (id) {
    await updateDoc(reference, { ...item, updatedAt: serverTimestamp() })
  } else {
    await setDoc(reference, { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }
}

export async function toggleSettingItem(
  establishmentId: string,
  type: 'ratePlans' | 'bookingChannels' | 'promotions',
  id: string,
  active: boolean
) {
  await updateDoc(doc(db, `${root(establishmentId)}/${type}`, id), {
    active,
    updatedAt: serverTimestamp(),
  })
}

