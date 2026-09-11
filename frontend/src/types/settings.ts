export interface EstablishmentSettings {
  id: string
  name?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  timezone?: string
  currency?: string
  checkInTime?: string
  checkOutTime?: string
  lateCheckoutSurchargePercent?: number
  createdAt?: { seconds: number }
  updatedAt?: { seconds: number }
}

export interface SettingItem {
  id: string
  name: string
  active?: boolean
  commissionPercent?: number
  description?: string
  code?: string
  createdAt?: { seconds: number }
  updatedAt?: { seconds: number }
}

