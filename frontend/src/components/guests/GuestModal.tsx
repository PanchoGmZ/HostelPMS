import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Guest } from '../../types/guests'
import { GuestInlineForm, validateDraft, cleanDraft, countries } from './GuestInlineForm'
import type { Draft } from './GuestInlineForm'

// Re-exportar para mantener compatibilidad con imports existentes
export type { Draft }
export { countries }

export { emptyDraft, cleanDraft } from './GuestInlineForm'

export const toDraft = (guest: Guest): Draft => ({ firstName: guest.firstName, lastName: guest.lastName, documentType: guest.documentType, documentNumber: guest.documentNumber, nationality: guest.nationality, birthDate: guest.birthDate, whatsapp: guest.whatsapp, email: guest.email, occupation: guest.occupation, previousCity: guest.previousCity, nextCity: guest.nextCity, emergencyContact: guest.emergencyContact, notes: guest.notes })

interface GuestModalProps {
  editor: { id?: string; draft: Draft };
  onChange: (value: { id?: string; draft: Draft }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
}

export function GuestModal({ editor, onChange, onClose, onSubmit, submitting }: GuestModalProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const d = editor.draft;

  const handleValidationAndSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newErrors = validateDraft(d);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Normalize optional fields before saving
    const cleanedDraft = cleanDraft(d);
    onChange({ ...editor, draft: cleanedDraft });
    onSubmit(e);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form className="modal-form guest-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleValidationAndSubmit} noValidate>
        <div className="modal-header">
          <div><span className="kicker">Registro</span><h2>{editor.id ? 'Editar huésped' : 'Nuevo huésped'}</h2></div>
          <button type="button" onClick={onClose} disabled={submitting}><X size={19} /></button>
        </div>
        <GuestInlineForm
          draft={d}
          onChange={(draft) => {
            onChange({ ...editor, draft })
            // Clear relevant errors
            if (Object.keys(errors).length > 0) {
              const nextErrors = { ...errors }
              Object.keys(draft).forEach(key => {
                if (nextErrors[key]) delete nextErrors[key]
              })
              setErrors(nextErrors)
            }
          }}
          disabled={submitting}
          datalistId="countries"
          externalErrors={errors}
        />
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}
