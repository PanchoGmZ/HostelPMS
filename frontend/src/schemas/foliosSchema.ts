import { z } from 'zod'

export const addConsumptionSchema = z.object({
  stayId: z.string().min(1, 'Debes seleccionar una estadía válida'),
  description: z.string().min(1, 'Ingresa una descripción o selecciona un producto'),
  quantity: z.number().min(1, 'La cantidad debe ser al menos 1'),
  unitPrice: z.number().min(0, 'El precio unitario no puede ser negativo'),
  productId: z.string().optional().nullable(),
})

export const addChargeSchema = addConsumptionSchema

export const recordPaymentSchema = z.object({
  stayId: z.string().min(1, 'Debes seleccionar una estadía válida'),
  amount: z.number().positive('El monto del pago debe ser mayor a 0'),
  method: z.enum(['cash', 'card', 'transfer', 'qr']),
  reference: z.string().optional().nullable(),
})

export const processPaymentSchema = recordPaymentSchema

export type AddConsumptionSchemaInput = z.infer<typeof addConsumptionSchema>
export type AddChargeSchemaInput = AddConsumptionSchemaInput
export type RecordPaymentSchemaInput = z.infer<typeof recordPaymentSchema>
export type ProcessPaymentSchemaInput = RecordPaymentSchemaInput

