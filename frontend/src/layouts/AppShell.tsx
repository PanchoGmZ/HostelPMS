import { useState, type ReactNode } from 'react'
import { BarChart3, BedDouble, Building2, CalendarDays, ConciergeBell, CreditCard, Globe2, Menu, Package, Search, Settings2, ShoppingCart, Users, WalletCards, Wrench, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/useAuth'


const navGroups = [
  {
    title: 'Recepción',
    items: [
      { label: 'Dashboard Operativo', icon: ConciergeBell, to: '/' },
    ]
  },
  {
    title: 'Operación',
    items: [
      { label: 'Turnos de Caja', icon: WalletCards, to: '/cash' },
      { label: 'Operación', icon: Wrench, to: '/operations' },
    ]
  },
  {
    title: 'Gestión (Admin)',
    items: [
      { label: 'Resumen (Métricas)', icon: BarChart3, to: '/dashboard' },
      { label: 'Habitaciones', icon: BedDouble, to: '/rooms' },
      { label: 'Reservas', icon: CalendarDays, to: '/reservations' },
      { label: 'Estadías', icon: ConciergeBell, to: '/stays' },
      { label: 'Folios', icon: CreditCard, to: '/folios' },
      { label: 'POS Consumos', icon: ShoppingCart, to: '/pos' },
      { label: 'Huéspedes', icon: Users, to: '/guests' },
      { label: 'Inventario', icon: Package, to: '/inventory' },
      { label: 'Reportes', icon: BarChart3, to: '/reports' },
      { label: 'Configuración', icon: Settings2, to: '/settings' },
      { label: 'Integraciones', icon: Globe2, to: '/integrations' },
    ]
  }
]


export function AppShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { session, signOut } = useAuth()
  const email = session?.user.email ?? 'Equipo de recepción'
  const role = session?.establishmentId ? session.roles[session.establishmentId] : null

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand brand-light"><span className="brand-mark"><Building2 size={19} /></span><span>Casa Nómada</span></div>
        <div className="property"><span className="eyebrow">Establecimiento</span><strong>Hostel principal</strong><span className="status-dot">● Operativo</span></div>
        <nav className="nav-list" aria-label="Navegación principal">
          {navGroups.map((group) => (
            <div key={group.title} className="nav-group" style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ 
                fontSize: '0.75rem', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em', 
                color: 'var(--text-tertiary)', 
                margin: '0 0 0.5rem 1rem',
                fontWeight: 600
              }}>
                {group.title}
              </h4>
              {group.items.map(({ label, icon: Icon, to }) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="cash-status-card">
          <strong>Caja y Turnos</strong>
          <p>Gestiona el efectivo y los cierres de turno.</p>
          <NavLink to="/cash" className="small-button" style={{ marginTop: '4px', textAlign: 'center' }} onClick={() => setIsMenuOpen(false)}>Abrir módulo de caja</NavLink>
        </div>
        <div className="sidebar-footer"><span className="eyebrow">Sesión activa</span><strong>{email}</strong><span className="role-label">{role === 'admin' ? 'Administrador' : 'Recepción'}</span><button className="text-button" type="button" onClick={() => void signOut()}>Cerrar sesión</button></div>
      </aside>
      {isMenuOpen && <button className="sidebar-backdrop" aria-label="Cerrar menú" type="button" onClick={() => setIsMenuOpen(false)} />}
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-search">
            <Search size={16} color="var(--muted)" />
            <input type="text" placeholder="Buscar huésped, reserva..." />
          </div>
          <div className="topbar-actions">
            <button className="menu-button" type="button" aria-label="Abrir menú" onClick={() => setIsMenuOpen(true)}>
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div className="app-content-wrapper">
          {children}
        </div>
      </main>
    </div>
  )
}
