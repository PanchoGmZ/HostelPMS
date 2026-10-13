import { useState, useEffect, useRef, type FocusEvent, type ChangeEvent } from 'react'

export interface NumericInputProps {
  value: number | undefined | null
  onChange: (value: number) => void
  allowDecimals?: boolean
  min?: number
  max?: number
  step?: number
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  required?: boolean
  autoSelectOnFocus?: boolean
  id?: string
  name?: string
  title?: string
  'aria-label'?: string
}

/**
 * Normaliza una cadena numérica eliminando ceros iniciales superfluos
 * Ej: '0250' -> '250', '005' -> '5', '0.5' -> '0.5', '0' -> '0', '' -> ''
 */
export function normalizeNumericString(raw: string, allowDecimals = true): string {
  if (!raw) return ''

  // Reemplazar coma por punto si se permiten decimales
  let val = allowDecimals ? raw.replace(',', '.') : raw.replace(/[.,]/g, '')

  // Eliminar cualquier caracter no numérico (excepto punto si decimales permitidos)
  if (allowDecimals) {
    val = val.replace(/[^0-9.]/g, '')
    // Mantener sólo el primer punto decimal
    const parts = val.split('.')
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('')
    }
  } else {
    val = val.replace(/[^0-9]/g, '')
  }

  // Quitar ceros a la izquierda si no es '0' o decimal '0.xxx'
  if (/^0+[1-9]/.test(val)) {
    val = val.replace(/^0+/, '')
  } else if (/^00+\./.test(val)) {
    val = val.replace(/^0+/, '0')
  } else if (/^00+$/.test(val)) {
    val = '0'
  }

  return val
}

export function NumericInput({
  value,
  onChange,
  allowDecimals = true,
  min = 0,
  max,
  placeholder = '0',
  className,
  style,
  disabled = false,
  required = false,
  autoSelectOnFocus = true,
  id,
  name,
  title,
  'aria-label': ariaLabel,
}: NumericInputProps) {
  // Manejo de estado de texto interno para permitir borrar libremente sin forzar '0' en cada pulsación
  const [text, setText] = useState<string>(() => {
    if (value === undefined || value === null) return ''
    return String(value)
  })

  const isFocusedRef = useRef(false)

  // Sincronizar desde fuera solo si no estamos editando activamente o si el valor numérico cambió sustancialmente
  useEffect(() => {
    if (!isFocusedRef.current) {
      if (value === undefined || value === null) {
        setText('')
      } else {
        setText(String(value))
      }
    }
  }, [value])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const clean = normalizeNumericString(raw, allowDecimals)
    setText(clean)

    if (clean === '' || clean === '.') {
      // Estado temporal vacío durante edición: no forzar 0 en pantalla, emitir min o 0 según corresponda
      onChange(min)
      return
    }

    const num = parseFloat(clean)
    if (!isNaN(num)) {
      if (max !== undefined && num > max) {
        setText(String(max))
        onChange(max)
      } else {
        onChange(num)
      }
    }
  }

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true
    if (autoSelectOnFocus) {
      // Seleccionar texto para que cualquier número tipeado reemplace el anterior sin acumular ceros
      e.target.select()
    }
  }

  const handleBlur = () => {
    isFocusedRef.current = false
    let finalVal = min

    if (text !== '' && text !== '.') {
      const num = parseFloat(text)
      if (!isNaN(num)) {
        finalVal = Math.max(min, max !== undefined ? Math.min(max, num) : num)
      }
    }

    // Redondear decimales si aplica
    if (allowDecimals) {
      finalVal = Math.round(finalVal * 100) / 100
    } else {
      finalVal = Math.round(finalVal)
    }

    setText(String(finalVal))
    onChange(finalVal)
  }

  return (
    <input
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
      required={required}
      id={id}
      name={name}
      title={title}
      aria-label={ariaLabel}
    />
  )
}
