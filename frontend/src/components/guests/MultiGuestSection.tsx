/**
 * MultiGuestSection — v1.15
 *
 * Sección de registro múltiple de huéspedes con acordeones.
 * Cada slot permite:
 *   - Buscar un huésped existente
 *   - Registrar uno nuevo inline
 *
 * Se usa dentro de NewReservationModal, WalkInModal y CheckInModal.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, UserCheck, UserPlus, Search, X, CheckCircle2, Trash2 } from 'lucide-react'
import { GuestInlineForm, emptyDraft, validateDraft } from '../guests/GuestInlineForm'
import type { Draft } from '../guests/GuestInlineForm'
import type { Guest } from '../../types/guests'

/** Estado de un slot de huésped */
export interface GuestSlot {
  /** 'empty' = sin datos, 'existing' = huésped ya registrado, 'new' = registrando uno nuevo */
  mode: 'empty' | 'existing' | 'new'
  /** ID del huésped existente seleccionado */
  existingGuestId: string | null
  /** Draft del huésped nuevo */
  draft: Draft
  /** Si la ficha nueva fue validada correctamente */
  validated: boolean
}

export function createEmptySlot(): GuestSlot {
  return { mode: 'empty', existingGuestId: null, draft: { ...emptyDraft }, validated: false }
}

export function createExistingSlot(guestId: string): GuestSlot {
  return { mode: 'existing', existingGuestId: guestId, draft: { ...emptyDraft }, validated: true }
}

interface MultiGuestSectionProps {
  /** Total de huéspedes (guestCount) */
  guestCount: number
  /** Lista de slots, uno por persona */
  slots: GuestSlot[]
  /** Callback cuando se actualiza un slot */
  onSlotsChange: (slots: GuestSlot[]) => void
  /** Huéspedes ya registrados en el sistema */
  existingGuests: Guest[]
  /** IDs que ya están asignados (para evitar duplicados) */
  usedGuestIds?: string[]
  /** Si el formulario está deshabilitado (ej: submit en progreso) */
  disabled?: boolean
  /** Índice 0 = titular */
  titularIndex?: number
}

