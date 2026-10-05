/**
 * GuestInlineForm — v1.15
 *
 * Formulario de huésped reutilizable que puede renderizarse
 * dentro de cualquier flujo (Reserva, Walk-in, Check-in)
 * sin abrir un modal separado.
 *
 * Comparte las mismas reglas de validación y campos que GuestModal.
 */
import { useState } from 'react'
import type { Guest } from '../../types/guests'

export type Draft = Omit<Guest, 'id' | 'searchName'>

export const emptyDraft: Draft = {
  firstName: '',
  lastName: '',
  documentType: 'passport',
  documentNumber: '',
  nationality: '',
  birthDate: null,
  whatsapp: null,
  email: null,
  occupation: null,
  previousCity: null,
  nextCity: null,
  emergencyContact: null,
  notes: null,
}

export const countries = ["Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Antigua y Barbuda", "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia", "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín", "Bielorrusia", "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután", "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre", "Ciudad del Vaticano", "Colombia", "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Granada", "Grecia", "Guatemala", "Guyana", "Guinea", "Guinea ecuatorial", "Guinea-Bisáu", "Haití", "Honduras", "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica", "Japón", "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano", "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Madagascar", "Malasia", "Malaui", "Maldivas", "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia", "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria", "Noruega", "Nueva Zelanda", "Omán", "Países Bajos", "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal", "Reino Unido", "República Centroafricana", "República Checa", "República del Congo", "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumanía", "Rusia", "Samoa", "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur", "Siria", "Somalia", "Sri Lanka", "Suazilandia", "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam", "Tailandia", "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu", "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue"]

/**
 * Valida un draft y devuelve un objeto con errores por campo.
 * Se usa tanto en GuestInlineForm como en GuestModal.
 */
export function validateDraft(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!d.firstName?.trim()) errors.firstName = 'Ingresa el nombre'
  if (!d.lastName?.trim()) errors.lastName = 'Ingresa el apellido'
  if (!d.documentType) errors.documentType = 'Selecciona el tipo de documento'
  if (!d.documentNumber?.trim()) errors.documentNumber = 'Ingresa el número de documento'
  if (!d.nationality?.trim()) errors.nationality = 'Selecciona la nacionalidad'
  if (!d.birthDate) errors.birthDate = 'Ingresa la fecha de nacimiento'
  if (!d.previousCity?.trim()) errors.previousCity = 'Ingresa la ciudad anterior'
  if (!d.nextCity?.trim()) errors.nextCity = 'Ingresa el siguiente destino'
  if (d.email && d.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    errors.email = 'Ingresa un email válido'
  }
  return errors
}

/** Limpia campos opcionales antes de guardar */
export function cleanDraft(d: Draft): Draft {
  return {
    ...d,
    whatsapp: d.whatsapp?.trim() || null,
    email: d.email?.trim() || null,
    emergencyContact: d.emergencyContact?.trim() || null,
    notes: d.notes?.trim() || null,
    previousCity: d.previousCity?.trim() || null,
    nextCity: d.nextCity?.trim() || null,
    occupation: d.occupation?.trim() || null,
  }
}

interface GuestInlineFormProps {
  draft: Draft
  onChange: (draft: Draft) => void
  disabled?: boolean
  /** ID para datalist de nacionalidades (evita colisiones en múltiples instancias) */
  datalistId?: string
  /** Si se valida externamente (ej: al hacer submit del form padre) */
  externalErrors?: Record<string, string>
}

/**
 * Campos de huésped inline — se integra dentro de un form existente.
 * NO renderiza <form>, NO renderiza botones de submit/cancel.
 */
