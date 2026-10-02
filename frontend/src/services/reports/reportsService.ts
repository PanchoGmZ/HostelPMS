import { collection, getDocs, query, orderBy, where, documentId, Timestamp } from 'firebase/firestore'
import { apiPost } from '../api/apiClient'
import { db } from '../firebase/config'
import type {
  DailySummary,
  FullReportData,
  ReportKPIs,
  ChannelStat,
  PaymentMethodStat,
  RoomOccupancyStat,
  NationalityStat,
  SpecialRateStat,
  ReportMetrics,
} from '../../types/reports'
import type { Room } from '../../types/rooms'
import type { Stay } from '../../types/stays'
import type { Reservation } from '../../types/reservations'
import type { Guest } from '../../types/guests'
import type { Folio } from '../../types/folios'

const base = (id: string) => `establishments/${id}`

export function getLaPazTodayStr(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' })
  return formatter.format(new Date())
}

export function getDateNDaysAgoLaPaz(days: number): string {
  const todayStr = getLaPazTodayStr()
  const [y, m, d] = todayStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d - days))
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function parseDate(dateOrTimestamp: any): Date {
  if (!dateOrTimestamp) return new Date()
  if (typeof dateOrTimestamp.toDate === 'function') return dateOrTimestamp.toDate()
  if (typeof dateOrTimestamp.seconds === 'number') return new Date(dateOrTimestamp.seconds * 1000)
  return new Date(dateOrTimestamp)
}

function toLaPazDateStr(dateOrTimestamp: any): string | null {
  if (!dateOrTimestamp) return null
  const dt = parseDate(dateOrTimestamp)
  if (isNaN(dt.getTime())) return null
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' })
  return formatter.format(dt)
}

const CHANNEL_LABELS: Record<string, string> = {
  direct: 'Directo',
  reception: 'Recepción',
  whatsapp: 'WhatsApp',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  hostelworld: 'Hostelworld',
  other: 'Otros',
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  qr: 'QR',
  other: 'Otros',
}

