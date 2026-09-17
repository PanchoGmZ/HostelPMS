import { z } from 'zod'

export const roomSchema = z.object({
  name: z.string().min(1, 'El nombre de la habitación es obligatorio'),
  floor: z.string().optional(),
  type: z.enum(['dorm', 'private']),
  basePriceRoom: z.number().min(0, 'El precio base no puede ser negativo'),
  status: z.enum(['active', 'inactive']),
  amenities: z.array(z.string()).optional(),
  maxGuests: z.number().min(1).optional(),
  priceByGuestCount: z.record(z.string(), z.number()).optional(),
})

export const bedSchema = z.object({
  label: z.string().min(1, 'La etiqueta de la cama es obligatoria'),
  basePriceBed: z.number().min(0, 'El precio de la cama no puede ser negativo'),
})

export const outOfServiceSchema = z.object({
  reason: z.string().min(1, 'Debes ingresar un motivo para poner fuera de servicio'),
})

export type RoomSchemaInput = z.infer<typeof roomSchema>
export type BedSchemaInput = z.infer<typeof bedSchema>
export type OutOfServiceSchemaInput = z.infer<typeof outOfServiceSchema>
