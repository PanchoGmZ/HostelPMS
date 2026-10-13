import { useRef, useCallback, useEffect } from 'react'

/**
 * useDraggableModal
 *
 * Attaches drag-to-reposition behavior to a modal.
 * Only active on non-touch (desktop) environments.
 *
 * Usage:
 *   const { modalRef, headerProps } = useDraggableModal()
 *   <div className="modal-backdrop">
 *     <div className="modal-form" ref={modalRef}>
 *       <div className="modal-header" {...headerProps}>...</div>
 *     </div>
 *   </div>
 *
 * The modal starts centered. Once dragged, it becomes position:fixed
 * and respects viewport bounds so it cannot be dragged off-screen.
 */
export function useDraggableModal() {
  const modalRef = useRef<HTMLElement | null>(null)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Detect touch device — disable drag on mobile
  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (isTouchDevice) return

      // Only trigger on left mouse button on the header itself
      // (not on buttons, inputs, selects, textareas inside the header)
      const target = e.target as HTMLElement
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'A' ||
        target.isContentEditable ||
        target.closest('button') !== null
      ) {
        return
      }

      if (e.button !== 0) return

      const modal = modalRef.current
      if (!modal) return

      // Transition modal from CSS grid-centered to fixed positioning
      const rect = modal.getBoundingClientRect()

      // Apply fixed position at current visual location
      modal.style.position = 'fixed'
      modal.style.left = `${rect.left}px`
      modal.style.top = `${rect.top}px`
      modal.style.margin = '0'
      modal.style.transform = 'none'
      modal.style.maxHeight = `calc(100vh - ${rect.top}px - 16px)`

      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }

      isDragging.current = true
      document.body.style.userSelect = 'none'
      e.preventDefault()
    },
    [isTouchDevice]
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const modal = modalRef.current
      if (!modal) return

      const vw = window.innerWidth
      const vh = window.innerHeight
      const modalW = modal.offsetWidth
      const modalH = modal.offsetHeight

      let newLeft = e.clientX - dragOffset.current.x
      let newTop = e.clientY - dragOffset.current.y

      // Clamp within viewport with 8px margin
      const margin = 8
      newLeft = Math.max(margin, Math.min(vw - modalW - margin, newLeft))
      newTop = Math.max(margin, Math.min(vh - modalH - margin, newTop))

      modal.style.left = `${newLeft}px`
      modal.style.top = `${newTop}px`
      modal.style.maxHeight = `calc(100vh - ${newTop}px - 16px)`
    }

    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
    }
  }, [])

  // Reset modal positioning when it unmounts or re-opens
  const resetPosition = useCallback(() => {
    const modal = modalRef.current
    if (modal) {
      modal.style.position = ''
      modal.style.left = ''
      modal.style.top = ''
      modal.style.margin = ''
      modal.style.transform = ''
      modal.style.maxHeight = ''
    }
    isDragging.current = false
  }, [])

  const headerProps = isTouchDevice
    ? {}
    : {
        onMouseDown,
        style: { cursor: 'grab' } as React.CSSProperties,
      }

  return { modalRef, headerProps, resetPosition }
}
