import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface RecordStockMovementPayload {
  establishmentId: string;
  productId: string;
  type: string;
  quantity: number;
  description?: string;
}

export interface RecordStockMovementResult {
  success: true;
  message: string;
}

export class StockMovementError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'StockMovementError';
  }
}

export async function recordStockMovementService(
  payload: RecordStockMovementPayload,
  auth: AuthContext
): Promise<RecordStockMovementResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, productId, quantity, type, description } = payload;

  if (!establishmentId || !productId || typeof quantity !== 'number' || !type) {
    throw new StockMovementError('Parámetros inválidos.');
  }

  const validTypes = ['in', 'out'];
  if (!validTypes.includes(type)) {
    throw new StockMovementError(`El tipo de movimiento debe ser uno de: ${validTypes.join(', ')}.`);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new StockMovementError('La cantidad (quantity) debe ser un número positivo mayor a 0.');
  }

  if (!auth.roles[establishmentId]) {
    throw new StockMovementError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const productRef = estRef.collection('products').doc(productId);

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: Lecturas ─────────────────────────────
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) {
        throw new StockMovementError('El producto no existe.', 404);
      }

      const product = productSnap.data();
      if (!product) throw new StockMovementError('Datos de producto inválidos.', 500);

      // ── PHASE 2: Cálculos ─────────────────────────────
      const currentStock = product.currentStock || 0;
      const qtyChange = type === 'in' ? quantity : -quantity;
      const resultingStock = currentStock + qtyChange;

      // Según Callable original: Stock insuficiente evita grabar.
      if (resultingStock < 0) {
        throw new StockMovementError('Stock insuficiente.', 409);
      }

      // ── PHASE 3: Escrituras ─────────────────────────────
      const movementRef = estRef.collection('stockMovements').doc();
      transaction.set(movementRef, {
        productId,
        type,
        quantity,
        resultingStock,
        description: description || '',
        relatedChargeId: null,
        relatedPurchaseId: null,
        createdBy: auth.uid || '',
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.update(productRef, {
        currentStock: resultingStock,
        lowStock: resultingStock <= (product.minimumStock || 0),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true as const, message: 'Movimiento registrado.' };
  } catch (error: any) {
    if (error instanceof StockMovementError) {
      throw error;
    }
    throw new StockMovementError(`Error en la transacción: ${error.message}`, 500);
  }
}
