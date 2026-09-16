import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface PurchaseItem {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchasePayload {
  establishmentId: string;
  items: PurchaseItem[];
}

export interface CreatePurchaseResult {
  success: true;
  message: string;
  purchaseId: string;
}

export class PurchaseError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'PurchaseError';
  }
}

export async function createPurchaseService(
  payload: CreatePurchasePayload,
  auth: AuthContext
): Promise<CreatePurchaseResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, items } = payload;

  if (!establishmentId) {
    throw new PurchaseError('Parámetros inválidos.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new PurchaseError('La compra debe contener al menos un producto.');
  }

  // Validación de items pre-transacción
  if (items.some((item) => 
    typeof item.productId !== 'string' || item.productId.length === 0 ||
    typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
    typeof item.unitCost !== 'number' || !Number.isFinite(item.unitCost) || item.unitCost < 0
  )) {
    throw new PurchaseError('La compra contiene productos, cantidades o costos inválidos.');
  }

  const uniqueProductIds = new Set(items.map((item) => item.productId));
  if (uniqueProductIds.size !== items.length) {
    throw new PurchaseError('La compra no puede contener productos repetidos.');
  }

  if (!auth.roles[establishmentId]) {
    throw new PurchaseError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const productsCollection = estRef.collection('products');
  const purchaseRef = estRef.collection('purchases').doc();
  const purchaseId = purchaseRef.id;

  const productRefs = items.map(item => productsCollection.doc(item.productId));

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: Lecturas ─────────────────────────────
      const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

      if (productSnaps.some(snap => !snap.exists)) {
        throw new PurchaseError('La compra contiene un producto inexistente.', 404);
      }

      // ── PHASE 2: Escrituras de la Compra ────────────────
      transaction.set(purchaseRef, {
        items,
        createdBy: auth.uid || '',
        stockProcessed: true, // Se marca como procesado ya que es sincrónico atómico
        stockProcessedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });

      // ── PHASE 3: Escrituras de Inventario ────────────────
      productSnaps.forEach((productSnap, i) => {
        const item = items[i];
        const productData = productSnap.data() || {};
        const currentStock = typeof productData.currentStock === 'number' ? productData.currentStock : 0;
        const minimumStock = typeof productData.minimumStock === 'number' ? productData.minimumStock : 0;
        const resultingStock = currentStock + item.quantity;

        // 1. Histórico de movimientos
        const movementRef = estRef.collection('stockMovements').doc();
        transaction.set(movementRef, {
          productId: item.productId,
          type: 'purchase_in',
          quantity: item.quantity,
          resultingStock,
          relatedPurchaseId: purchaseId,
          relatedChargeId: null,
          createdBy: auth.uid || '',
          createdAt: FieldValue.serverTimestamp(),
        });

        // 2. Actualización del producto actual
        transaction.update(productRefs[i], {
          currentStock: resultingStock,
          lowStock: resultingStock <= minimumStock,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    });

    return { 
      success: true as const, 
      message: 'Compra registrada y stock actualizado.', 
      purchaseId 
    };
  } catch (error: any) {
    if (error instanceof PurchaseError) {
      throw error;
    }
    throw new PurchaseError(`Error en la transacción: ${error.message}`, 500);
  }
}