export function GuestInlineForm({
  draft: d,
  onChange,
  disabled = false,
  datalistId = 'countries-inline',
  externalErrors,
}: GuestInlineFormProps) {
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const errors = externalErrors ?? localErrors

  const field = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    onChange({ ...d, [key]: event.target.value })
    if (errors[key]) {
      const next = { ...localErrors }
      delete next[key]
      setLocalErrors(next)
    }
  }

  let ageStr = ''
  if (d.birthDate) {
    const bDate = new Date(d.birthDate)
    const today = new Date()
    let age = today.getFullYear() - bDate.getFullYear()
    const m = today.getMonth() - bDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
      age--
    }
    ageStr = `${age} años`
  }

  const errStyle = { color: 'var(--coral)', fontSize: '11px', marginTop: '2px' }

  return (
    <div className="guest-inline-fields" style={{ display: 'grid', gap: '10px' }}>
      <div className="form-row">
        <label>Nombre <span style={{ color: 'var(--coral)' }}>*</span>
          <input value={d.firstName ?? ''} onChange={field('firstName')} disabled={disabled} placeholder="Juan" />
          {errors.firstName && <span style={errStyle}>{errors.firstName}</span>}
        </label>
        <label>Apellido <span style={{ color: 'var(--coral)' }}>*</span>
          <input value={d.lastName ?? ''} onChange={field('lastName')} disabled={disabled} placeholder="Pérez" />
          {errors.lastName && <span style={errStyle}>{errors.lastName}</span>}
        </label>
      </div>
      <div className="form-row">
        <label>Documento <span style={{ color: 'var(--coral)' }}>*</span>
          <select value={d.documentType ?? ''} onChange={field('documentType')} disabled={disabled}>
            <option value="passport">Pasaporte</option>
            <option value="national_id">Cédula de Identidad</option>
            <option value="dni">DNI</option>
          </select>
          {errors.documentType && <span style={errStyle}>{errors.documentType}</span>}
        </label>
        <label>Número <span style={{ color: 'var(--coral)' }}>*</span>
          <input value={d.documentNumber ?? ''} onChange={field('documentNumber')} disabled={disabled} placeholder="12345678 o AT117122" />
          {errors.documentNumber && <span style={errStyle}>{errors.documentNumber}</span>}
        </label>
      </div>
      <div className="form-row">
        <label>Nacionalidad <span style={{ color: 'var(--coral)' }}>*</span>
          <input list={datalistId} value={d.nationality ?? ''} onChange={field('nationality')} placeholder="Ej: Argentina" disabled={disabled} />
          <datalist id={datalistId}>
            {countries.map(c => <option key={c} value={c} />)}
          </datalist>
          {errors.nationality && <span style={errStyle}>{errors.nationality}</span>}
        </label>
        <label>WhatsApp (opcional)
          <input value={d.whatsapp ?? ''} onChange={field('whatsapp')} disabled={disabled} placeholder="+591 ..." />
        </label>
      </div>
      <div className="form-row">
        <label>Fecha de nacimiento <span style={{ color: 'var(--coral)' }}>*</span>
          <input type="date" value={d.birthDate ?? ''} onChange={field('birthDate')} disabled={disabled} />
          {errors.birthDate && <span style={errStyle}>{errors.birthDate}</span>}
        </label>
        <label>Edad
          <input type="text" value={ageStr} readOnly disabled style={{ background: '#f9fafb', cursor: 'not-allowed' }} placeholder="Calculada" />
        </label>
      </div>
      <div className="form-row">
        <label>Email (opcional)
          <input type="email" value={d.email ?? ''} onChange={field('email')} disabled={disabled} placeholder="correo@ejemplo.com" />
          {errors.email && <span style={errStyle}>{errors.email}</span>}
        </label>
        <label>Ciudad anterior <span style={{ color: 'var(--coral)' }}>*</span>
          <input value={d.previousCity ?? ''} onChange={field('previousCity')} disabled={disabled} placeholder="La Paz, Cusco..." />
          {errors.previousCity && <span style={errStyle}>{errors.previousCity}</span>}
        </label>
      </div>
      <div className="form-row">
        <label>Siguiente destino <span style={{ color: 'var(--coral)' }}>*</span>
          <input value={d.nextCity ?? ''} onChange={field('nextCity')} disabled={disabled} placeholder="Uyuni, Sucre..." />
          {errors.nextCity && <span style={errStyle}>{errors.nextCity}</span>}
        </label>
        <label>Contacto emergencia (opcional)
          <input value={d.emergencyContact ?? ''} onChange={field('emergencyContact')} disabled={disabled} placeholder="Nombre y teléfono" />
        </label>
      </div>
      <label>Notas (opcional)
        <textarea value={d.notes ?? ''} onChange={field('notes')} rows={2} disabled={disabled} placeholder="Alergias, preferencias..." />
      </label>
    </div>
  )
}
