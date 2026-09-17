import { z } from 'zod'

export const createReservationSchema = z.object({
  guestId: z.string().min(1, 'Debes seleccionar un huésped'),
  roomId: z.string().min(1, 'Debes seleccionar una habitación'),
  saleMode: z.enum(['bed', 'full_room']),
  bedIds: z.array(z.string()).min(1, 'Debes seleccionar al menos una cama'),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de entrada inválida'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de salida inválida'),
  channel: z.string().min(1, 'Selecciona un canal de reserva'),
  commissionPercent: z.union([z.number().min(0).max(100), z.literal('')]).optional(),
  guestCount: z.number().min(1).optional(),
  guestIds: z.array(z.string()).optional(),
}).refine(
  (data) => {
    const inDate = new Date(`${data.checkIn}T00:00:00`)
    const outDate = new Date(`${data.checkOut}T00:00:00`)
    return outDate > inDate
  },
  {
    message: 'La fecha de salida debe ser posterior a la fecha de entrada',
    path: ['checkOut'],
  }
)

export type CreateReservationSchemaInput = z.infer<typeof createReservationSchema>
