import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Bed, Room, RoomType, ResourceStatus } from '../../types/rooms'

const roomsPath = (establishmentId: string) => `establishments/${establishmentId}/rooms`
const bedsPath = (establishmentId: string, roomId: string) => `${roomsPath(establishmentId)}/${roomId}/beds`

export async function listRooms(establishmentId: string): Promise<Room[]> {
  const roomSnapshot = await getDocs(collection(db, roomsPath(establishmentId)))
  const [incidentsSnapshot, cleaningSnapshot] = await Promise.all([
    getDocs(collection(db, `establishments/${establishmentId}/maintenanceIncidents`)),
    getDocs(collection(db, `establishments/${establishmentId}/cleaningTasks`)),
  ])

  const incidents = incidentsSnapshot.docs
    .map((item) => item.data())
    .filter((item) => item.status !== 'completed' && item.blocksResource === true)

  const cleaning = cleaningSnapshot.docs
    .map((item) => item.data())
    .filter((item) => item.status !== 'completed')

  return Promise.all(
    roomSnapshot.docs.map(async (roomDocument) => {
      const bedsSnapshot = await getDocs(collection(db, bedsPath(establishmentId, roomDocument.id)))
      const data = roomDocument.data()
      const today = new Date()
      const monthId = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
      const dayId = String(today.getUTCDate()).padStart(2, '0')

      const beds = await Promise.all(
        bedsSnapshot.docs.map(async (bedDocument) => {
          const availability = await getDoc(
            doc(db, `establishments/${establishmentId}/availability`, `${bedDocument.id}_${monthId}`)
          )
          const occupied = availability.exists() && availability.data()?.days?.[dayId] != null
          const maintenanceBlocked = incidents.some((item) => item.bedId === bedDocument.id)
          const cleaningPending = cleaning.some(
            (item) => item.bedId === bedDocument.id || item.roomId === roomDocument.id
          )
          return {
            id: bedDocument.id,
            ...bedDocument.data(),
            isAvailable: !occupied && !maintenanceBlocked && !cleaningPending,
            maintenanceBlocked,
            cleaningPending,
          } as Bed
        })
      )

      const roomIncidents = incidents.filter((item) => item.roomId === roomDocument.id)
      const roomCleaning = cleaning.filter((item) => item.roomId === roomDocument.id)

      return {
        id: roomDocument.id,
        ...data,
        beds,
        maintenanceCount: roomIncidents.length,
        maintenanceBlocked: roomIncidents.length > 0 || beds.some((bed) => bed.maintenanceBlocked),
        cleaningCount: roomCleaning.length,
      } as Room
    })
  )
}


export async function saveRoom(establishmentId: string, room: Omit<Room, 'id' | 'beds' | 'bedCount'>, roomId?: string) {
  const roomReference = roomId ? doc(db, roomsPath(establishmentId), roomId) : doc(collection(db, roomsPath(establishmentId)))
  if (roomId) await updateDoc(roomReference, { ...room, updatedAt: serverTimestamp() })
  else await setDoc(roomReference, { ...room, bedCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return roomReference.id
}

export async function saveBed(establishmentId: string, roomId: string, bed: Omit<Bed, 'id'>, bedId?: string) {
  const bedReference = bedId ? doc(db, bedsPath(establishmentId, roomId), bedId) : doc(collection(db, bedsPath(establishmentId, roomId)))
  if (bedId) await updateDoc(bedReference, { ...bed, updatedAt: serverTimestamp() })
  else await setDoc(bedReference, { ...bed, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  const bedsSnapshot = await getDocs(collection(db, bedsPath(establishmentId, roomId)))
  await updateDoc(doc(db, roomsPath(establishmentId), roomId), { bedCount: bedsSnapshot.size, updatedAt: serverTimestamp() })
}

export async function setRoomStatus(establishmentId: string, roomId: string, status: ResourceStatus) {
  await updateDoc(doc(db, roomsPath(establishmentId), roomId), { status, updatedAt: serverTimestamp() })
}

export async function setBedStatus(establishmentId: string, roomId: string, bed: Bed, status: ResourceStatus, reason: string | null) {
  await updateDoc(doc(db, bedsPath(establishmentId, roomId), bed.id), { status, outOfServiceReason: reason, updatedAt: serverTimestamp() })
}

export type RoomForm = { name: string; floor: string; type: RoomType; basePriceRoom: number; status: ResourceStatus; amenities: string[]; maxGuests?: number; priceByGuestCount?: Record<string, number> }
