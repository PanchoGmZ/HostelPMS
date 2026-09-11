export interface DailySummary { id: string; date?: string; occupancy?: number; revenue?: number; reservations?: number; checkIns?: number; checkOuts?: number; cancellations?: number }
export interface ReportMetrics { reservations: number; activeStays: number; openFolios: number; revenue: number; occupancy: number }