export async function loadFullReport(
  establishmentId: string,
  fromDateStr: string,
  toDateStr: string
): Promise<FullReportData> {
  const root = base(establishmentId)

  const startOfDay = new Date(`${fromDateStr}T00:00:00.000-04:00`)
  const endOfDay = new Date(`${toDateStr}T23:59:59.999-04:00`)
  const fromTimestamp = Timestamp.fromDate(startOfDay)
  const toTimestamp = Timestamp.fromDate(endOfDay)

  // Total days in period
  const [y1, m1, d1] = fromDateStr.split('-').map(Number)
  const [y2, m2, d2] = toDateStr.split('-').map(Number)
  const utc1 = Date.UTC(y1, m1 - 1, d1)
  const utc2 = Date.UTC(y2, m2 - 1, d2)
  const daysCount = Math.max(1, Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1)

  // 1. Fetch daily summaries in date range
  let summaries: DailySummary[] = []
  try {
    const sumSnapshot = await getDocs(
      query(
        collection(db, `${root}/dailySummaries`),
        where(documentId(), '>=', fromDateStr),
        where(documentId(), '<=', toDateStr),
        orderBy(documentId(), 'asc')
      )
    )
    summaries = sumSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as DailySummary[]
  } catch (err) {
    console.error('Error fetching dailySummaries:', err)
  }

  // 2. Fetch rooms (for room occupancy)
  let rooms: Room[] = []
  try {
    const roomsSnap = await getDocs(collection(db, `${root}/rooms`))
    rooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Room[]
  } catch (err) {
    console.error('Error fetching rooms:', err)
  }

  // 3. Fetch active stays and stays checked in during period
  let activeStaysCount = 0
  const stayMap = new Map<string, Stay>()

  try {
    const [activeStaysSnap, periodStaysSnap] = await Promise.all([
      getDocs(query(collection(db, `${root}/stays`), where('status', '==', 'active'))),
      getDocs(
        query(
          collection(db, `${root}/stays`),
          where('checkInDate', '>=', fromTimestamp),
          where('checkInDate', '<=', toTimestamp)
        )
      ),
    ])

    activeStaysCount = activeStaysSnap.size
    activeStaysSnap.docs.forEach((d) => stayMap.set(d.id, { id: d.id, ...d.data() } as Stay))
    periodStaysSnap.docs.forEach((d) => stayMap.set(d.id, { id: d.id, ...d.data() } as Stay))
  } catch (err) {
    console.error('Error fetching stays:', err)
  }

  const allStays = Array.from(stayMap.values())

  // 4. Fetch reservations for the period
  let reservations: Reservation[] = []
  try {
    const resSnap = await getDocs(
      query(
        collection(db, `${root}/reservations`),
        where('checkInDate', '>=', fromTimestamp),
        where('checkInDate', '<=', toTimestamp)
      )
    )
    reservations = resSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Reservation[]
  } catch (err) {
    console.error('Error fetching reservations:', err)
  }

  const resMap = new Map<string, Reservation>()
  reservations.forEach((r) => resMap.set(r.id, r))

  // ── REVENUE & CURRENCY AGGREGATION ──
  const paymentsByCurrency: Record<string, number> = {}
  let totalRevenueBOB = 0
  let summariesPaymentsCount = 0
  const summariesPaymentMethods: Record<string, number> = {}

  summaries.forEach((s) => {
    // BOB revenue strictly: prefer revenueBOB, then revenueByCurrency.BOB
    if (typeof s.revenueBOB === 'number') {
      totalRevenueBOB += s.revenueBOB
    } else if (s.revenueByCurrency?.BOB != null) {
      totalRevenueBOB += s.revenueByCurrency.BOB
    } else if (s.revenueByCurrency && Object.keys(s.revenueByCurrency).length > 0) {
      // Currency breakdown exists but no BOB
    } else if (typeof s.revenue === 'number') {
      totalRevenueBOB += s.revenue
    }

    if (s.revenueByCurrency) {
      Object.entries(s.revenueByCurrency).forEach(([cur, val]) => {
        if (!paymentsByCurrency[cur]) paymentsByCurrency[cur] = 0
        paymentsByCurrency[cur] += val
      })
    } else if (typeof s.revenue === 'number' && s.revenue > 0) {
      paymentsByCurrency['BOB'] = (paymentsByCurrency['BOB'] || 0) + s.revenue
    }

    if (typeof s.paymentsCount === 'number') {
      summariesPaymentsCount += s.paymentsCount
    }
    if (s.paymentMethods) {
      Object.entries(s.paymentMethods).forEach(([m, count]) => {
        summariesPaymentMethods[m] = (summariesPaymentMethods[m] || 0) + count
      })
    }
  })

  // Fallback for payment methods from folios if summaries lack them
  let paymentMethodsBreakdown: Record<string, number> = { ...summariesPaymentMethods }
  let totalPaymentsCount = summariesPaymentsCount

  if (Object.keys(paymentMethodsBreakdown).length === 0) {
    try {
      const stayIds = allStays.map((s) => s.id)
      if (stayIds.length > 0) {
        // Query in chunks of 30
        const chunkSize = 30
        for (let i = 0; i < stayIds.length; i += chunkSize) {
          const chunk = stayIds.slice(i, i + chunkSize)
          const foliosSnap = await getDocs(
            query(collection(db, `${root}/folios`), where('stayId', 'in', chunk))
          )
          foliosSnap.docs.forEach((fDoc) => {
            const f = fDoc.data() as Folio
            const pList = Array.isArray(f.payments) ? f.payments : []
            pList.forEach((p) => {
              if (p.status === 'completed' && p.createdAt) {
                const pDate = p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000) : new Date(p.createdAt as any)
                if (pDate >= startOfDay && pDate <= endOfDay) {
                  const method = p.method || 'other'
                  paymentMethodsBreakdown[method] = (paymentMethodsBreakdown[method] || 0) + 1
                  totalPaymentsCount++
                }
              }
            })
          })
        }
      }
    } catch (err) {
      console.warn('Could not query folios for payment methods fallback:', err)
    }
  }

  // ── OCCUPANCY AGGREGATION FROM SUMMARIES ──
  let totalOccupiedBeds = 0
  let totalAvailableBeds = 0
  summaries.forEach((s) => {
    if (typeof s.occupiedBeds === 'number' && typeof s.totalBeds === 'number' && s.totalBeds > 0) {
      totalOccupiedBeds += s.occupiedBeds
      totalAvailableBeds += s.totalBeds
    }
  })

  const overallOccupancyPct =
    totalAvailableBeds > 0
      ? Math.min(100, Math.round((totalOccupiedBeds / totalAvailableBeds) * 100))
      : summaries.length > 0
      ? Math.min(100, Math.round(summaries.reduce((acc, curr) => acc + (curr.occupancy ?? 0), 0) / summaries.length))
      : null

  // CheckIns / CheckOuts
  const totalCheckIns =
    summaries.length > 0
      ? summaries.reduce((acc, curr) => acc + (curr.checkIns ?? 0), 0)
      : allStays.filter((s) => {
          const dStr = toLaPazDateStr(s.checkInDate)
          return dStr && dStr >= fromDateStr && dStr <= toDateStr
        }).length

  const totalCheckOuts =
    summaries.length > 0
      ? summaries.reduce((acc, curr) => acc + (curr.checkOuts ?? 0), 0)
      : allStays.filter((s) => {
          const dStr = toLaPazDateStr(s.actualCheckOutDate)
          return dStr && dStr >= fromDateStr && dStr <= toDateStr
        }).length

  // ── ROOM OCCUPANCY (Section 9) ──
  // Audits full_room: private rooms are counted as entire room occupied (1 room unit),
  // whereas dorms are counted by bed-nights.
  const roomStatsMap = new Map<string, { name: string; type: string; bedCount: number; occupiedNights: number; occupiedBedNights: number }>()
  rooms.forEach((r) => {
    roomStatsMap.set(r.id, {
      name: r.name,
      type: r.type,
      bedCount: r.bedCount || 1,
      occupiedNights: 0,
      occupiedBedNights: 0,
    })
  })

  // Generate date array for each day in range
  const dateList: string[] = []
  for (let t = utc1; t <= utc2; t += 86400000) {
    const d = new Date(t)
    const yy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    dateList.push(`${yy}-${mm}-${dd}`)
  }

  // Track room occupancy per date
  dateList.forEach((dateStr) => {
    const roomsOccupiedOnDate = new Set<string>()

    allStays.forEach((s) => {
      if (!s.checkInDate) return
      // Exclude cancelled reservations
      if (s.reservationId && resMap.get(s.reservationId)?.status === 'cancelled') return

      const inStr = toLaPazDateStr(s.checkInDate)
      const outDate = s.actualCheckOutDate || s.expectedCheckOutDate
      const outStr = toLaPazDateStr(outDate) || inStr

      if (inStr && outStr && inStr <= dateStr && outStr > dateStr) {
        const stat = roomStatsMap.get(s.roomId)
        if (stat) {
          if (stat.type === 'private') {
            if (!roomsOccupiedOnDate.has(s.roomId)) {
              roomsOccupiedOnDate.add(s.roomId)
              stat.occupiedNights += 1
            }
          } else {
            const bedsUsed = s.bedIds && s.bedIds.length > 0 ? s.bedIds.length : (s.guestCount || 1)
            stat.occupiedBedNights += bedsUsed
          }
        }
      }
    })
  })

  const roomOccupancies: RoomOccupancyStat[] = Array.from(roomStatsMap.entries())
    .map(([roomId, stat]) => {
      let pct = 0
      let totalCap = daysCount
      if (stat.type === 'private') {
        pct = Math.min(100, Math.round((stat.occupiedNights / daysCount) * 100))
      } else {
        totalCap = stat.bedCount * daysCount
        pct = totalCap > 0 ? Math.min(100, Math.round((stat.occupiedBedNights / totalCap) * 100)) : 0
      }
      return {
        roomId,
        name: stat.name,
        type: stat.type,
        occupancyPct: pct,
        occupiedNights: stat.type === 'private' ? stat.occupiedNights : stat.occupiedBedNights,
        totalCapacityUnits: totalCap,
      }
    })
    .sort((a, b) => b.occupancyPct - a.occupancyPct)

  // Total occupied units across establishment for ADR calculation
  const totalOccupiedUnits = roomOccupancies.reduce((acc, curr) => acc + curr.occupiedNights, 0)

  // ── GUESTS & NATIONALITIES (Section 10) ──
  // Associated ONLY to stays of the period
  const guestIdSet = new Set<string>()
  const staysInPeriodForGuests: Stay[] = []

  allStays.forEach((s) => {
    if (!s.checkInDate) return
    const inStr = toLaPazDateStr(s.checkInDate)
    const outDate = s.actualCheckOutDate || s.expectedCheckOutDate
    const outStr = toLaPazDateStr(outDate) || inStr
    if (inStr && outStr && inStr <= toDateStr && outStr >= fromDateStr) {
      staysInPeriodForGuests.push(s)
      ;(s.guestIds || []).forEach((gid) => gid && guestIdSet.add(gid))
      if (s.primaryGuestId) guestIdSet.add(s.primaryGuestId)
    }
  })

  const nationalityCounts: Record<string, number> = {}
  if (guestIdSet.size > 0) {
    try {
      const guestIds = Array.from(guestIdSet)
      const chunkSize = 30
      for (let i = 0; i < guestIds.length; i += chunkSize) {
        const chunk = guestIds.slice(i, i + chunkSize)
        const guestsSnap = await getDocs(
          query(collection(db, `${root}/guests`), where(documentId(), 'in', chunk))
        )
        guestsSnap.docs.forEach((gDoc) => {
          const g = gDoc.data() as Guest
          if (g && g.nationality) {
            const nat = g.nationality.trim()
            if (nat) {
              nationalityCounts[nat] = (nationalityCounts[nat] || 0) + 1
            }
          }
        })
      }
    } catch (err) {
      console.error('Error fetching guests for nationalities:', err)
    }
  }

  const nationalities: NationalityStat[] = Object.entries(nationalityCounts)
    .map(([nationality, count]) => ({ nationality, count }))
    .sort((a, b) => b.count - a.count)

  const hostedGuestsCount = guestIdSet.size > 0 ? guestIdSet.size : staysInPeriodForGuests.reduce((acc, curr) => acc + (curr.guestCount || 1), 0)

  // ── STAY DURATION (Promedio de noches, Section 11) ──
  let totalValidStayNights = 0
  let validStaysCount = 0

  allStays.forEach((s) => {
    if (!s.checkInDate) return
    if (s.reservationId && resMap.get(s.reservationId)?.status === 'cancelled') return

    const inStr = toLaPazDateStr(s.checkInDate)
    const outDate = s.actualCheckOutDate || s.expectedCheckOutDate
    const outStr = toLaPazDateStr(outDate) || inStr

    if (inStr && outStr && inStr <= toDateStr && outStr >= fromDateStr) {
      const inD = parseDate(s.checkInDate)
      const outD = parseDate(outDate)
      const diffMs = outD.getTime() - inD.getTime()
      const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)))
      totalValidStayNights += nights
      validStaysCount++
    }
  })

  const avgNightsPerStay = validStaysCount > 0 ? Math.round((totalValidStayNights / validStaysCount) * 10) / 10 : null

  // ── BOOKING CHANNELS (Section 7) ──
  const channelCounts: Record<string, number> = {}
  reservations.forEach((r) => {
    const ch = r.channel || 'direct'
    channelCounts[ch] = (channelCounts[ch] || 0) + 1
  })

  const totalResCount = reservations.length
  const channels: ChannelStat[] = Object.entries(channelCounts)
    .map(([channel, count]) => ({
      channel,
      label: CHANNEL_LABELS[channel] || channel,
      count,
      percentage: totalResCount > 0 ? Math.round((count / totalResCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ── PAYMENT METHODS (Section 8) ──
  const totalMethodsCount = Object.values(paymentMethodsBreakdown).reduce((a, b) => a + b, 0)
  const paymentMethods: PaymentMethodStat[] = Object.entries(paymentMethodsBreakdown)
    .map(([method, count]) => ({
      method,
      label: METHOD_LABELS[method] || method,
      count,
      percentage: totalMethodsCount > 0 ? Math.round((count / totalMethodsCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ── SPECIAL RATES (Section 12) ──
  const specialRatesMap: Record<string, { staysCount: number; nightsCount: number }> = {
    'Voluntariado': { staysCount: 0, nightsCount: 0 },
    'Cortesía': { staysCount: 0, nightsCount: 0 },
    'Acuerdo especial': { staysCount: 0, nightsCount: 0 },
    'Otros': { staysCount: 0, nightsCount: 0 },
  }

  allStays.forEach((s) => {
    if (!s.checkInDate) return
    const res = s.reservationId ? resMap.get(s.reservationId) : null
    if (res?.status === 'cancelled') return

    if (res?.pricingMode === 'manual' || res?.specialRateReason) {
      const inStr = toLaPazDateStr(s.checkInDate)
      const outDate = s.actualCheckOutDate || s.expectedCheckOutDate
      const outStr = toLaPazDateStr(outDate) || inStr

      if (inStr && outStr && inStr <= toDateStr && outStr >= fromDateStr) {
        const inD = parseDate(s.checkInDate)
        const outD = parseDate(outDate)
        const diffMs = outD.getTime() - inD.getTime()
        const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)))

        const reason = res.specialRateReason || 'Otros'
        const key = specialRatesMap[reason] ? reason : 'Otros'
        specialRatesMap[key].staysCount += 1
        specialRatesMap[key].nightsCount += nights
      }
    }
  })

  const specialRates: SpecialRateStat[] = Object.entries(specialRatesMap).map(([reason, data]) => ({
    reason,
    label: reason,
    staysCount: data.staysCount,
    nightsCount: data.nightsCount,
  }))

  // ── AVERAGES (ADR, RevPerRes) ──
  const avgRevenuePerReservation =
    totalResCount > 0 && totalRevenueBOB > 0 ? Math.round(totalRevenueBOB / totalResCount) : null

  const avgNightlyRate =
    totalOccupiedUnits > 0 && totalRevenueBOB > 0 ? Math.round(totalRevenueBOB / totalOccupiedUnits) : null

  const kpis: ReportKPIs = {
    occupancy: overallOccupancyPct,
    revenueBOB: totalRevenueBOB,
    paymentsCount: totalPaymentsCount > 0 ? totalPaymentsCount : summariesPaymentsCount > 0 ? summariesPaymentsCount : null,
    reservations: totalResCount > 0 ? totalResCount : summaries.length > 0 ? summaries.reduce((acc, curr) => acc + (curr.reservations ?? 0), 0) : null,
    hostedGuests: hostedGuestsCount > 0 ? hostedGuestsCount : null,
    activeStays: activeStaysCount,
    checkIns: totalCheckIns,
    checkOuts: totalCheckOuts,
    avgNightsPerStay,
    avgRevenuePerReservation,
    avgNightlyRate,
  }

  return {
    kpis,
    summaries,
    paymentsByCurrency,
    channels,
    paymentMethods,
    roomOccupancies,
    nationalities,
    specialRates,
    period: {
      fromDate: fromDateStr,
      toDate: toDateStr,
      daysCount,
    },
  }
}

export async function loadReports(
  establishmentId: string,
  limitDays = 30
): Promise<{ metrics: ReportMetrics; summaries: DailySummary[] }> {
  const toDateStr = getLaPazTodayStr()
  const fromDateStr = getDateNDaysAgoLaPaz(limitDays)
  const report = await loadFullReport(establishmentId, fromDateStr, toDateStr)

  return {
    metrics: {
      reservations: report.kpis.reservations ?? 0,
      activeStays: report.kpis.activeStays ?? 0,
      openFolios: 0,
      revenue: report.kpis.revenueBOB ?? 0,
      revenueByCurrency: report.paymentsByCurrency,
      occupancy: report.kpis.occupancy ?? 0,
    },
    summaries: report.summaries,
  }
}

export async function generateDailySummaryOnDemand(establishmentId: string, dateStr?: string) {
  try {
    const date = dateStr || getLaPazTodayStr()
    await apiPost('/api/generateDailySummaryOnDemand', { establishmentId, date })
  } catch (err: any) {
    throw new Error(err.message || 'Error al generar resumen diario')
  }
}
