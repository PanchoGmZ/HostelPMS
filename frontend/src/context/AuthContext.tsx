import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { initializeAuthPersistence, logoutUser, subscribeToAuthChanges } from '../services/firebase/authService'
import type { AuthSession, UserRole } from '../types/auth'
import { AuthContext } from './contextValue'

const readSession = async (user: User): Promise<AuthSession> => {
  const token = await user.getIdTokenResult()
  const rawRoles = token.claims.roles
  const roles: Record<string, UserRole> = {}

  if (rawRoles && typeof rawRoles === 'object') {
    for (const [establishmentId, role] of Object.entries(rawRoles)) {
      if (role === 'admin' || role === 'reception') roles[establishmentId] = role
    }
  }

  const configuredId = import.meta.env.VITE_DEFAULT_ESTABLISHMENT_ID
  const establishmentId = configuredId && roles[configuredId]
    ? configuredId
    : Object.keys(roles)[0] ?? null

  return { user, roles, establishmentId }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void initializeAuthPersistence()
    return subscribeToAuthChanges((user) => {
      if (!user) {
        setSession(null)
        setIsLoading(false)
        return
      }

      void readSession(user)
        .then((nextSession) => {
          setSession(nextSession)
          setError(null)
        })
        .catch(() => setError('No se pudieron leer los permisos de usuario.'))
        .finally(() => setIsLoading(false))
    })
  }, [])

  const value = useMemo(() => ({
    session,
    isLoading,
    error,
    signOut: logoutUser,
  }), [session, isLoading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

