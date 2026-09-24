export interface Guest {
  id: string
  firstName: string
  lastName: string
  documentType: string
  documentNumber: string
  nationality: string
  birthDate: string | null
  whatsapp: string | null
  email: string | null
  occupation: string | null
  previousCity: string | null
  nextCity: string | null
  emergencyContact: string | null
  notes: string | null
  searchName: string
}
