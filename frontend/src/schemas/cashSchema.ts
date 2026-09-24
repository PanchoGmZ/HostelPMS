import { z } from 'zod'

export const openShiftSchema = z.object({
  openingAmount: z.number().min(0, 'El monto inicial no puede ser negativo'),
  notes: z.string().optional().nullable(),
})

export const closeShiftSchema = z.object({
  cashShiftId: z.string().min(1, 'Turno de caja inválido'),
  closingAmount: z.number().min(0, 'El conteo físico no puede ser negativo'),
  notes: z.string().optional().nullable(),
})


export const addMovementSchema = z.object({
  shiftId: z.string().min(1, 'Debe existir un turno abierto'),
  type: z.enum(['in', 'out']),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  method: z.enum(['cash', 'card', 'transfer', 'qr']),
  currencyCode: z.string().optional(),
  receivedAmount: z.number().optional(),
  description: z.string().min(1, 'Ingresa una descripción para el movimiento'),
})

export type OpenShiftSchemaInput = z.infer<typeof openShiftSchema>
export type CloseShiftSchemaInput = z.infer<typeof closeShiftSchema>
export type AddMovementSchemaInput = z.infer<typeof addMovementSchema>