export function MultiGuestSection({
  guestCount,
  slots,
  onSlotsChange,
  existingGuests,
  usedGuestIds = [],
  disabled = false,
  titularIndex = 0,
}: MultiGuestSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({})

  const updateSlot = (index: number, updater: (slot: GuestSlot) => GuestSlot) => {
    const next = [...slots]
    next[index] = updater(next[index])
    onSlotsChange(next)
  }

  const setSearchQuery = (index: number, q: string) => {
    setSearchQueries(prev => ({ ...prev, [index]: q }))
  }

  /** Huéspedes disponibles para un slot, excluyendo los ya usados en otros slots */
  const getAvailableGuests = (slotIndex: number) => {
    const usedInOtherSlots = slots
      .filter((_, i) => i !== slotIndex)
      .map(s => s.existingGuestId)
      .filter(Boolean) as string[]
    const allUsed = new Set([...usedGuestIds, ...usedInOtherSlots])
    const q = (searchQueries[slotIndex] || '').toLowerCase().trim()

    return existingGuests.filter(g => {
      if (allUsed.has(g.id)) return false
      if (!q) return true
      return (
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
        g.documentNumber.toLowerCase().includes(q)
      )
    })
  }

  const getSlotLabel = (slot: GuestSlot, index: number): string => {
    if (slot.mode === 'existing' && slot.existingGuestId) {
      const g = existingGuests.find(x => x.id === slot.existingGuestId)
      return g ? `${g.firstName} ${g.lastName}` : 'Huésped seleccionado'
    }
    if (slot.mode === 'new' && slot.draft.firstName) {
      return `${slot.draft.firstName} ${slot.draft.lastName || ''}`.trim() || `Huésped ${index + 1}`
    }
    return `Huésped ${index + 1}`
  }

  const isSlotComplete = (slot: GuestSlot): boolean => {
    if (slot.mode === 'existing' && slot.existingGuestId) return true
    if (slot.mode === 'new' && slot.validated) return true
    return false
  }

  return (
    <div
      className="multi-guest-section"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <label style={{
        display: 'block',
        fontWeight: 700,
        fontSize: '13px',
        color: 'var(--ink)',
        marginBottom: '2px',
      }}>
        Huéspedes ({slots.filter(s => isSlotComplete(s)).length}/{guestCount})
      </label>

      {slots.map((slot, index) => {
        const isTitular = index === titularIndex
        const isOpen = openIndex === index
        const complete = isSlotComplete(slot)
        const label = getSlotLabel(slot, index)

        return (
          <div
            key={index}
            style={{
              border: `1px solid ${complete ? '#a7f3d0' : 'var(--line)'}`,
              borderRadius: 'var(--radius-sm)',
              background: complete ? '#f0fdf4' : 'var(--paper)',
              overflow: 'hidden',
            }}
          >
            {/* Accordion header */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              {isOpen
                ? <ChevronDown size={16} style={{ flexShrink: 0 }} />
                : <ChevronRight size={16} style={{ flexShrink: 0 }} />
              }

              {complete && <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0 }} />}

              <span style={{ flex: 1 }}>
                {label}
                {isTitular && (
                  <span style={{
                    marginLeft: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--teal)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}>
                    · Titular
                  </span>
                )}
              </span>

              {complete && !isOpen && slot.mode === 'existing' && (
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>Registrado</span>
              )}
              {complete && !isOpen && slot.mode === 'new' && (
                <span style={{ fontSize: '11px', color: '#059669', fontWeight: 400 }}>Nuevo</span>
              )}
            </button>

            {/* Accordion body */}
            {isOpen && (
              <div style={{ padding: '0 12px 12px' }}>
                {/* Mode selector */}
                {slot.mode === 'empty' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => updateSlot(index, s => ({ ...s, mode: 'new' }))}
                      disabled={disabled}
                      style={{ flex: 1 }}
                    >
                      <UserPlus size={14} /> Registrar nuevo
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => updateSlot(index, s => ({ ...s, mode: 'existing' }))}
                      disabled={disabled}
                      style={{ flex: 1 }}
                    >
                      <Search size={14} /> Buscar existente
                    </button>
                  </div>
                )}

                {/* Mode: existing guest search */}
                {slot.mode === 'existing' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Buscar huésped registrado</span>
                      <button
                        type="button"
                        onClick={() => updateSlot(index, () => createEmptySlot())}
                        disabled={disabled}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '11px', textDecoration: 'underline' }}
                      >
                        Limpiar
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Nombre o documento..."
                      value={searchQueries[index] || ''}
                      onChange={(e) => setSearchQuery(index, e.target.value)}
                      disabled={disabled}
                      style={{ marginBottom: '6px', width: '100%', fontSize: '12px' }}
                    />

                    {slot.existingGuestId ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '6px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <UserCheck size={14} color="#16a34a" />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#14532d' }}>
                            {(() => {
                              const g = existingGuests.find(x => x.id === slot.existingGuestId)
                              return g ? `${g.firstName} ${g.lastName}` : 'Seleccionado'
                            })()}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateSlot(index, s => ({ ...s, existingGuestId: null, validated: false }))
                          }}
                          disabled={disabled}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: '2px' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {getAvailableGuests(index).slice(0, 20).map(g => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              updateSlot(index, s => ({
                                ...s,
                                existingGuestId: g.id,
                                validated: true,
                              }))
                            }}
                            disabled={disabled}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              borderRadius: '4px',
                              border: '1px solid var(--line)',
                              background: 'var(--white)',
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontSize: '12px',
                            }}
                          >
                            <div>
                              <strong>{g.firstName} {g.lastName}</strong>
                              <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>
                                {g.documentNumber}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{g.nationality || ''}</span>
                          </button>
                        ))}
                        {getAvailableGuests(index).length === 0 && (
                          <p style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '10px 0', margin: 0 }}>
                            No se encontraron huéspedes.
                          </p>
                        )}
                      </div>
                    )}

                    {!slot.existingGuestId && (
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => updateSlot(index, s => ({ ...s, mode: 'new', existingGuestId: null }))}
                        disabled={disabled}
                        style={{ marginTop: '8px', width: '100%' }}
                      >
                        <UserPlus size={14} /> Registrar nuevo en su lugar
                      </button>
                    )}
                  </div>
                )}

                {/* Mode: new guest form */}
                {slot.mode === 'new' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Registrar nuevo huésped</span>
                      <button
                        type="button"
                        onClick={() => updateSlot(index, () => createEmptySlot())}
                        disabled={disabled}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        <Trash2 size={12} /> Descartar
                      </button>
                    </div>
                    <GuestInlineForm
                      draft={slot.draft}
                      onChange={(draft) => {
                        // Revalidar al cambiar
                        const errs = validateDraft(draft)
                        updateSlot(index, s => ({
                          ...s,
                          draft,
                          validated: Object.keys(errs).length === 0,
                        }))
                      }}
                      disabled={disabled}
                      datalistId={`countries-slot-${index}`}
                    />
                    {!slot.validated && slot.draft.firstName && (
                      <div style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#92400e',
                      }}>
                        Completa todos los campos obligatorios (*) para validar este huésped.
                      </div>
                    )}
                    {slot.validated && (
                      <div style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#047857',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <CheckCircle2 size={12} /> Datos completos — se guardará al confirmar.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Info text */}
      {guestCount > 1 && (
        <div style={{
          fontSize: '11px',
          color: 'var(--muted)',
          padding: '4px 0',
          lineHeight: 1.4,
        }}>
          💡 El titular es obligatorio para check-in. Los acompañantes son opcionales.
        </div>
      )}
    </div>
  )
}
