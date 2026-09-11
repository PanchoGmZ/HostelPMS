import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'

import { db } from '../firebase/config'
import type { DailySummary, ReportMetrics } from '../../types/reports'

const base = (id: string) => `establishments/${id}`

export async function loadReports(
  establishmentId: string,
  limitDays = 30
): Promise<{ metrics: ReportMetrics; summaries: DailySummary[] }> {
  const root = base(establishmentId)

  const [reservations, stays, summaries] = await Promise.all([
    getDocs(collection(db, `${root}/reservations`)),
    getDocs(collection(db, `${root}/stays`)),
    getDocs(
      query(collection(db, `${root}/dailySummaries`), orderBy('__name__', 'desc'), limit(limitDays))
    ),
  ])

  const summaryData = summaries.docs.map((item) => ({ id: item.id, ...item.data() })) as DailySummary[]

  return {
    metrics: {
      reservations: reservations.size,
      activeStays: stays.docs.filter((item) => item.data().status === 'active').length,
      // folios path is establishments/{id}/folios (not under stays)
      openFolios: 0, // Note: loaded separately if needed, folios are at establishments/{id}/folios
      revenue: summaryData.reduce((total, item) => total + (item.revenue ?? 0), 0),
      // occupancy from most recent summary day
      occupancy: summaryData[0]?.occupancy ?? 0,
    },
    summaries: summaryData,
  }
}
