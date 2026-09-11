import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Plus, ShoppingBag, ShoppingCart } from 'lucide-react'

import { useAuth } from '../../context/useAuth'
import { addChargeToFolio, listFolios } from '../../services/folios/foliosService'
import { listStays } from '../../services/stays/staysService'
import { searchGuests } from '../../services/guests/guestsService'
import { listRooms } from '../../services/rooms/roomsService'
import type { Folio } from '../../types/folios'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'

export function POSPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [folios, setFolios] = useState<Folio[]>([])
  const [stays, setStays] = useState<Stay[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  const [selectedFolioId, setSelectedFolioId] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)
  const [unitPrice, setUnitPrice] = useState<number>(0)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [nextFolios, nextStays, nextGuests, nextRooms] = await Promise.all([
        listFolios(establishmentId),
        listStays(establishmentId),
        searchGuests(establishmentId, ''),
        listRooms(establishmentId),
      ])
      setFolios(nextFolios)
      setStays(nextStays)
      setGuests(nextGuests)
      setRooms(nextRooms)
      if (nextFolios.length > 0) {
        setSelectedFolioId(nextFolios[0].id)
      }
    } catch {
      setError('No se pudieron cargar los datos del punto de venta POS.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const submitCharge = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const selectedFolio = folios.find((f) => f.id === selectedFolioId)
    if (!establishmentId || !selectedFolio || !description.trim() || quantity <= 0) return

    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await addChargeToFolio({
        establishmentId,
        stayId: selectedFolio.stayId,
        description,
        quantity,
        unitPrice,
      })
      setSuccessMessage('Consumo cargado exitosamente a la estadía del huésped.')
      setDescription('')
      setQuantity(1)
      setUnitPrice(0)
      void load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(`No se pudo registrar el consumo: ${msg}. Verifica que la Cloud Function 'addConsumption' esté activa.`)
    } finally {
      setSubmitting(false)
    }
  }


  if (!establishmentId) {
    return (
      <div className="empty-state">
        <ShoppingBag size={32} />
        <h1>Cuenta sin establecimiento</h1>
      </div>
    )
  }

  return (
    <div className="dashboard-page pos-page">
      <header className="page-header">
        <div>
          <span className="kicker">Punto de venta (POS)</span>
          <h1>Consumos rápidos</h1>
          <p>Registra cargos directos de bebidas, snacks o servicios adicionales a la estadía del huésped.</p>
        </div>
      </header>

      {error && (
        <div className="form-error">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success">
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando punto de venta...
        </div>
      ) : folios.length === 0 ? (
        <div className="empty-state compact">
          <ShoppingCart size={32} />
          <h2>No hay folios de estadía disponibles</h2>
          <p>Para cargar un consumo debe existir al menos una estadía activa en el hostel.</p>
        </div>
      ) : (
        <div className="pos-layout">
          <form className="modal-form pos-form" onSubmit={submitCharge}>
            <div className="modal-header">
              <h2>Nuevo cargo de consumo</h2>
            </div>

            <label>
              Seleccionar Estadía / Folio del Huésped
              <select value={selectedFolioId} onChange={(e) => setSelectedFolioId(e.target.value)} required>
                {folios.map((folio) => {
                  const stay = stays.find((s) => s.id === folio.stayId)
                  const guest = guests.find((g) => stay?.guestIds.includes(g.id))
                  const room = rooms.find((r) => r.id === stay?.roomId)
                  return (
                    <option key={folio.id} value={folio.id}>
                      {guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped'} {room ? `(Hab. ${room.name})` : ''} · Folio #{folio.id.slice(0, 6)}
                    </option>
                  )
                })}
              </select>
            </label>

            <label>
              Producto o Concepto del Consumo
              <input
                type="text"
                placeholder="Ej. Cerveza artesanal, Agua mineral 500ml, Lavandería..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            <div className="form-row">
              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Precio Unitario (BOB)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                  required
                />
              </label>
            </div>

            <div className="estimate-box">
              <span>Total Estimado a Cargar:</span>
              <strong>{quantity * unitPrice} BOB</strong>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="primary-button" type="submit" disabled={submitting}>
                <Plus size={16} />
                {submitting ? 'Cargando consumo...' : 'Registrar Consumo al Folio'}
              </button>
            </div>
          </form>

          {/* Mini Resumen Folio Seleccionado */}
          <div className="settings-section pos-side">
            <h3>Folio seleccionado</h3>
            {(() => {
              const currentFolio = folios.find((f) => f.id === selectedFolioId)
              if (!currentFolio) return <p style={{ color: 'var(--muted)' }}>Selecciona un folio.</p>
              return (
                <div style={{ display: 'grid', gap: '8px', fontSize: '13px', marginTop: '10px' }}>
                  <div>
                    <small style={{ color: 'var(--muted)' }}>Cargos Registrados:</small>
                    <div><strong>{currentFolio.totalCharges ?? 0} {currentFolio.currency}</strong></div>
                  </div>
                  <div>
                    <small style={{ color: 'var(--muted)' }}>Pagos Registrados:</small>
                    <div><strong>{currentFolio.totalPaid ?? 0} {currentFolio.currency}</strong></div>
                  </div>
                  <div>
                    <small style={{ color: 'var(--muted)' }}>Saldo Pendiente:</small>
                    <div className={currentFolio.balance > 0 ? 'balance-debt' : 'balance-ok'}>
                      {currentFolio.balance ?? 0} {currentFolio.currency}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
