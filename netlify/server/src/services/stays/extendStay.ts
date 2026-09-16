import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from '../reservations/createReservation';

export interface ExtendStayPayload {
  establishmentId: string;
  stayId: string;
  newCheckOutDate: string;
  extraCharges?: number;
}

export interface ExtendStayResult {
  success: true;
  message: string;
}

// Helper explícito para parsear YYYY-MM-DD a medianoche de America/La_Paz (UTC-4)
const parseDateLocal = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000-04:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function extendStayService(
  payload: ExtendStayPayload,
  auth: AuthContext
): Promise<ExtendStayResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, stayId, newCheckOutDate, extraCharges } = payload;

  if (!establishmentId || !stayId || !newCheckOutDate) {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const stayRef = estRef.collection('stays').doc(stayId);

  const newCheckOut = parseDateLocal(newCheckOutDate);
  if (!newCheckOut) {
    throw new ReservationError('Formato de fecha inválido. Use YYYY-MM-DD.', 400);
  }

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new ReservationError('La estadía no existe.', 404);
      }

      const stay = staySnap.data();
      if (!stay) throw new ReservationError('Datos de estadía inválidos.', 500);
      
      if (stay.status !== 'active') {
        throw new ReservationError('La estadía debe estar activa para extenderla.', 409);
      }

      const oldCheckOutSecs = stay.expectedCheckOutDate.seconds;
      const oldCheckOut = new Date(oldCheckOutSecs * 1000);

      // Normalizar oldCheckOut a la medianoche local (UTC-4) por si acaso 
      // (asumiendo que fue guardado correctamente por los nuevos servicios)
      const oldCheckOutStr = oldCheckOut.toISOString().slice(0, 10);
      const oldCheckOutLocal = parseDateLocal(oldCheckOutStr)!;

      if (newCheckOut <= oldCheckOutLocal) {
        throw new ReservationError('La nueva fecha debe ser posterior a la actual.', 400);
      }

      // Identificar días a bloquear: desde oldCheckOutLocal hasta newCheckOut (exclusivo)
      const daysToBlock: string[] = [];
      for (
        const d = new Date(oldCheckOutLocal);
        d < newCheckOut;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        daysToBlock.push(d.toISOString().slice(0, 10)); // Formato YYYY-MM-DD
      }

      const bedIds: string[] = stay.bedIds || [];
      const reservationId = stay.reservationId;

      // Leer Reservation Lines para obtener lineId y saleMode (si hay reservationId)
      let linesSnap: FirebaseFirestore.QuerySnapshot | null = null;
      if (reservationId) {
        linesSnap = await transaction.get(estRef.collection('reservations').doc(reservationId).collection('lines'));
      }

      // Preparar docIds de availability necesarios
      const availTargets: { [docId: string]: string[] } = {};
      for (const bedId of bedIds) {
        for (const dateStr of daysToBlock) {
          const [year, month, day] = dateStr.split('-');
          const docId = `${bedId}_${year}-${month}`;
          if (!availTargets[docId]) availTargets[docId] = [];
          if (!availTargets[docId].includes(day)) {
            availTargets[docId].push(day);
          }
        }
      }

      const docIds = Object.keys(availTargets);
      const docRefs = docIds.map((id) => estRef.collection('availability').doc(id));
      const availSnaps = docRefs.length > 0
        ? await Promise.all(docRefs.map((ref) => transaction.get(ref)))
        : [];

      // Leer folio para cargos (limite 1)
      const foliosSnap = await transaction.get(
        estRef.collection('folios').where('stayId', '==', stayId).limit(1)
      );

      // ── PHASE 2: VALIDATE Availability ──────────────────────────────

      for (let i = 0; i < docIds.length; i++) {
        const docId = docIds[i];
        const snap = availSnaps[i];
        const targetDays = availTargets[docId];

        if (snap.exists) {
          const daysMap = snap.data()?.days || {};
          for (const day of targetDays) {
            if (daysMap[day] != null) {
              const bedId = docId.split('_')[0];
              const yearMonth = docId.substring(docId.indexOf('_') + 1);
              throw new ReservationError(`La cama ${bedId} ya está ocupada el día ${yearMonth}-${day}.`, 409);
            }
          }
        }
      }

      // Construir mapa de beds a lines (solo si existe reserva asociada)
      const bedToLine: Record<string, { lineId: string, mode: string }> = {};
      if (linesSnap) {
        linesSnap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.bedId) {
            bedToLine[data.bedId] = { lineId: doc.id, mode: data.saleMode || 'bed' };
          }
        });
      }

      // ── PHASE 3: ALL WRITES ─────────────────────────────────────────

      // 3a. Update Stay
      transaction.update(stayRef, {
        expectedCheckOutDate: Timestamp.fromDate(newCheckOut),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 3b. Update Availability
      for (let i = 0; i < docIds.length; i++) {
        const docId = docIds[i];
        const ref = docRefs[i];
        const snap = availSnaps[i];
        const targetDays = availTargets[docId];
        const bedId = docId.split('_')[0];
        
        const existingDays = snap.exists ? { ...(snap.data()?.days || {}) } : {};
        
        for (const day of targetDays) {
          existingDays[day] = {
            reservationId: reservationId || null,
            reservationLineId: bedToLine[bedId]?.lineId || null,
            mode: bedToLine[bedId]?.mode || 'bed',
          };
        }

        transaction.set(
          ref,
          {
            bedId,
            roomId: stay.roomId || null,
            days: existingDays,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // 3c. Add extraCharges to Folio if applicable
      if (extraCharges && extraCharges > 0 && !foliosSnap.empty) {
        const folioRef = foliosSnap.docs[0].ref;
        const folioData = foliosSnap.docs[0].data();

        const chargeId = db.collection('dummy').doc().id;
        const updatedCharges = [
          ...(folioData.charges || []),
          {
            id: chargeId,
            description: 'Extensión de estadía',
            quantity: 1,
            unitPrice: extraCharges,
            amount: extraCharges,
            status: 'pending',
            productId: null,
            createdAt: FieldValue.serverTimestamp(),
          },
        ];

        const newTotalCharges = (folioData.totalCharges || 0) + extraCharges;
        const newBalance = (folioData.totalPaid || 0) - newTotalCharges;

        transaction.update(folioRef, {
          charges: updatedCharges,
          totalCharges: newTotalCharges,
          balance: newBalance,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return { success: true as const, message: 'Estadía extendida.' };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
