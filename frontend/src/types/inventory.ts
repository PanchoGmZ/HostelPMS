export interface Product {
  id: string
  name: string
  categoryId: string
  unit: string
  costPrice: number
  salePrice: number
  minimumStock: number
  currentStock: number
  lowStock: boolean
  active?: boolean
  createdAt?: { seconds: number }
  updatedAt?: { seconds: number }
}

export interface Category {
  id: string
  name: string
  parentId: string | null
}

export interface PurchaseItem {
  productId: string
  quantity: number
  unitCost: number
}

export interface PurchaseRecord {
  id: string
  items: PurchaseItem[]
  createdBy: string
  stockProcessed: boolean
  createdAt: { seconds: number }
}

