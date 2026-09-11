import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(1, 'El nombre del producto es obligatorio'),
  categoryId: z.string().optional().nullable(),
  unit: z.string().min(1, 'Especifica la unidad (ej. unidad, botella, kg)'),
  costPrice: z.number().min(0, 'El precio de costo no puede ser negativo'),
  salePrice: z.number().min(0, 'El precio de venta no puede ser negativo'),
  minimumStock: z.number().min(0, 'El stock mínimo no puede ser negativo'),
  active: z.boolean().optional(),
})

export const purchaseSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto para la entrada'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unitCost: z.number().min(0, 'El costo unitario no puede ser negativo'),
})

export type ProductSchemaInput = z.infer<typeof productSchema>
export type PurchaseSchemaInput = z.infer<typeof purchaseSchema>
