

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export interface CleaningTask { id: string; roomId: string; bedId?: string | null; status: TaskStatus; assignedTo?: string | null; notes?: string | null }
export interface MaintenanceIncident {
    id: string; roomId?: string | null; bedId?: string | null; reason: string; status: TaskStatus; blocksResource: boolean; resolution?: string | null
}
