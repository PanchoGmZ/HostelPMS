import { collection, getDocs, query, orderBy, where, documentId } from 'firebase/firestore'
import { apiPost } from '../api/apiClient'

import { db } from '../firebase/config'
import type { DailySummary, ReportMetrics } from '../../types/reports'

const base = (id: string) => `establishments/${id}`

export async function loadReports(
  establishmentId: string,
  limitDays = 30
): Promise<{ metrics: ReportMetrics; summaries: DailySummary[] }> {
  const root = base(establishmentId)
  
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const pastDate = new Date(today)
  pastDate.setDate(pastDate.getDate() - limitDays)
  const fromDateStr = pastDate.toISOString().split('T')[0]

  let summaries: DailySummary[] = []
  let activeStaysCount = -1

  try {
    const sumSnapshot = await getDocs(
      query(
        collection(db, `${root}/dailySummaries`),
        where(documentId(), '>=', fromDateStr),
        where(documentId(), '<=', todayStr),
        orderBy(documentId(), 'asc')
      )
    )
    summaries = sumSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })).reverse() as DailySummary[]
  } catch (err) {
    console.error('Error fetching summaries:', err)
  }

  try {
    const staysSnapshot = await getDocs(
      query(collection(db, `${root}/stays`), where('status', '==', 'active'))
    )
    activeStaysCount = staysSnapshot.size
  } catch (err) {
    console.error('Error fetching active stays:', err)
  }

  const aggregatedRevenueByCurrency: Record<string, number> = {}
  summaries.forEach((s) => {
    if (s.revenueByCurrency) {
      Object.entries(s.revenueByCurrency).forEach(([cur, val]) => {
        if (!aggregatedRevenueByCurrency[cur]) aggregatedRevenueByCurrency[cur] = 0
        aggregatedRevenueByCurrency[cur] += val
      })
    }
  })

  return {
    metrics: {
      reservations: summaries.length > 0 ? summaries.reduce((acc, curr) => acc + (curr.reservations ?? 0), 0) : -1,
      activeStays: activeStaysCount,
      openFolios: 0,
      revenue: summaries.length > 0 ? summaries.reduce((acc, curr) => acc + (curr.revenue ?? 0), 0) : -1,
      revenueByCurrency: aggregatedRevenueByCurrency,
      occupancy: summaries.length > 0 ? (summaries[0]?.occupancy ?? 0) : -1,
    },
    summaries,
  }
}

export async function generateDailySummaryOnDemand(establishmentId: string) {
  try {
    const tzDateStr = new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" })
    const d = new Date(tzDateStr)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const date = `${yyyy}-${mm}-${dd}`

    await apiPost('/api/generateDailySummaryOnDemand', { establishmentId, date })
  } catch (err: any) {
    throw new Error(err.message || 'Error al generar resumen diario')
  }
}
