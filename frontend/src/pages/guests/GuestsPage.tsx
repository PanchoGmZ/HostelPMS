import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Eye, Pencil, Plus, Search, Users, X, Globe, ArrowDownUp, Filter, IdCard, Phone } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { saveGuest, searchGuests } from '../../services/guests/guestsService'
import type { Guest } from '../../types/guests'
import { GuestDetailModal } from '../../components/guests/GuestDetailModal'

type Draft = Omit<Guest, 'id' | 'searchName'>
const empty: Draft = { firstName: '', lastName: '', documentType: 'passport', documentNumber: '', nationality: '', birthDate: null, whatsapp: '', email: null, occupation: null, previousCity: null, nextCity: null, emergencyContact: null, notes: null }
const toDraft = (guest: Guest): Draft => ({ firstName: guest.firstName, lastName: guest.lastName, documentType: guest.documentType, documentNumber: guest.documentNumber, nationality: guest.nationality, birthDate: guest.birthDate, whatsapp: guest.whatsapp, email: guest.email, occupation: guest.occupation, previousCity: guest.previousCity, nextCity: guest.nextCity, emergencyContact: guest.emergencyContact, notes: guest.notes })

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
          <button className="primary-button compact-button" type="button" onClick={() => setEditor({ draft: empty })}>
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

const countries = [ "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Antigua y Barbuda", "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia", "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín", "Bielorrusia", "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután", "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre", "Ciudad del Vaticano", "Colombia", "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Granada", "Grecia", "Guatemala", "Guyana", "Guinea", "Guinea ecuatorial", "Guinea-Bisáu", "Haití", "Honduras", "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica", "Japón", "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano", "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Madagascar", "Malasia", "Malaui", "Maldivas", "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia", "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria", "Noruega", "Nueva Zelanda", "Omán", "Países Bajos", "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal", "Reino Unido", "República Centroafricana", "República Checa", "República del Congo", "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumanía", "Rusia", "Samoa", "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur", "Siria", "Somalia", "Sri Lanka", "Suazilandia", "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam", "Tailandia", "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu", "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue" ];

function GuestModal({ editor, onChange, onClose, onSubmit }: { editor: { id?: string; draft: Draft }; onChange: (value: { id?: string; draft: Draft }) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const d = editor.draft;
  const field = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...editor, draft: { ...d, [key]: event.target.value } });
  
  let ageStr = '';
  if (d.birthDate) {
    const bDate = new Date(d.birthDate);
    const today = new Date();
    let age = today.getFullYear() - bDate.getFullYear();
    const m = today.getMonth() - bDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
      age--;
    }
    ageStr = `${age} años`;
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form guest-modal" onSubmit={onSubmit}>
        <div className="modal-header">
          <div><span className="kicker">Registro</span><h2>{editor.id ? 'Editar huésped' : 'Nuevo huésped'}</h2></div>
          <button type="button" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="form-row">
          <label>Nombre<input value={d.firstName} onChange={field('firstName')} required /></label>
          <label>Apellido<input value={d.lastName} onChange={field('lastName')} required /></label>
        </div>
        <div className="form-row">
          <label>Documento
            <select value={d.documentType} onChange={field('documentType')} required>
              <option value="passport">Pasaporte</option>
              <option value="national_id">Cédula de Identidad</option>
              <option value="dni">DNI</option>
            </select>
          </label>
          <label>Número<input value={d.documentNumber} onChange={field('documentNumber')} required /></label>
        </div>
        <div className="form-row">
          <label>Nacionalidad
            <input list="countries" value={d.nationality} onChange={field('nationality')} required placeholder="Ej: Argentina" />
            <datalist id="countries">
              {countries.map(c => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label>WhatsApp<input value={d.whatsapp} onChange={field('whatsapp')} /></label>
        </div>
        <div className="form-row">
          <label>Fecha de nacimiento
            <input type="date" value={d.birthDate ?? ''} onChange={field('birthDate')} required />
          </label>
          <label>Edad
            <input type="text" value={ageStr} readOnly disabled style={{ background: '#f9fafb', cursor: 'not-allowed' }} placeholder="Calculada de la fecha" />
          </label>
        </div>
        <div className="form-row">
          <label>Email<input type="email" value={d.email ?? ''} onChange={field('email')} required /></label>
          <label>Ciudad anterior<input value={d.previousCity ?? ''} onChange={field('previousCity')} required /></label>
        </div>
        <div className="form-row">
          <label>Siguiente destino<input value={d.nextCity ?? ''} onChange={field('nextCity')} required /></label>
          <label>Contacto emergencia<input value={d.emergencyContact ?? ''} onChange={field('emergencyContact')} /></label>
        </div>
        <label>Notas<textarea value={d.notes ?? ''} onChange={field('notes')} rows={3} /></label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit">Guardar</button>
        </div>
      </form>
    </div>
  );
}
