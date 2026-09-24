import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Eye, Pencil, Plus, Search, Users, Globe, ArrowDownUp, Filter, IdCard, Phone } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { saveGuest, searchGuests } from '../../services/guests/guestsService'
import type { Guest } from '../../types/guests'
import { GuestDetailModal } from '../../components/guests/GuestDetailModal'
import { GuestModal, type Draft, emptyDraft, toDraft } from '../../components/guests/GuestModal'

export function GuestsPage() {
  const { session } = useAuth(); const establishmentId = session?.establishmentId
  const [guests, setGuests] = useState<Guest[]>([]); const [term, setTerm] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [editor, setEditor] = useState<{ id?: string; draft: Draft } | null>(null); const [detail, setDetail] = useState<Guest | null>(null)
  const load = useCallback(async (value = term) => { if (!establishmentId) return; setLoading(true); try { setGuests(await searchGuests(establishmentId, value)) } catch { setError('No se pudieron cargar los huéspedes.')} finally { setLoading(false) } }, [establishmentId, term])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer) }, [load])
  if (!establishmentId) return <div className="empty-state"><Users size={24} /><h1>Cuenta sin establecimiento</h1></div>
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!editor) return; try { await saveGuest(establishmentId, editor.draft, editor.id); setEditor(null); await load('') } catch { setError('No se pudo guardar el huésped. Verifica tus permisos.') } }
  
  // Calculate real metrics
  const totalGuests = guests.length;
  const nationalities = guests.reduce((acc, guest) => {
    const nat = guest.nationality?.trim();
    if (nat) {
      acc[nat] = (acc[nat] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  const totalNationalities = Object.keys(nationalities).length;
  const sortedNationalities = Object.entries(nationalities).sort((a, b) => b[1] - a[1]);
  const topNationalitiesStr = sortedNationalities.length > 0 
    ? `Mayoría ${sortedNationalities.slice(0, 2).map(([nat]) => nat).join(' y ')}`
    : 'Sin registrar';

  return (
    <div className="dashboard-page guests-page">
      <header className="page-header guest-new-header">
        <div className="header-breadcrumbs">
          <span>BASE DE HUÉSPEDES</span>
          <span className="separator">•</span>
          <span>Directorio de Clientes</span>
        </div>
        <div className="header-title-row">
          <div>
            <h1>Huéspedes</h1>
            <p>Encuentra perfiles rápido y conserva la información de cada viajero.</p>
          </div>
          <button className="primary-button compact-button" type="button" onClick={() => setEditor({ draft: emptyDraft })}>
            <Plus size={18} /> Nuevo huésped
          </button>
        </div>
      </header>

      <div className="metric-grid guest-metrics">
        <div className="metric-card">
          <div className="metric-icon"><Users size={20} /></div>
          <span>TOTAL REGISTRADOS</span>
          <strong>{totalGuests} <small>viajeros en base</small></strong>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#fff7ed', color: '#ea580c' }}><Globe size={20} /></div>
          <span>NACIONALIDADES</span>
          <strong>{totalNationalities} <small>países representados</small></strong>
          <small>{topNationalitiesStr}</small>
        </div>
      </div>

      <div className="guest-toolbar advanced-toolbar">
        <div className="toolbar-search">
          <Search size={18} />
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar por nombre, documento o nacionalidad..." aria-label="Buscar huéspedes" />
        </div>
        <div className="toolbar-filters">
          <div className="filter-group">
            <Filter size={16}/>
            <select defaultValue="todos">
              <option value="todos">Estado: Todos</option>
            </select>
          </div>
          <div className="filter-group">
            <Globe size={16}/>
            <select defaultValue="todas">
              <option value="todas">Nacionalidad: Todas</option>
              {sortedNationalities.map(([nat]) => (
                <option key={nat} value={nat}>{nat}</option>
              ))}
            </select>
          </div>
          <button className="secondary-button sort-btn" type="button"><ArrowDownUp size={14}/> Recientes</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      
      {loading ? (
        <div className="screen-state inline-state"><span className="loader" />Buscando huéspedes...</div>
      ) : guests.length === 0 ? (
        <div className="empty-state compact"><Users size={24} /><h2>No hay huéspedes</h2><p>Prueba otra búsqueda o registra el primer perfil.</p></div>
      ) : (
        <div className="guest-list">
          {guests.map((guest) => {
            return (
              <article className="guest-row" key={guest.id}>
                <div className="guest-avatar-wrapper">
                  <div className="guest-avatar">{guest.firstName[0]}{guest.lastName[0]}</div>
                </div>
                
                <div className="guest-info">
                  <div className="guest-info-top">
                    <strong>{guest.firstName} {guest.lastName}</strong>
                  </div>
                  
                  <div className="guest-info-bottom">
                    <span className="country-code">{guest.nationality?.slice(0, 2).toUpperCase() || 'UN'}</span>
                    <span className="country-name">{guest.nationality || 'Sin país'}</span>
                    <span className="separator">•</span>
                    <span className="guest-doc"><IdCard size={12}/> {guest.documentType === 'passport' ? 'Pasaporte' : 'CI / Pasaporte'}: {guest.documentNumber || 'N/A'}</span>
                    {(guest.whatsapp || guest.email) && (
                      <>
                        <span className="separator">•</span>
                        <span className="guest-contact"><Phone size={12}/> {guest.whatsapp || guest.email}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="guest-actions">
                  <button className="secondary-button compact-button" type="button" onClick={() => setDetail(guest)}><Eye size={14} /> Ver Perfil</button>
                  <button className="secondary-button compact-button" type="button" onClick={() => setEditor({ id: guest.id, draft: toDraft(guest) })}><Pencil size={14} /> Editar</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      
      <div className="guest-footer">
        <span>Mostrando {guests.length} huéspedes registrados de {guests.length} totales</span>
        <span className="sync-status"><span className="status-dot"></span> Sincronizado en tiempo real con Cloud Functions</span>
      </div>

      {editor && <GuestModal editor={editor} onChange={setEditor} onClose={() => setEditor(null)} onSubmit={submit} />}
      {detail && <GuestDetailModal establishmentId={establishmentId} guest={detail} onClose={() => setDetail(null)} onEdit={() => { setEditor({ id: detail.id, draft: toDraft(detail) }); setDetail(null); }} />}
    </div>
  )
}


