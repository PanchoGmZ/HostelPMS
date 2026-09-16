import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Info,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  X,
  LayoutGrid,
  List,
  Clock,
  CircleCheck
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
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="kicker" style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            INVENTARIO Y SUMINISTROS 
            <span style={{ color: '#d1d5db' }}>•</span>
            {products.length} PRODUCTOS REGISTRADOS
            <span style={{ color: '#d1d5db' }}>•</span>
            <span style={{ color: '#10b981', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CircleCheck size={10} /> SINCRONIZADO
            </span>
          </span>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '28px', color: 'var(--ink)' }}>Inventario</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>Catálogo de existencias, control de stock mínimo y registro de compras de insumos.</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '12px' }}>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setShowDirectPurchaseModal(true)}
            style={{ background: 'white' }}
          >
            <ShoppingCart size={16} /> Registrar compra
          </button>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={() => setEditor({ draft: emptyDraft })}
            style={{ background: '#f97316', borderColor: '#f97316' }}
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
        <div className="stay-notice success" style={{ marginBottom: '16px' }}>
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      <div className="notice-bar">
        <p>
          <ShieldCheck size={18} color="#d97706" />
          Las transacciones de stock e ingreso de compras son procesadas y validadas por el backend (Cloud Functions).
        </p>
        <div className="atomic-badge">
          <span style={{ width: '6px', height: '6px', background: '#d97706', borderRadius: '50%' }} />
          Transacción atómica
        </div>
      </div>

      <div className="inventory-metrics">
        <div className="metric-card">
          <span>Total Productos</span>
          <strong>{products.length} <small className="metric-status-green">Activos</small></strong>
          <Package className="metric-icon-top" size={20} />
        </div>
        <div className="metric-card">
          <span>Stock Bajo / Crítico</span>
          <strong>{lowStockCount} <small className="metric-status-yellow">por reponer</small></strong>
          <AlertTriangle className="metric-icon-top" size={20} color="#d97706" />
        </div>
        <div className="metric-card">
          <span>Valor Estimado</span>
          <strong>{totalInventoryValue} <small style={{ color: 'var(--muted)' }}>BOB</small></strong>
          <Tag className="metric-icon-top" size={20} />
        </div>
        <div className="metric-card">
          <span>Última Entrada</span>
          <strong>{purchases.length > 0 ? (
            <span style={{ fontSize: '15px' }}>{formatDate(purchases[0].createdAt)}</span>
          ) : (
            <span style={{ fontSize: '15px', color: 'var(--muted)' }}>Sin entradas</span>
          )}</strong>
          <Clock className="metric-icon-top" size={20} />
        </div>
      </div>

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
          <div className="inventory-toolbar">
            <div className="toolbar-search">
              <Search size={16} color="var(--muted)" />
              <input
                type="text"
                placeholder="Buscar por producto, insumo o código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="toolbar-filters">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as any)}
              >
                <option value="all">Todos los estados</option>
                <option value="low">Stock Bajo / Crítico</option>
                <option value="available">Disponibles</option>
              </select>

              <div className="layout-toggle">
                <button type="button" className="active"><LayoutGrid size={16} /></button>
                <button type="button"><List size={16} /></button>
              </div>
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
            <div className="inv-product-grid">
              {filteredProducts.map((product) => {
                const category = categories.find((c) => c.id === product.categoryId)
                const currentStock = product.currentStock ?? 0;
                const minStock = product.minimumStock ?? 0;
                const isLow = product.lowStock || (currentStock <= minStock && minStock > 0)
                const isZero = currentStock === 0;
                
                const maxLevel = minStock > 0 ? minStock * 2 : (currentStock === 0 ? 1 : currentStock);
                const progressPercent = Math.min((currentStock / (maxLevel || 1)) * 100, 100);
                
                const statusClass = isZero ? 'none' : isLow ? 'low' : 'ok';
                const statusText = isZero ? 'Sin stock' : isLow ? 'Stock bajo' : 'Disponible';
                const progressText = isZero 
                  ? `0 de ${minStock} min. (Agotado)` 
                  : (currentStock >= minStock && minStock > 0) 
                    ? 'Existencia óptima' 
                    : `${currentStock} de ${minStock} requeridas`;

                return (
                  <article className="inv-product-card" key={product.id}>
                    <div className="card-header">
                      <div className="card-header-left">
                        <div className="product-icon-box">
                          <Package size={20} />
                        </div>
                        <div className="product-title">
                          <strong>{product.name}</strong>
                          <small>{category ? category.name : 'Bebidas'} • Unidad: {product.unit}</small>
                        </div>
                      </div>
                      <div className={`stock-badge ${statusClass}`}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                        {statusText}
                      </div>
                    </div>

                    <div className="stock-progress-area">
                      <div className="stock-numbers">
                        <div>
                          <span>STOCK ACTUAL</span>
                          <strong style={{ color: isZero ? 'var(--coral)' : isLow ? '#d97706' : 'var(--ink)' }}>
                            {currentStock} <small style={{ fontSize: '13px', color: 'var(--muted)' }}>{currentStock === 1 ? 'unidad' : 'unidades'}</small>
                          </strong>
                        </div>
                        <div>
                          <span>MÍNIMO</span>
                          <strong>{minStock} u</strong>
                        </div>
                      </div>
                      <div className="progress-bar-container">
                        <div className={`progress-bar-fill ${statusClass}`} style={{ width: `${progressPercent}%` }} />
                      </div>
                      <div className="progress-text">
                        <span style={{ color: isZero ? 'var(--coral)' : isLow ? '#d97706' : '#10b981' }}>{progressText}</span>
                        <span>{Math.round(progressPercent)}% nivel</span>
                      </div>
                    </div>

                    <div className="price-area">
                      <div>
                        <span>Precio de venta</span>
                        <strong>{product.salePrice ?? 0} BOB</strong>
                      </div>
                      <div>
                        <span>Costo estimado</span>
                        <strong>{product.costPrice ?? 0} BOB</strong>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="btn-edit"
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
                        <Pencil size={15} /> Editar
                      </button>
                      <button
                        className="btn-add"
                        type="button"
                        onClick={() => setPurchaseProduct(product)}
                      >
                        <Plus size={15} /> Entrada
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Mostrando {filteredProducts.length} productos registrados de {products.length} totales</span>
            <span style={{ color: '#10b981', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }} /> Sincronizado en tiempo real con Cloud Functions
            </span>
          </div>
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
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function PurchaseModal({
  product,
  products,
  establishmentId,
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
        [{ productId: selectedProductId, quantity, unitCost }]
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
