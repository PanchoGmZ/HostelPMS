export interface DailySummary {
  id: string
  date?: string
  occupancy?: number
  revenue?: number
  revenueBOB?: number
  revenueByCurrency?: Record<string, number>
  paymentMethods?: Record<string, number>
  paymentsCount?: number
  channels?: Record<string, number>
  reservations?: number
  checkIns?: number
  checkOuts?: number
  cancellations?: number
  totalBeds?: number
  occupiedBeds?: number
  updatedAt?: any
}

export interface ReportKPIs {
  occupancy: number | null // %
  revenueBOB: number | null // BOB
  paymentsCount: number | null
  reservations: number | null
  hostedGuests: number | null
  activeStays: number | null
  checkIns: number | null
  checkOuts: number | null
  avgNightsPerStay: number | null
  avgRevenuePerReservation: number | null
  avgNightlyRate: number | null
}

export interface ChannelStat {
  channel: string
  label: string
  count: number
  percentage: number
}

export interface PaymentMethodStat {
  method: string
  label: string
  count: number
  percentage: number
}

export interface RoomOccupancyStat {
  roomId: string
  name: string
  type: string
  occupancyPct: number
  occupiedNights: number
  totalCapacityUnits: number
}

export interface NationalityStat {
  nationality: string
  count: number
}

export interface SpecialRateStat {
  reason: string
  label: string
  staysCount: number
  nightsCount: number
}

export interface FullReportData {
  kpis: ReportKPIs
  summaries: DailySummary[]
  paymentsByCurrency: Record<string, number>
  channels: ChannelStat[]
  paymentMethods: PaymentMethodStat[]
  roomOccupancies: RoomOccupancyStat[]
  nationalities: NationalityStat[]
  specialRates: SpecialRateStat[]
  period: {
    fromDate: string
    toDate: string
    daysCount: number
  }
}

// Backward-compatibility interface if needed
export interface ReportMetrics {
  reservations: number
  activeStays: number
  openFolios: number
  revenue: number
  revenueByCurrency: Record<string, number>
  occupancy: number
}
