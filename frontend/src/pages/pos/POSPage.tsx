import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  CreditCard,
  Package,
  Search,
  ShoppingCart,
  Wallet,
  Plus,
  Minus,
  Trash2,
  Clock,
  User,
  Home,
  Info
} from 'lucide-react'

import { useAuth } from '../../context/useAuth'
import { addConsumption } from '../../services/folios/foliosService'
import { listStays } from '../../services/stays/staysService'
import { searchGuests } from '../../services/guests/guestsService'
import { listRooms } from '../../services/rooms/roomsService'
import { listInventory } from '../../services/inventory/inventoryService'
import { PAYMENT_METHODS } from '../../services/payments/paymentsService'
import type { Stay } from '../../types/stays'
import type { Guest } from '../../types/guests'
import type { Room } from '../../types/rooms'
import type { Product, Category } from '../../types/inventory'

import './POSPage.css'

interface CartItem {
  product: Product
  quantity: number
}

export function POSPage() {
  const { session } = useAuth()
  const establishmentId = session?.establishmentId

  const [stays, setStays] = useState<Stay[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  // Selection state
  const [selectedStayId, setSelectedStayId] = useState<string>('')
  const [productSearch, setProductSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  
  // Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  // Pay mode
  const [payMode, setPayMode] = useState<'account' | 'payNow'>('account')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'qr'>('cash')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!establishmentId) return
    setLoading(true)
    setError(null)
    try {
      const [nextStays, nextGuests, nextRooms, inventoryData] = await Promise.all([
        listStays(establishmentId),
        searchGuests(establishmentId, ''),
        listRooms(establishmentId),
        listInventory(establishmentId),
      ])
      const activeStays = nextStays.filter((s) => s.status === 'active')
      setStays(activeStays)
      setGuests(nextGuests)
      setRooms(nextRooms)
      setProducts(inventoryData.products.filter((p) => p.active !== false))
      setCategories(inventoryData.categories)
      if (activeStays.length > 0 && !selectedStayId) {
        setSelectedStayId(activeStays[0].id)
      }
    } catch {
      setError('No se pudieron cargar los datos del punto de venta.')
    } finally {
      setLoading(false)
    }
  }, [establishmentId, selectedStayId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = products
    
    if (activeCategory !== 'all') {
      list = list.filter(p => p.categoryId === activeCategory)
    }

    const q = productSearch.toLowerCase().trim()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          categories
            .find((c) => c.id === p.categoryId)
            ?.name.toLowerCase()
            .includes(q)
      )
    }
    return list
  }, [products, productSearch, categories, activeCategory])

  const total = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + (item.product.salePrice * item.quantity), 0)
  }, [cartItems])

  const canSubmit = selectedStayId && cartItems.length > 0 && !submitting

  const addProductToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          setError(`No hay suficiente stock disponible para ${product.name}.`)
          setTimeout(() => setError(null), 3000)
          return prev
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, newQuantity: number) => {
    setCartItems(prev => {
      if (newQuantity <= 0) {
        return prev.filter(item => item.product.id !== productId)
      }
      return prev.map(item => {
        if (item.product.id === productId) {
          if (newQuantity > item.product.currentStock) {
            setError(`No hay suficiente stock disponible para ${item.product.name}.`)
            setTimeout(() => setError(null), 3000)
            return item
          }
          return { ...item, quantity: newQuantity }
        }
        return item
      })
    })
  }

  const removeProduct = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId))
  }

  const submitConsumption = async () => {
    if (!establishmentId || !selectedStayId || cartItems.length === 0) return
    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await addConsumption({
        establishmentId,
        stayId: selectedStayId,
        items: cartItems.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        ...(payMode === 'payNow'
          ? { payNow: { method: paymentMethod } }
          : {}),
      })
      const modeText =
        payMode === 'payNow' ? 'Pagado inmediatamente' : 'agregados a la cuenta'
      setSuccessMessage(
        `✓ ${cartItems.length} productos registrados — ${total} BOB — ${modeText}`
      )
      setCartItems([])
      setProductSearch('')
      setPayMode('account')
      void load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(`No se pudieron registrar los consumos: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!establishmentId) {
    return (
      <div className="empty-state">
        <ShoppingCart size={32} />
        <h1>Cuenta sin establecimiento</h1>
      </div>
    )
  }

  const selectedStay = stays.find(s => s.id === selectedStayId)
  let checkoutDateStr = ''
  if (selectedStay && selectedStay.expectedCheckOutDate) {
     const dt = new Date(selectedStay.expectedCheckOutDate.seconds * 1000)
     checkoutDateStr = dt.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="pos-page">
      <header className="pos-header">
        <div className="pos-header-left">
          <span className="kicker">
            PUNTO DE VENTA (POS) <span className="kicker-dot">•</span> <span className="kicker-sub">Módulo de Ventas Rápidas</span>
          </span>
          <h1>Consumos rápidos</h1>
          <p>Selecciona productos del inventario para registrarlos como consumo del huésped.</p>
        </div>
        <div className="pos-header-actions">
          <button className="btn-history" type="button" onClick={() => alert("Historial no implementado")}>
            <Clock size={16} /> Historial de consumos
          </button>
          <div className="badge-sync">
            <Check size={16} /> Stock sincronizado
          </div>
        </div>
      </header>

      {error && (
        <div className="form-error" style={{ marginBottom: '20px' }}>
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="stay-notice success" style={{ marginBottom: '20px' }}>
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="screen-state inline-state">
          <span className="loader" />
          Cargando punto de venta...
        </div>
      ) : stays.length === 0 ? (
        <div className="empty-state compact">
          <ShoppingCart size={32} />
          <h2>No hay estadías activas</h2>
          <p>Para registrar consumos debe existir al menos una estadía activa.</p>
        </div>
      ) : (
        <div className="pos-layout">
          {/* ─── LEFT PANEL ─── */}
          <div className="pos-main">
            {/* Stay Selector Card */}
            <div className="pos-card">
              <div className="pos-card-header">
                <span className="pos-card-title">
                  <User size={14} /> ESTADÍA / HUÉSPED DESTINO
                </span>
                <span style={{ fontSize: '12px', color: 'var(--coral)', cursor: 'pointer', fontWeight: 600 }}>Cambiar folio</span>
              </div>

              <select
                className="pos-select"
                value={selectedStayId}
                onChange={(e) => setSelectedStayId(e.target.value)}
                required
              >
                {stays.map((stay) => {
                  const guest = guests.find((g) => stay.guestIds.includes(g.id))
                  const room = rooms.find((r) => r.id === stay.roomId)
                  return (
                    <option key={stay.id} value={stay.id}>
                      {guest ? `${guest.firstName} ${guest.lastName}` : 'Huésped'}{' '}
                      {room ? `(Hab. ${room.name})` : ''} · Estadía #{stay.id.slice(0, 6)}
                    </option>
                  )
                })}
              </select>

              <div className="pos-badges-row">
                {selectedStay && (
                  <span className="pos-badge room">
                    <Home size={12} />
                    Hab. {rooms.find(r => r.id === selectedStay.roomId)?.name || '---'} (Camas: ---)
                  </span>
                )}
                <span className="pos-badge balance">
                  <span style={{ color: '#d97706', marginRight: '2px' }}>•</span> Saldo acumulado en folio: ---
                </span>
                {checkoutDateStr && (
                  <span className="pos-badge checkout">
                    Check-out: {checkoutDateStr}
                  </span>
                )}
              </div>
            </div>

            {/* Products Card */}
            <div className="pos-card">
              <div className="pos-search-bar">
                <Search size={16} color="var(--muted)" />
                <input
                  type="text"
                  placeholder="Buscar producto por nombre, código o categoria..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>

              <div className="pos-categories">
                <button
                  type="button"
                  className={`category-chip ${activeCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveCategory('all')}
                >
                  Todos
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`category-chip ${activeCategory === c.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="pos-product-list">
                {filteredProducts.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                    No se encontraron productos.
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const cat = categories.find((c) => c.id === product.categoryId)
                    const outOfStock = product.currentStock <= 0
                    const cartItem = cartItems.find(item => item.product.id === product.id)
                    const isSelected = !!cartItem

                    let cardClass = 'pos-product-card'
                    let iconClass = 'pos-product-icon'
                    let btnClass = 'pos-btn-add'
                    let stockClass = 'pos-product-stock'

                    if (outOfStock) {
                      cardClass += ' disabled'
                      iconClass += ' disabled'
                      btnClass += ' disabled'
                      stockClass += ' none'
                    } else if (isSelected) {
                      cardClass += ' selected'
                      iconClass += ' selected'
                      btnClass += ' selected'
                      stockClass += product.lowStock ? ' low' : ' normal'
                    } else {
                      iconClass += ' normal'
                      btnClass += ' normal'
                      stockClass += product.lowStock ? ' low' : ' normal'
                    }

                    return (
                      <div key={product.id} className={cardClass}>
                        <div className="pos-product-left">
                          <div className={iconClass}>
                            <Package size={20} />
                          </div>
                          <div>
                            <div className="pos-product-name">{product.name}</div>
                            {cat && <div className="pos-product-cat">{cat.name}</div>}
                          </div>
                        </div>
                        <div className="pos-product-right">
                          <div>
                            <div className="pos-product-price">{product.salePrice} Bs</div>
                            <div className={stockClass}>
                              {outOfStock ? 'Sin stock' : `${product.currentStock} u ${product.lowStock ? 'Última unidad' : 'En stock'}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            className={btnClass}
                            disabled={outOfStock}
                            onClick={() => addProductToCart(product)}
                          >
                            {outOfStock ? '-' : isSelected ? `x${cartItem.quantity}` : '+1'}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL: Carrito ─── */}
          <div className="pos-side">
            <div className="pos-side-header">
              <h3>
                <span style={{ color: 'var(--coral)', fontSize: '20px', lineHeight: 1 }}>•</span> Carrito de consumo
              </h3>
              <span className="pos-side-badge">{cartItems.length} items</span>
            </div>

            {cartItems.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', flex: 1 }}>
                <ShoppingCart size={32} color="var(--line)" style={{ margin: '0 auto 12px' }} />
                <div>Selecciona productos para agregar al carrito</div>
              </div>
            ) : (
              <>
                <div className="pos-cart-list">
                  {cartItems.map((item) => {
                    const itemTotal = item.product.salePrice * item.quantity;
                    return (
                      <div key={item.product.id} className="pos-cart-item">
                        <div className="pos-cart-item-header">
                          <div>
                            <div className="pos-cart-item-name">{item.product.name}</div>
                            <div className="pos-cart-item-calc">
                              {item.product.salePrice} Bs × {item.quantity} = <strong>{itemTotal} Bs</strong>
                            </div>
                          </div>
                          <button type="button" className="btn-trash" onClick={() => removeProduct(item.product.id)} title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="pos-cart-item-controls">
                          <div className="pos-qty-selector">
                            <button type="button" className="pos-qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                              <Minus size={14} />
                            </button>
                            <div className="pos-qty-value">{item.quantity}</div>
                            <button type="button" className="pos-qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                              <Plus size={14} />
                            </button>
                          </div>
                          {item.quantity >= item.product.currentStock ? (
                            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>Stock máx</span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              {categories.find(c => c.id === item.product.categoryId)?.name || ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="pos-cart-total">
                  <span>Total del carrito:</span>
                  <strong>{total} BOB</strong>
                </div>

                <div className="pos-pay-mode">
                  <span className="pos-pay-mode-label">¿CÓMO SE COBRA?</span>
                  <div className="pos-pay-mode-toggles">
                    <button
                      type="button"
                      onClick={() => setPayMode('account')}
                      className={`pos-pay-btn ${payMode === 'account' ? 'active-account' : ''}`}
                    >
                      <Wallet size={16} /> A la cuenta
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayMode('payNow')}
                      className={`pos-pay-btn ${payMode === 'payNow' ? 'active-paynow' : ''}`}
                    >
                      <CreditCard size={16} /> Pagar ahora
                    </button>
                  </div>
                </div>

                {payMode === 'payNow' && (
                  <label style={{ marginBottom: '16px', display: 'block' }}>
                    <span style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}>Método de pago</span>
                    <select
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)', outline: 'none' }}
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(
                          e.target.value as 'cash' | 'card' | 'transfer' | 'qr'
                        )
                      }
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  className={`pos-submit-btn ${payMode === 'account' ? 'btn-orange' : 'btn-orange'}`}
                  type="button"
                  disabled={!canSubmit}
                  onClick={submitConsumption}
                >
                  {submitting ? 'Procesando...' : (
                    <>
                      <Check size={18} /> 
                      {payMode === 'payNow' ? `Cobrar ${total} BOB ahora` : `Cargar ${total} BOB a la cuenta`}
                    </>
                  )}
                </button>

                <div className="pos-submit-note">
                  El cargo se sumará al saldo pendiente del folio del huésped (#{selectedStayId.slice(0, 6)}).
                </div>

                <div className="pos-clear-cart">
                  <button type="button" onClick={() => setCartItems([])}>Vaciar carrito</button>
                </div>

                <div className="pos-notice">
                  <Info size={16} className="pos-notice-icon" />
                  <p>
                    Los consumos cargados a la cuenta se liquidan automáticamente durante el <strong>Check-out</strong> de la estadía.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
