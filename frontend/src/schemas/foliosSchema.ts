import { z } from 'zod'

export const addConsumptionSchema = z.object({
  stayId: z.string().min(1, 'Debes seleccionar una estadía válida'),
  items: z.array(z.object({
    productId: z.string().min(1, 'Producto inválido'),
    quantity: z.number().min(1, 'La cantidad debe ser al menos 1')
  })).min(1, 'Debe haber al menos un producto'),
  payNow: z
    .object({
      method: z.enum(['cash', 'card', 'transfer', 'qr']),
      reference: z.string().optional(),
    })
    .optional(),
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
