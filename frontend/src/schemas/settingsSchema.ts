import { z } from 'zod'

export const establishmentSchema = z.object({
  name: z.string().min(1, 'El nombre del establecimiento es obligatorio'),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Ingresa un email válido').optional().or(z.literal('')).nullable(),
  website: z.string().url('Ingresa una URL válida').optional().or(z.literal('')).nullable(),
  timezone: z.string().min(1, 'La zona horaria es obligatoria'),
  currency: z.string().min(1, 'La moneda es obligatoria (ej. BOB, USD)').max(5),
  checkInTime: z.string().optional().nullable(),
  checkOutTime: z.string().optional().nullable(),
  lateCheckoutSurchargePercent: z.number().min(0).max(100).optional(),
})

export const settingItemSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional().nullable(),
  commissionPercent: z.number().min(0).max(100).optional().nullable(),
  active: z.boolean().optional(),
})

export type EstablishmentSchemaInput = z.infer<typeof establishmentSchema>
export type SettingItemSchemaInput = z.infer<typeof settingItemSchema>
