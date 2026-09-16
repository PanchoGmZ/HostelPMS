import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AppShell } from '../layouts/AppShell'
import { LoginPage } from '../pages/auth/LoginPage'
import { RoomsPage } from '../pages/rooms/RoomsPage'
import { GuestsPage } from '../pages/guests/GuestsPage'
import { ReservationsPage } from '../pages/reservations/ReservationsPage'
import { StaysPage } from '../pages/stays/StaysPage'
import { FoliosPage } from '../pages/cash/FoliosPage'
import { InventoryPage } from '../pages/inventory/InventoryPage'
import { CashPage } from '../pages/cash/CashPage'
import { OperationsPage } from '../pages/housekeeping/OperationsPage'
import { ReportsPage } from '../pages/reports/ReportsPage'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { IntegrationsPage } from '../pages/settings/IntegrationsPage'
import { POSPage } from '../pages/pos/POSPage'


import { ReceptionPage } from '../pages/reception/ReceptionPage'


function ProtectedRoutes() {
  const { session, isLoading } = useAuth()

  if (isLoading) return <div className="screen-state"><span className="loader" />Cargando tu espacio de trabajo...</div>
  if (!session) return <Navigate to="/login" replace />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ReceptionPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/guests" element={<GuestsPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/stays" element={<StaysPage />} />
        <Route path="/folios" element={<FoliosPage />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/cash" element={<CashPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="*" element={<ReceptionPage />} />
      </Routes>
    </AppShell>
  )
}


export function AppRoutes() {
  const { session, isLoading } = useAuth()

  if (isLoading) return <div className="screen-state"><span className="loader" />Preparando recepción...</div>

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}
