import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { Category, Product, PurchaseRecord } from '../../types/inventory'

const base = (id: string) => `establishments/${id}`

export async function listInventory(establishmentId: string) {
  const root = base(establishmentId)
  const [products, categories] = await Promise.all([
    getDocs(collection(db, `${root}/products`)),
    getDocs(collection(db, `${root}/categories`)),
  ])
  return {
    products: products.docs.map((item) => ({ id: item.id, ...item.data() })) as Product[],
    categories: categories.docs.map((item) => ({ id: item.id, ...item.data() })) as Category[],
  }
}

export async function saveProduct(
  establishmentId: string,
  product: Omit<Product, 'id' | 'currentStock' | 'lowStock'>,
  id?: string
) {
  const root = base(establishmentId)
  if (id) {
    const reference = doc(db, `${root}/products`, id)
    await updateDoc(reference, {
      ...product,
      updatedAt: serverTimestamp(),
    })
  } else {
    const reference = doc(collection(db, `${root}/products`))
    const initialData = {
      ...product,
      currentStock: 0,
      lowStock: product.minimumStock > 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(reference, initialData)
  }
}

export async function createPurchase(
  establishmentId: string,
  items: Array<{ productId: string; quantity: number; unitCost: number }>,
  createdBy: string
) {
  const reference = doc(collection(db, `${base(establishmentId)}/purchases`))
  await setDoc(reference, {
    items,
    createdBy,
    stockProcessed: false,
    createdAt: serverTimestamp(),
  })
}

export async function listPurchases(establishmentId: string): Promise<PurchaseRecord[]> {
  const snapshot = await getDocs(
    query(collection(db, `${base(establishmentId)}/purchases`), orderBy('createdAt', 'desc'))
  )
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as PurchaseRecord[]
}

