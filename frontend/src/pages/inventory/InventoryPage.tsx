import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  History,
  Info,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  X,
} from 'lucide-react'

import { useAuth } from '../../context/useAuth'
import { createPurchase, listInventory, listPurchases, saveProduct } from '../../services/inventory/inventoryService'
import { productSchema, purchaseSchema } from '../../schemas/inventorySchema'
import type { Category, Product, PurchaseRecord } from '../../types/inventory'

type Draft = Omit<Product, 'id' | 'currentStock' | 'lowStock'>
const emptyDraft: Draft = {
  name: '',
  categoryId: '',
  unit: 'unidad',
  costPrice: 0,
  salePrice: 0,
  minimumStock: 0,
  active: true,
}

function formatDate(value?: { seconds: number } | null) {
  if (!value?.seconds) return '-'
  return new Date(value.seconds * 1000).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function InventoryPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Tabs & Filters
  const [activeTab, setActiveTab] = useState<'products' | 'purchases'>('products')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'available'>('all')

  // Modals
  const [editor, setEditor] = useState<{ id?: string; draft: Draft } | null>(null)
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null)
  const [showDirectPurchaseModal, setShowDirectPurchaseModal] = useState(false)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [invData, purchasesData] = await Promise.all([
        listInventory(establishmentId),
        listPurchases(establishmentId),
      ])
      setProducts(invData.products)
      setCategories(invData.categories)
      setPurchases(purchasesData)
    } catch {
      setError('No se pudo cargar el inventario.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase().trim())

      const matchesCategory = categoryFilter === 'all' || p.categoryId === categoryFilter

      const isLow = p.lowStock || (p.currentStock <= p.minimumStock && p.minimumStock > 0)
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && isLow) ||
        (stockFilter === 'available' && !isLow)

      return matchesSearch && matchesCategory && matchesStock
    })
  }, [products, searchQuery, categoryFilter, stockFilter])

  // Summary Metrics
  const lowStockCount = useMemo(() => {
    return products.filter((p) => p.lowStock || (p.currentStock <= p.minimumStock && p.minimumStock > 0)).length
  }, [products])

  const totalInventoryValue = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.currentStock ?? 0) * (p.costPrice ?? 0), 0)
  }, [products])

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <Package size={32} />
        <h1>Cuenta sin establecimiento</h1>
        <p>Inicia sesión en un establecimiento para gestionar productos e inventario.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page inventory-page">
      <header className="page-header">
        <div>
          <span className="kicker">Productos y stock</span>
          <h1>Inventario</h1>
          <p>Catálogo de existencias, control de stock mínimo y registro de compras de insumos.</p>
        </div>
        <div className="page-actions">
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setShowDirectPurchaseModal(true)}
          >
            <ShoppingCart size={16} /> Registrar compra
          </button>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={() => setEditor({ draft: emptyDraft })}
          >
            <Plus size={18} /> Nuevo producto
          </button>
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

      <div className="stay-notice">
        <ShieldCheck size={18} />
        <span>
          Las entradas de compras procesan y actualizan el stock real de forma segura desde el backend (Cloud Functions).
        </span>
      </div>

      <div className="kpi-strip">
        <div>
          <div className="product-top">
            <span>Total Productos</span>
            <Package size={18} color="var(--teal)" />
          </div>
          <strong>{products.length}</strong>
        </div>
        <div className={lowStockCount > 0 ? 'is-debt' : ''}>
          <div className="product-top">
            <span>Stock Bajo</span>
            <AlertTriangle size={18} color={lowStockCount > 0 ? 'var(--coral)' : 'var(--muted)'} />
          </div>
          <strong>{lowStockCount}</strong>
        </div>
        <div>
          <div className="product-top">
            <span>Valor Estimado del Stock</span>
            <Tag size={18} color="var(--teal)" />
          </div>
          <strong>{totalInventoryValue} BOB</strong>
        </div>
      </div>

      <div className="module-tabs">
        <button
          type="button"
          className={`module-tab ${activeTab === 'products' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Catálogo de Productos ({products.length})
        </button>
        <button
          type="button"
          className={`module-tab ${activeTab === 'purchases' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          Historial de Compras / Entradas ({purchases.length})
        </button>
      </div>

      {/* Tab 1: Productos */}
      {activeTab === 'products' && (
        <>
          {/* Toolbar */}
          <div className="guest-toolbar" style={{ flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 250px' }}>
              <Search size={16} color="var(--muted)" />
              <input
                type="text"
                placeholder="Buscar por nombre de producto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={15} color="var(--muted)" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                    background: 'var(--white)',
                    fontSize: '12px',
                  }}
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <select
                className="filter-select"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as any)}
              >
                <option value="all">Todos los estados</option>
                <option value="low">Solo Stock Bajo</option>
                <option value="available">Disponibles</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="screen-state inline-state">
              <span className="loader" />
              Cargando inventario...
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state compact">
              <Package size={32} />
              <h2>Inventario vacío</h2>
              <p>Registra productos para comenzar a controlar el stock.</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state compact">
              <Search size={28} />
              <h2>Sin resultados</h2>
              <p>No se encontraron productos con el filtro aplicado.</p>
            </div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((product) => {
                const category = categories.find((c) => c.id === product.categoryId)
                const isLow = product.lowStock || (product.currentStock <= product.minimumStock && product.minimumStock > 0)

                return (
                  <article className={`product-card ${isLow ? 'low-stock' : ''}`} key={product.id}>
                    <div className="product-top">
                      <span className="product-icon">
                        <Package size={18} />
                      </span>
                      <span
                        className="stock-label"
                        style={{
                          background: isLow ? '#fff0eb' : '#eaf6ed',
                          color: isLow ? '#a94635' : '#1e6631',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {isLow ? 'Stock bajo' : 'Disponible'}
                      </span>
                    </div>
                    <h2>{product.name}</h2>
                    <small>
                      {category ? category.name : 'Sin categoría'} · Unidad: {product.unit}
                    </small>
                    <div className="product-numbers">
                      <div>
                        <span>Stock Actual</span>
                        <strong style={{ color: isLow ? 'var(--coral)' : 'var(--ink)' }}>
                          {product.currentStock ?? 0}
                        </strong>
                      </div>
                      <div>
                        <span>P. Venta</span>
                        <strong>{product.salePrice ?? 0} BOB</strong>
                      </div>
                      <div>
                        <span>Stock Mín.</span>
                        <strong>{product.minimumStock ?? 0}</strong>
                      </div>
                    </div>
                    <div className="product-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          setEditor({
                            id: product.id,
                            draft: {
                              name: product.name,
                              categoryId: product.categoryId ?? '',
                              unit: product.unit ?? 'unidad',
                              costPrice: product.costPrice ?? 0,
                              salePrice: product.salePrice ?? 0,
                              minimumStock: product.minimumStock ?? 0,
                              active: product.active ?? true,
                            },
                          })
                        }
                      >
                        Editar
                      </button>
                      <button
                        className="small-button"
                        type="button"
                        onClick={() => setPurchaseProduct(product)}
                      >
                        <ShoppingCart size={15} /> Compra
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Historial de Compras / Entradas */}
      {activeTab === 'purchases' && (
        <section className="summary-section">
          <div className="section-heading">
            <h2>
              <History size={18} /> Registros de Compras y Entradas de Insumos
            </h2>
          </div>

          {loading ? (
            <div className="screen-state inline-state">
              <span className="loader" />
              Cargando historial de compras...
            </div>
          ) : purchases.length === 0 ? (
            <div className="empty-state compact">
              <ShoppingCart size={28} />
              <h2>No hay compras registradas</h2>
              <p>Las entradas de stock figurarán en esta lista.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead style={{ background: '#f0f4f2', borderBottom: '1px solid var(--line)' }}>
                  <tr>
                    <th style={{ padding: '10px 12px' }}>ID Compra</th>
                    <th style={{ padding: '10px 12px' }}>Items e Insumos</th>
                    <th style={{ padding: '10px 12px' }}>Fecha</th>
                    <th style={{ padding: '10px 12px' }}>Estado Procesamiento</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((pur) => (
                    <tr key={pur.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <strong>#{pur.id.slice(0, 8)}</strong>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                          {pur.items?.map((item, idx) => {
                            const p = products.find((prod) => prod.id === item.productId)
                            return (
                              <li key={idx}>
                                {p ? p.name : `Producto #${item.productId.slice(0, 6)}`} — Cant: {item.quantity} (Costo: {item.unitCost} BOB)
                              </li>
                            )
                          })}
                        </ul>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                        {formatDate(pur.createdAt)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: pur.stockProcessed ? '#dcece3' : '#fff8df',
                            color: pur.stockProcessed ? '#1b5e30' : '#806729',
                          }}
                        >
                          {pur.stockProcessed ? 'Stock Procesado en Firestore ✓' : 'Pendiente de procesar server-side'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal Producto (Crear / Editar) */}
      {editor && (
        <ProductModal
          editor={editor}
          categories={categories}
          establishmentId={establishmentId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            setSuccessMessage('Producto guardado exitosamente.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Compra para Producto Específico */}
      {purchaseProduct && (
        <PurchaseModal
          product={purchaseProduct}
          products={products}
          establishmentId={establishmentId}
          userId={session.user.uid}
          onClose={() => setPurchaseProduct(null)}
          onSaved={() => {
            setPurchaseProduct(null)
            setSuccessMessage('Entrada de compra registrada.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Modal Compra Directa */}
      {showDirectPurchaseModal && products.length > 0 && (
        <PurchaseModal
          product={products[0]}
          products={products}
          establishmentId={establishmentId}
          userId={session.user.uid}
          onClose={() => setShowDirectPurchaseModal(false)}
          onSaved={() => {
            setShowDirectPurchaseModal(false)
            setSuccessMessage('Entrada de compra registrada.')
            void load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

interface ProductModalProps {
  editor: { id?: string; draft: Draft }
  categories: Category[]
  establishmentId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function ProductModal({
  editor,
  categories,
  establishmentId,
  onClose,
  onSaved,
  onError,
}: ProductModalProps) {
  const [draft, setDraft] = useState<Draft>(editor.draft)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const validation = productSchema.safeParse(draft)
    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de producto no válidos.')
      return
    }

    setSubmitting(true)
    try {
      await saveProduct(establishmentId, draft, editor.id)
      onSaved()
    } catch {
      const msg = 'No se pudo guardar el producto en Firestore.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '480px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Catálogo de productos</span>
            <h2>{editor.id ? 'Editar producto' : 'Nuevo producto'}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <label>
          Nombre del producto
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ej. Cerveza Paceña 620ml, Agua Mineral 500ml, Toalla..."
            required
          />
        </label>

        <div className="form-row">
          <label>
            Categoría
            <select
              value={draft.categoryId ?? ''}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidad de medida
            <input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              placeholder="unidad, botella, kg..."
              required
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Precio de Costo (BOB)
            <input
              type="number"
              min="0"
              step="0.5"
              value={draft.costPrice}
              onChange={(e) => setDraft({ ...draft, costPrice: Number(e.target.value) })}
              required
            />
          </label>
          <label>
            Precio de Venta (BOB)
            <input
              type="number"
              min="0"
              step="0.5"
              value={draft.salePrice}
              onChange={(e) => setDraft({ ...draft, salePrice: Number(e.target.value) })}
              required
            />
          </label>
        </div>

        <label>
          Stock Mínimo para Alerta
          <input
            type="number"
            min="0"
            value={draft.minimumStock}
            onChange={(e) => setDraft({ ...draft, minimumStock: Number(e.target.value) })}
            required
          />
        </label>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar producto'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface PurchaseModalProps {
  product: Product
  products: Product[]
  establishmentId: string
  userId: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function PurchaseModal({
  product,
  products,
  establishmentId,
  userId,
  onClose,
  onSaved,
  onError,
}: PurchaseModalProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>(product.id)
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState(product.costPrice ?? 0)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Update cost when product selection changes
  const handleProductChange = (id: string) => {
    setSelectedProductId(id)
    const p = products.find((prod) => prod.id === id)
    if (p) setUnitCost(p.costPrice ?? 0)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const validation = purchaseSchema.safeParse({
      productId: selectedProductId,
      quantity,
      unitCost,
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? 'Datos de compra no válidos.')
      return
    }

    setSubmitting(true)
    try {
      await createPurchase(
        establishmentId,
        [{ productId: selectedProductId, quantity, unitCost }],
        userId
      )
      onSaved()
    } catch {
      const msg = 'No se pudo registrar la compra de inventario.'
      setFormError(msg)
      onError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-form" style={{ maxWidth: '440px' }} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="kicker">Entrada de stock</span>
            <h2>Registrar compra de insumos</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        {formError && (
          <div className="form-error" style={{ margin: '0 0 10px' }}>
            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '6px' }} />
            {formError}
          </div>
        )}

        <label>
          Producto
          <select value={selectedProductId} onChange={(e) => handleProductChange(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (Stock actual: {p.currentStock ?? 0})
              </option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <label>
            Cantidad Ingresada
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Costo Unitario (BOB)
            <input
              type="number"
              min="0"
              step="0.5"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <div style={{ padding: '10px 12px', background: '#f4f8f6', borderRadius: '5px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Costo Total de Compra:</span>
            <strong>{quantity * unitCost} BOB</strong>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={11} />
            El backend (Cloud Function) procesará la compra y actualizará el stock real.
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Registrar entrada de compra'}
          </button>
        </div>
      </form>
    </div>
  )
}
