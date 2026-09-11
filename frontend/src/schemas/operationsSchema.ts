import { z } from 'zod'

export const cleaningTaskSchema = z.object({
  roomId: z.string().min(1, 'Debes seleccionar una habitación'),
  bedId: z.string().optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  notes: z.string().optional().nullable(),
})

export const maintenanceIncidentSchema = z.object({
  roomId: z.string().optional().nullable(),
  bedId: z.string().optional().nullable(),
  reason: z.string().min(1, 'Ingresa el motivo del incidente'),
  status: z.enum(['pending', 'in_progress', 'completed']),
  blocksResource: z.boolean(),
  resolution: z.string().optional().nullable(),
})

export type CleaningTaskSchemaInput = z.infer<typeof cleaningTaskSchema>
export type MaintenanceIncidentSchemaInput = z.infer<typeof maintenanceIncidentSchema>
