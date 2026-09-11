import { createContext } from 'react'
import type { AuthSession } from '../types/auth'

export interface AuthContextValue {
  session: AuthSession | null
  isLoading: boolean
  error: string | null
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)