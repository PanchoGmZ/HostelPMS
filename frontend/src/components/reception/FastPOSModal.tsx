import { useState, useMemo, type FormEvent } from 'react'
import { X, Plus, Minus, Loader2, AlertTriangle, Search } from 'lucide-react'
import { addChargeToFolio } from '../../services/folios/foliosService'
import type { Stay } from '../../types/stays'
import type { Folio } from '../../types/folios'
import type { Product } from '../../types/inventory'

interface FastPOSModalProps {
  establishmentId: string
  stay: Stay
  folio?: Folio
  products: Product[]
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (error: string) => void
}

export function FastPOSModal({
  establishmentId,
  stay,
  folio,
  products,
  onClose,
  onSuccess,
  onError,
}: FastPOSModalProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? '')
  const [searchTerm, setSearchTerm] = useState('')
  const [quantity, setQuantity] = useState<number>(1)
  const [customPrice, setCustomPrice] = useState<number | null>(null)
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Filter available active products
  const activeProducts = useMemo(() => {
    return products.filter((p) => p.active !== false)
  }, [products])

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return activeProducts
    const q = searchTerm.toLowerCase()
    return activeProducts.filter((p) => p.name.toLowerCase().includes(q))
  }, [activeProducts, searchTerm])

  const selectedProduct = useMemo(() => {
    return activeProducts.find((p) => p.id === selectedProductId)
  }, [activeProducts, selectedProductId])

  const unitPrice = customPrice !== null ? customPrice : selectedProduct?.salePrice ?? 10
  const totalPrice = quantity * unitPrice

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!selectedProduct) {
      setFormError('Por favor selecciona un producto.')
      return
    }
    if (quantity <= 0) {
      setFormError('La cantidad debe ser mayor a 0.')
      return
    }
    if (selectedProduct.currentStock < quantity) {
      setFormError(`Stock insuficiente. Disponible: ${selectedProduct.currentStock}`)
      return
    }

    setSubmitting(true)
    try {
      await addChargeToFolio({
        establishmentId,
        stayId: stay.id,
        items: [{ productId: selectedProduct.id, quantity }],
      })

      onSuccess(`Consumo de ${quantity}x ${selectedProduct.name} cargado al folio con éxito.`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar consumo'
      setFormError(`No se pudo registrar el consumo: ${msg}`)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-form"
        style={{ maxWidth: '460px' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-header">
          <div>
            <span className="kicker">Cargar a la Cuenta del Huésped</span>
            <h2>Agregar Consumo</h2>
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

        {/* Product Search & Quick Grid */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Search size={15} color="var(--muted)" />
            <input
              type="text"
              placeholder="Buscar producto (bebida, snack, servicio)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="pos-quick-grid" style={{ maxHeight: '180px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            {filteredProducts.map((prod) => {
              const isSelected = prod.id === selectedProductId
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    setSelectedProductId(prod.id)
                    setCustomPrice(null)
                  }}
                  className={`pos-product-tile ${isSelected ? 'selected' : ''}`}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: isSelected ? '2px solid var(--teal)' : '1px solid var(--line)',
                    background: isSelected ? 'var(--mint)' : 'var(--white)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '13px', color: 'var(--ink)' }}>{prod.name}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--teal-deep)', fontWeight: 600 }}>{prod.salePrice} BOB</span>
                  {prod.currentStock <= prod.minimumStock && (
                    <span style={{ display: 'block', fontSize: '10px', color: 'var(--coral)' }}>Stock: {prod.currentStock}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Quantity selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '10px 14px', background: 'var(--paper)', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Cantidad:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="secondary-button compact-button"
              style={{ padding: '4px 10px', minHeight: '32px' }}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Minus size={14} />
            </button>
            <strong style={{ fontSize: '18px', minWidth: '24px', textAlign: 'center' }}>{quantity}</strong>
            <button
              type="button"
              className="secondary-button compact-button"
              style={{ padding: '4px 10px', minHeight: '32px' }}
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Price & Note */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label>Precio Unit. (BOB)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={unitPrice}
              onChange={(e) => setCustomPrice(Number(e.target.value))}
            />
          </div>
          <div>
            <label>Nota / Detalle (opcional)</label>
            <input
              type="text"
              placeholder="Ej: Fría, servida en terraza"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Total to charge */}
        <div style={{ padding: '10px 14px', background: 'var(--mint)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Total a Cargar:</span>
          <strong style={{ fontSize: '18px', color: 'var(--teal-deep)' }}>
            {totalPrice.toFixed(2)} {folio?.currency ?? 'BOB'}
          </strong>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting || !selectedProduct}>
            {submitting ? (
              <>
                <Loader2 size={16} className="loader" /> Cargando...
              </>
            ) : (
              'Cargar a la Cuenta'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
