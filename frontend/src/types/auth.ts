import type { User } from 'firebase/auth'

export type UserRole = 'admin' | 'reception'

export interface AuthSession {
  user: User
  roles: Record<string, UserRole>
  establishmentId: string | null
}
