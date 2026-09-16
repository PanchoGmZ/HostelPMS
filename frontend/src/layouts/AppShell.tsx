import { useState, type ReactNode } from 'react'
import { BedDouble, Building2, CalendarDays, ConciergeBell, CreditCard, Globe2, Menu, Package, Settings2, ShoppingCart, Users, WalletCards, Wrench, X } from 'lucide-react'
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
      { label: 'Habitaciones', icon: BedDouble, to: '/rooms' },
      { label: 'Reservas', icon: CalendarDays, to: '/reservations' },
      { label: 'Estadías', icon: ConciergeBell, to: '/stays' },
      { label: 'Folios', icon: CreditCard, to: '/folios' },
      { label: 'POS Consumos', icon: ShoppingCart, to: '/pos' },
      { label: 'Huéspedes', icon: Users, to: '/guests' },
      { label: 'Inventario', icon: Package, to: '/inventory' },
      { label: 'Reportes', icon: Globe2, to: '/reports' },
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
      <aside className={`sidebar ${isMenuOpen ? 'sidebar-open' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 16px' }}>
        <div className="brand brand-light" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '12px', borderBottom: '1px solid var(--line-light)' }}>
          <span className="brand-mark" style={{ background: 'var(--teal-deep)', color: 'white', padding: '6px', borderRadius: '6px', display: 'flex' }}><Building2 size={16} /></span>
          <span style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '-0.02em', color: 'var(--ink)' }}>Pata y Perro</span>
        </div>

        <div className="property" style={{ padding: '8px 10px', background: 'var(--surface-50)', borderRadius: '8px', border: '1px solid var(--line-light)' }}>
          <span className="eyebrow" style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600, letterSpacing: '0.05em' }}>Establecimiento</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>Hostel principal</strong>
            <span style={{ fontSize: '9px', color: 'var(--teal-deep)', background: 'var(--mint)', padding: '2px 4px', borderRadius: '4px', fontWeight: 600 }}>● Activo</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Navegación principal" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
          {navGroups.map((group) => (
            <div key={group.title} className="nav-group">
              <h4 style={{ 
                fontSize: '10px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.04em', 
                color: 'var(--text-light)', 
                margin: '0 0 4px 8px',
                fontWeight: 600
              }}>
                {group.title}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {group.items.map(({ label, icon: Icon, to }) => (
                  <NavLink key={to} to={to} end={to === '/'} onClick={() => setIsMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ padding: '6px 8px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} strokeWidth={2} /><span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer" style={{ paddingTop: '10px', borderTop: '1px solid var(--line-light)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="eyebrow" style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600, letterSpacing: '0.05em' }}>Sesión</span>
          <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>{email}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-light)', background: 'var(--surface-50)', padding: '2px 6px', borderRadius: '12px', border: '1px solid var(--line)' }}>{role === 'admin' ? 'Administrador' : 'Recepción'}</span>
            <button className="text-button" type="button" onClick={() => void signOut()} style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 500, padding: 0 }}>Cerrar sesión</button>
          </div>
        </div>
      </aside>
      {isMenuOpen && <button className="sidebar-backdrop" aria-label="Cerrar menú" type="button" onClick={() => setIsMenuOpen(false)} />}
      <main className="main-content">
        <div className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '10px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--line-light)', position: 'sticky', top: 0, zIndex: 10, minHeight: '52px' }}>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="menu-button" type="button" aria-label="Abrir menú" onClick={() => setIsMenuOpen(true)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer' }}>
              {isMenuOpen ? <X size={24} color="var(--ink)" /> : <Menu size={24} color="var(--ink)" />}
            </button>
          </div>
        </div>
        <div className="app-content-wrapper" style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
