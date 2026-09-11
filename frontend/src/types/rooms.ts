export type RoomType = 'private' | 'dorm'
export type ResourceStatus = 'active' | 'inactive'

export interface Bed {
  id: string
  label: string
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
  maintenanceCount?: number
  maintenanceBlocked?: boolean
  cleaningCount?: number
}

