import { z } from 'zod'

export const checkInSchema = z.object({
  reservationId: z.string().min(1, 'Debes seleccionar una reserva confirmada para realizar el check-in'),
  guestIds: z.array(z.string()).min(1, 'Debes seleccionar al menos un huésped titular'),
  roomId: z.string().min(1, 'Debes seleccionar una habitación'),
  bedIds: z.array(z.string()).min(1, 'Debes asignar al menos una cama'),
  expectedCheckOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de salida prevista inválida'),
  deposit: z.number().min(0, 'El depósito no puede ser negativo'),
  documentVerified: z.boolean(),
})

export type CheckInSchemaInput = z.infer<typeof checkInSchema>

