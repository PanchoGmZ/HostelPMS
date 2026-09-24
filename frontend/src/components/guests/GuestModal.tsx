import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Guest } from '../../types/guests'

export type Draft = Omit<Guest, 'id' | 'searchName'>

export const emptyDraft: Draft = { firstName: '', lastName: '', documentType: 'passport', documentNumber: '', nationality: '', birthDate: null, whatsapp: null, email: null, occupation: null, previousCity: null, nextCity: null, emergencyContact: null, notes: null }

export const toDraft = (guest: Guest): Draft => ({ firstName: guest.firstName, lastName: guest.lastName, documentType: guest.documentType, documentNumber: guest.documentNumber, nationality: guest.nationality, birthDate: guest.birthDate, whatsapp: guest.whatsapp, email: guest.email, occupation: guest.occupation, previousCity: guest.previousCity, nextCity: guest.nextCity, emergencyContact: guest.emergencyContact, notes: guest.notes })

export const countries = [ "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Antigua y Barbuda", "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia", "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín", "Bielorrusia", "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután", "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre", "Ciudad del Vaticano", "Colombia", "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Granada", "Grecia", "Guatemala", "Guyana", "Guinea", "Guinea ecuatorial", "Guinea-Bisáu", "Haití", "Honduras", "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica", "Japón", "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano", "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Madagascar", "Malasia", "Malaui", "Maldivas", "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia", "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria", "Noruega", "Nueva Zelanda", "Omán", "Países Bajos", "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal", "Reino Unido", "República Centroafricana", "República Checa", "República del Congo", "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumanía", "Rusia", "Samoa", "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur", "Siria", "Somalia", "Sri Lanka", "Suazilandia", "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam", "Tailandia", "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu", "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue" ];

interface GuestModalProps {
  editor: { id?: string; draft: Draft };
  onChange: (value: { id?: string; draft: Draft }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
}

export function GuestModal({ editor, onChange, onClose, onSubmit, submitting }: GuestModalProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const d = editor.draft;
  
  const field = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let val: string | null = event.target.value;
    if (val === '') val = null; // Normalize empty strings to null for optional fields or empty strings if preferred, but string empty is fine. Wait, let's just use event.target.value and clean on submit.
    onChange({ ...editor, draft: { ...d, [key]: event.target.value } });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };
  
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

  const handleValidationAndSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!d.firstName?.trim()) newErrors.firstName = 'Ingresa el nombre';
    if (!d.lastName?.trim()) newErrors.lastName = 'Ingresa el apellido';
    if (!d.documentType) newErrors.documentType = 'Selecciona el tipo de documento';
    if (!d.documentNumber?.trim()) newErrors.documentNumber = 'Ingresa el número de documento';
    if (!d.nationality?.trim()) newErrors.nationality = 'Selecciona la nacionalidad';
    if (!d.birthDate) newErrors.birthDate = 'Ingresa la fecha de nacimiento';
    if (!d.previousCity?.trim()) newErrors.previousCity = 'Ingresa la ciudad anterior';
    if (!d.nextCity?.trim()) newErrors.nextCity = 'Ingresa el siguiente destino';
    
    if (d.email && d.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
      newErrors.email = 'Ingresa un email válido';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Normalize optional fields before saving
    const cleanedDraft = {
      ...d,
      whatsapp: d.whatsapp?.trim() || null,
      email: d.email?.trim() || null,
      emergencyContact: d.emergencyContact?.trim() || null,
      notes: d.notes?.trim() || null,
      previousCity: d.previousCity?.trim() || null,
      nextCity: d.nextCity?.trim() || null,
      occupation: d.occupation?.trim() || null,
    };
    
    onChange({ ...editor, draft: cleanedDraft });
    onSubmit(e);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form className="modal-form guest-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleValidationAndSubmit} noValidate>
        <div className="modal-header">
          <div><span className="kicker">Registro</span><h2>{editor.id ? 'Editar huésped' : 'Nuevo huésped'}</h2></div>
          <button type="button" onClick={onClose} disabled={submitting}><X size={19} /></button>
        </div>
        <div className="form-row">
          <label>Nombre<input value={d.firstName ?? ''} onChange={field('firstName')} disabled={submitting} />
            {errors.firstName && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.firstName}</span>}
          </label>
          <label>Apellido<input value={d.lastName ?? ''} onChange={field('lastName')} disabled={submitting} />
            {errors.lastName && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.lastName}</span>}
          </label>
        </div>
        <div className="form-row">
          <label>Documento
            <select value={d.documentType ?? ''} onChange={field('documentType')} disabled={submitting}>
              <option value="passport">Pasaporte</option>
              <option value="national_id">Cédula de Identidad</option>
              <option value="dni">DNI</option>
            </select>
            {errors.documentType && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.documentType}</span>}
          </label>
          <label>Número<input value={d.documentNumber ?? ''} onChange={field('documentNumber')} disabled={submitting} />
            {errors.documentNumber && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.documentNumber}</span>}
          </label>
        </div>
        <div className="form-row">
          <label>Nacionalidad
            <input list="countries" value={d.nationality ?? ''} onChange={field('nationality')} placeholder="Ej: Argentina" disabled={submitting} />
            <datalist id="countries">
              {countries.map(c => <option key={c} value={c} />)}
            </datalist>
            {errors.nationality && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.nationality}</span>}
          </label>
          <label>WhatsApp (opcional)<input value={d.whatsapp ?? ''} onChange={field('whatsapp')} disabled={submitting} />
            {errors.whatsapp && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.whatsapp}</span>}
          </label>
        </div>
        <div className="form-row">
          <label>Fecha de nacimiento
            <input type="date" value={d.birthDate ?? ''} onChange={field('birthDate')} disabled={submitting} />
            {errors.birthDate && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.birthDate}</span>}
          </label>
          <label>Edad
            <input type="text" value={ageStr} readOnly disabled style={{ background: '#f9fafb', cursor: 'not-allowed' }} placeholder="Calculada de la fecha" />
          </label>
        </div>
        <div className="form-row">
          <label>Email (opcional)<input type="email" value={d.email ?? ''} onChange={field('email')} disabled={submitting} />
            {errors.email && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.email}</span>}
          </label>
          <label>Ciudad anterior<input value={d.previousCity ?? ''} onChange={field('previousCity')} disabled={submitting} />
            {errors.previousCity && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.previousCity}</span>}
          </label>
        </div>
        <div className="form-row">
          <label>Siguiente destino<input value={d.nextCity ?? ''} onChange={field('nextCity')} disabled={submitting} />
            {errors.nextCity && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.nextCity}</span>}
          </label>
          <label>Contacto emergencia (opcional)<input value={d.emergencyContact ?? ''} onChange={field('emergencyContact')} disabled={submitting} />
            {errors.emergencyContact && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.emergencyContact}</span>}
          </label>
        </div>
        <label>Notas (opcional)<textarea value={d.notes ?? ''} onChange={field('notes')} rows={3} disabled={submitting} />
          {errors.notes && <span style={{ color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }}>{errors.notes}</span>}
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}
