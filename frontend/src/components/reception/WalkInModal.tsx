import { useState, useMemo, useEffect, type FormEvent } from 'react'
import { X, UserPlus, UserCheck, AlertTriangle, Loader2 } from 'lucide-react'
import { saveGuest } from '../../services/guests/guestsService'
import { createReservation } from '../../services/reservations/reservationsService'
import { checkInGuest } from '../../services/stays/staysService'
import type { Bed, Room } from '../../types/rooms'
import type { Guest } from '../../types/guests'
import type { Reservation } from '../../types/reservations'
import type { Stay } from '../../types/stays'

interface WalkInModalProps {
  establishmentId: string
  bed: Bed
  room: Room
  rooms?: Room[]
  reservations?: Reservation[]
  stays?: Stay[]
  existingGuests: Guest[]
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const countries = [ "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Antigua y Barbuda", "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia", "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín", "Bielorrusia", "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután", "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre", "Ciudad del Vaticano", "Colombia", "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador", "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Granada", "Grecia", "Guatemala", "Guyana", "Guinea", "Guinea ecuatorial", "Guinea-Bisáu", "Haití", "Honduras", "Hungría", "India", "Indonesia", "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica", "Japón", "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano", "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Madagascar", "Malasia", "Malaui", "Maldivas", "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia", "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria", "Noruega", "Nueva Zelanda", "Omán", "Países Bajos", "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal", "Reino Unido", "República Centroafricana", "República Checa", "República del Congo", "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumanía", "Rusia", "Samoa", "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur", "Siria", "Somalia", "Sri Lanka", "Suazilandia", "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam", "Tailandia", "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu", "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue" ]

export function WalkInModal({
  establishmentId,
  bed,
  room,
  rooms = [],
  reservations = [],
  stays = [],
  existingGuests,
  onClose,
  onSuccess,
  onError,
}: WalkInModalProps) {
  const today = new Date()
  const todayStr = toLocalDateString(today)

  // Selected Room & Bed
  const [selectedRoomId, setSelectedRoomId] = useState(room.id)
  const [selectedBedId, setSelectedBedId] = useState(bed.id)

  // Mode: select existing guest or create new
  const [isNewGuest, setIsNewGuest] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState(existingGuests[0]?.id ?? '')
  const [guestSearch, setGuestSearch] = useState('')

  // New guest form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [docType, setDocType] = useState<string>('ci')
  const [docNumber, setDocNumber] = useState('')
  const [nationality, setNationality] = useState('Boliviana')
  const [birthDate, setBirthDate] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [previousCity, setPreviousCity] = useState('')
  const [nextCity, setNextCity] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [notes, setNotes] = useState('')

  // Stay parameters
  const [nights, setNights] = useState(1)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [deposit, setDeposit] = useState(0)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Calculated checkout date
  const checkOutDateStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + Math.max(1, nights))
    return toLocalDateString(d)
  }, [nights])

  // Availability logic
  const occupiedBedIds = useMemo(() => {
    const ids = new Set<string>()
    // Current active stays
    stays.forEach(s => {
      if (s.status === 'active') {
        s.bedIds?.forEach(id => ids.add(id))
      }
    })
    
    // Reservations overlapping [today, checkOutDate)
    const checkInDate = new Date(`${todayStr}T00:00:00Z`);
    const checkOutDate = new Date(`${checkOutDateStr}T00:00:00Z`);
    
    reservations.forEach(r => {
      if (r.status !== 'confirmed') return;
      if (!r.checkInDate || !r.checkOutDate) return;
      const rIn = new Date(r.checkInDate.seconds * 1000);
      const rOut = new Date(r.checkOutDate.seconds * 1000);
      if (rIn < checkOutDate && rOut > checkInDate) {
        r.bedIds?.forEach(id => ids.add(id))
      }
    })
    return ids
  }, [stays, reservations, todayStr, checkOutDateStr])

  const selectedRoomObj = useMemo(() => rooms.find((r) => r.id === selectedRoomId) || room, [rooms, selectedRoomId, room])
  
  const availableBeds = useMemo(() => {
    return selectedRoomObj.beds.filter((b) => b.status === 'active' && !occupiedBedIds.has(b.id))
  }, [selectedRoomObj, occupiedBedIds])

  const effectiveBedId = selectedBedId || availableBeds[0]?.id || ''
  const effectiveBedObj = availableBeds.find((b) => b.id === effectiveBedId)
  
  const bedDisplayName = effectiveBedObj?.label || (effectiveBedId ? `Cama ${effectiveBedId.slice(-3)}` : 'Sin asignar')

  // Set default price when bed changes
  useEffect(() => {
    if (effectiveBedObj) {
      setPricePerNight(effectiveBedObj.basePriceBed ?? selectedRoomObj.basePriceRoom ?? 50)
    }
  }, [effectiveBedObj, selectedRoomObj])

  const totalEstimate = useMemo(() => {
    return Math.max(1, nights) * Math.max(0, pricePerNight)
  }, [nights, pricePerNight])

  // Filter existing guests
  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return existingGuests
    const q = guestSearch.toLowerCase()
    return existingGuests.filter(
      (g) =>
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q)
    )
  }, [existingGuests, guestSearch])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    let finalGuestId = selectedGuestId

    // Validate guest
    if (isNewGuest) {
      if (!firstName.trim() || !lastName.trim() || !docNumber.trim() || !birthDate.trim()) {
        setFormError('Por favor completa los campos obligatorios del huésped (Nombre, Apellido, Doc y Nacimiento).')
        return
      }
    } else {
      if (!finalGuestId) {
        setFormError('Selecciona un huésped o crea uno nuevo.')
        return
      }
    }

    if (!effectiveBedId) {
      setFormError('No hay camas disponibles en la habitación seleccionada para estas fechas.')
      return
    }

    if (nights <= 0) {
      setFormError('La estadía debe ser de al menos 1 noche.')
      return
    }

    setSubmitting(true)
    try {
      // 1. If new guest, save to Firestore and get ID properly!
      if (isNewGuest) {
        finalGuestId = await saveGuest(
          establishmentId,
          {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            documentType: docType,
            documentNumber: docNumber.trim(),
            nationality: nationality.trim(),
            birthDate: birthDate || null,
            whatsapp: whatsapp.trim(),
            email: email.trim() || null,
            occupation: null,
            previousCity: previousCity.trim() || null,
            nextCity: nextCity.trim() || null,
            emergencyContact: emergencyContact.trim() || null,
            notes: notes.trim() || null,
          }
        )
      }

      // 2. Build dates array for pricePerNight
      const dates: string[] = []
      for (
        let d = new Date(`${todayStr}T00:00:00Z`);
        d < new Date(`${checkOutDateStr}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        dates.push(d.toISOString().slice(0, 10))
      }

      const pricePerNightMatrix = {
        [effectiveBedId]: Object.fromEntries(dates.map((date) => [date, pricePerNight])),
      }

      // 3. Create instant reservation (will fail if availability conflicts in backend)
      const resResult = await createReservation({
        establishmentId,
        guestId: finalGuestId,
        roomId: selectedRoomObj.id,
        bedIds: [effectiveBedId],
        saleMode: 'bed',
        checkIn: todayStr,
        checkOut: checkOutDateStr,
        pricePerNight: pricePerNightMatrix,
        channel: 'direct',
      })

      if (!resResult?.reservationId) {
        throw new Error('No se pudo generar la reserva para el check-in.')
      }

      // 4. Perform immediate check-in
      await checkInGuest({
        establishmentId,
        reservationId: resResult.reservationId,
        guestIds: [finalGuestId],
        roomId: selectedRoomObj.id,
        bedIds: [effectiveBedId],
        expectedCheckOutDate: checkOutDateStr,
        deposit,
        documentVerified: true,
      })

      onSuccess(`¡Walk-in registrado con éxito! Huésped alojado en ${bedDisplayName}.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar walk-in'
      setFormError(`No se pudo completar el walk-in: ${msg}`)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-form"
        style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">Llegada Inmediata (Mostrador)</span>
            <h2>Walk-in: Recepción</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        )}

        {/* Guest selector mode */}
        <div className="walkin-guest-toggle" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`filter-chip ${!isNewGuest ? 'active' : ''}`}
              onClick={() => setIsNewGuest(false)}
            >
              <UserCheck size={14} /> Huésped Registrado
            </button>
            <button
              type="button"
              className={`filter-chip ${isNewGuest ? 'active' : ''}`}
              onClick={() => setIsNewGuest(true)}
            >
              <UserPlus size={14} /> Nuevo Huésped
            </button>
          </div>
        </div>

        {!isNewGuest ? (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '5px' }}>
              Buscar o seleccionar huésped:
            </label>
            <input
              type="text"
              placeholder="Buscar por nombre o documento..."
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <select
              value={selectedGuestId}
              onChange={(e) => setSelectedGuestId(e.target.value)}
              required
            >
              {filteredGuests.length === 0 ? (
                <option value="">No hay huéspedes que coincidan</option>
              ) : (
                filteredGuests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.firstName} {g.lastName} — Doc: {g.documentNumber} ({g.nationality ?? 'N/A'})
                  </option>
                ))
              )}
            </select>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label>Nombre *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Juan"
              />
            </div>
            <div>
              <label>Apellido *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Pérez"
              />
            </div>
            <div>
              <label>Tipo Documento</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="ci">Cédula de Identidad (CI)</option>
                <option value="passport">Pasaporte</option>
                <option value="dni">DNI / Extranjero</option>
              </select>
            </div>
            <div>
              <label>Nº Documento *</label>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                required
                placeholder="12345678"
              />
            </div>
            <div>
              <label>Nacionalidad</label>
              <input
                type="text"
                list="countries"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="Ej. Boliviana"
              />
              <datalist id="countries">
                {countries.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label>Fecha de Nacimiento *</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label>WhatsApp / Teléfono</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+591 ..."
              />
            </div>
            <div>
              <label>Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label>Ciudad Anterior</label>
              <input
                type="text"
                value={previousCity}
                onChange={(e) => setPreviousCity(e.target.value)}
              />
            </div>
            <div>
              <label>Siguiente Destino</label>
              <input
                type="text"
                value={nextCity}
                onChange={(e) => setNextCity(e.target.value)}
              />
            </div>
            <div>
              <label>Contacto Emergencia</label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Nombre y teléfono"
              />
            </div>
            <div>
              <label>Notas</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alergias, etc."
              />
            </div>
          </div>
        )}

        <hr style={{ margin: '14px 0', borderTop: '1px solid var(--line)' }} />

        {/* Room and Bed Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Habitación</label>
            <select
              value={selectedRoomId}
              onChange={(e) => {
                setSelectedRoomId(e.target.value)
                setSelectedBedId('')
              }}
              required
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Cama (Libre todo el rango)</label>
            <select
              value={effectiveBedId}
              onChange={(e) => setSelectedBedId(e.target.value)}
              required
              disabled={availableBeds.length === 0}
            >
              {availableBeds.length === 0 && <option value="">Ninguna disponible</option>}
              {availableBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label || `Cama ${b.id.slice(-3)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stay details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Noches</label>
            <input
              type="number"
              min="1"
              value={nights}
              onChange={(e) => setNights(Math.max(1, Number(e.target.value)))}
              required
            />
          </div>
          <div>
            <label>Precio / Noche (BOB)</label>
            <input
              type="number"
              min="0"
              value={pricePerNight}
              onChange={(e) => setPricePerNight(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label>Garantía / Depósito</label>
            <input
              type="number"
              min="0"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Summary Card */}
        <div style={{ padding: '10px 14px', background: 'var(--mint)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Fecha de Salida Prevista:</span>
            <strong>{checkOutDateStr}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Total Estimado del Alojamiento:</span>
            <strong style={{ fontSize: '15px', color: 'var(--teal-deep)' }}>{totalEstimate} BOB</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting || !effectiveBedId}>
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Procesando ingreso...
              </>
            ) : (
              'Confirmar Check-in Inmediato'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
