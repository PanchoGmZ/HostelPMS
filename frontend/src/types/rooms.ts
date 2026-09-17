export type RoomType = 'private' | 'dorm'
export type ResourceStatus = 'active' | 'inactive'
export type BedType = '1_plaza' | '2_plazas'

export interface Bed {
  id: string
  label: string
  bedType?: BedType
  basePriceBed: number
  status: ResourceStatus
  outOfServiceReason: string | null
  isAvailable?: boolean
  maintenanceBlocked?: boolean
  cleaningPending?: boolean
}

export interface Room {
  id: string
  name: string
  floor: string
  type: RoomType
  basePriceRoom: number
  bedCount: number
  status: ResourceStatus
  amenities: string[]
  beds: Bed[]
  maxGuests?: number
  priceByGuestCount?: Record<string, number>
  maintenanceCount?: number
  maintenanceBlocked?: boolean
  cleaningCount?: number
}

