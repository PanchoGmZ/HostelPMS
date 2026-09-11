import * as functions from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";


// Inicializar el Admin SDK una sola vez en el servidor
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// ============================================================================
// CALLABLE FUNCTION: Asignar Rol a un Usuario (Multi-tenant)
// Solo ejecutable por un Admin existente del establecimiento
// ============================================================================
export const setUserRole = functions.https.onCall(async (request) => {
  // 1. Validar que la petición esté autenticada
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "El usuario debe estar autenticado para realizar esta acción."
    );
  }

  const { data } = request;
  const { targetUid, establishmentId, role } = data;

  // Validar parámetros requeridos
  if (!targetUid || !establishmentId || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan parámetros requeridos: targetUid, establishmentId, role."
    );
  }

  if (role !== "admin" && role !== "reception") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El rol debe ser 'admin' o 'reception'."
    );
  }

  // 2. Verificar que quien llama a la función sea Admin de ese establecimiento
  const callerRoles = request.auth.token.roles || {};
  const isCallerAdmin = callerRoles[establishmentId] === "admin";

  if (!isCallerAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "No tienes permisos de administrador para este establecimiento."
    );
  }

  try {
    // 3. Obtener claims actuales del usuario objetivo
    const targetUser = await auth.getUser(targetUid);
    const existingClaims = targetUser.customClaims || {};
    const existingRoles = existingClaims.roles || {};

    // 4. Actualizar el mapa de roles inyectando el nuevo establecimiento
    const updatedRoles = {
      ...existingRoles,
      [establishmentId]: role,
    };

    // 5. Asignar los nuevos Custom Claims
    await auth.setCustomUserClaims(targetUid, {
      ...existingClaims,
      roles: updatedRoles,
    });

    // 6. Actualizar o crear el documento en la colección users/{userId}
    await db.collection("users").doc(targetUid).set(
      {
        roles: updatedRoles,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      message: `Rol '${role}' asignado con éxito para el establecimiento ${establishmentId}.`,
    };
  } catch (error: any) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Crear Reserva con Validación de Disponibilidad
// ----------------------------------------------------------------------------
// FIXES aplicados sobre la versión anterior:
//   1. Ahora SÍ crea reservations/{id}/lines/{lineId} — antes availability
//      apuntaba a un reservationLineId que nunca se materializaba.
//   2. Un solo lineId por CAMA (no por cama+mes) — antes una estadía que
//      cruzaba fin de mes generaba dos IDs de línea distintos para la misma
//      cama reservada, rompiendo la relación 1 línea = 1 cama.
//   3. totalAmount ya no se confía tal cual del cliente: se recibe el detalle
//      pricePerNight por cama (igual que el snapshot histórico que exige la
//      arquitectura) y el total se calcula server-side sumando esos valores.
//   4. Se valida que quien llama pertenezca al staff del establecimiento
//      (antes solo se validaba que estuviera autenticado, sin importar a
//      qué establecimiento).
// ============================================================================
export const createReservation = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "El usuario debe estar autenticado."
    );
  }

  const callerUid = request.auth.uid;

  const {
    establishmentId,
    guestId,
    saleMode, // "bed" | "full_room"
    roomId,
    bedIds, // string[]
    pricePerNight, // { [bedId]: { [date: "YYYY-MM-DD"]: number } }
    channel = "direct",
  } = request.data;
  const requestedCheckIn = request.data.checkIn ?? request.data.checkInDate;
  const requestedCheckOut = request.data.checkOut ?? request.data.checkOutDate;

  // --- Validaciones de entrada ---
  if (!establishmentId || !roomId || !Array.isArray(bedIds) || bedIds.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan parámetros de reserva obligatorios (establishmentId, roomId, bedIds)."
    );
  }
  if (saleMode !== "bed" && saleMode !== "full_room") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "saleMode debe ser 'bed' o 'full_room'."
    );
  }
  if (!pricePerNight || typeof pricePerNight !== "object") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Falta el detalle de precios por noche (pricePerNight) por cama."
    );
  }
  if (new Set(bedIds).size !== bedIds.length || bedIds.some((bedId: unknown) => typeof bedId !== "string" || bedId.length === 0)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "bedIds debe contener identificadores únicos y válidos."
    );
  }

  // --- Autorización: el caller debe pertenecer al staff de ESTE establecimiento ---
  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "No pertenecés al staff de este establecimiento."
    );
  }

  // --- Validar precios por cama y calcular el total server-side ---
  const perBedDates: { [bedId: string]: string[] } = {};
  let totalAmount = 0;

  for (const bedId of bedIds) {
    const bedPrices = pricePerNight[bedId];
    if (!bedPrices || typeof bedPrices !== "object" || Object.keys(bedPrices).length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Faltan precios por noche para la cama ${bedId}.`
      );
    }
    const dates = Object.keys(bedPrices).sort();
    for (const d of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Fecha inválida para la cama ${bedId}: ${d}.`
        );
      }
      const price = bedPrices[d];
      if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Precio inválido para la cama ${bedId} en la fecha ${d}.`
        );
      }
      totalAmount += price;
    }
    perBedDates[bedId] = dates;
  }

  const allDates = Array.from(new Set(bedIds.flatMap((bedId) => perBedDates[bedId]))).sort();
  if (allDates.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "La reserva debe tener al menos una noche.");
  }
  const firstDate = requestedCheckIn || allDates[0];
  let lastDate = requestedCheckOut;
  if (!lastDate) {
    const impliedCheckOut = new Date(`${allDates[allDates.length - 1]}T00:00:00.000Z`);
    impliedCheckOut.setUTCDate(impliedCheckOut.getUTCDate() + 1);
    lastDate = impliedCheckOut.toISOString().slice(0, 10);
  }
  const parseDate = (value: unknown): Date | null => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  };
  const checkInJsDate = parseDate(firstDate);
  const checkOutJsDate = parseDate(lastDate);
  if (!checkInJsDate || !checkOutJsDate || checkInJsDate >= checkOutJsDate) {
    throw new functions.https.HttpsError("invalid-argument", "El rango de fechas es inválido.");
  }
  const expectedDates: string[] = [];
  for (const date = new Date(checkInJsDate); date < checkOutJsDate; date.setUTCDate(date.getUTCDate() + 1)) {
    expectedDates.push(date.toISOString().slice(0, 10));
  }
  const expectedDateSet = new Set(expectedDates);
  if (allDates.length !== expectedDates.length || allDates.some((date, index) => date !== expectedDates[index])) {
    throw new functions.https.HttpsError("invalid-argument", "pricePerNight debe cubrir exactamente todas las noches, sin huecos ni fechas fuera del rango.");
  }
  for (const bedId of bedIds) {
    const dates = perBedDates[bedId];
    if (dates.length !== expectedDates.length || dates.some((date) => !expectedDateSet.has(date))) {
      throw new functions.https.HttpsError("invalid-argument", `pricePerNight incompleto para la cama ${bedId}.`);
    }
  }
  const checkInDate = admin.firestore.Timestamp.fromDate(checkInJsDate);
  const checkOutDate = admin.firestore.Timestamp.fromDate(checkOutJsDate);

  const estRef = db.collection("establishments").doc(establishmentId);
  const reservationRef = estRef.collection("reservations").doc();

  // Un solo ID de línea por cama, generado antes de la transacción
  // (generar un DocumentReference no consume lectura/escritura de red).
  const lineRefByBed: { [bedId: string]: FirebaseFirestore.DocumentReference } = {};
  for (const bedId of bedIds) {
    lineRefByBed[bedId] = reservationRef.collection("lines").doc();
  }

  try {
    await db.runTransaction(async (transaction) => {
      // 0. Validar la pertenencia y el estado de la habitación y sus camas.
      const estSnap = await transaction.get(estRef);
      if (!estSnap.exists) throw new Error("El establecimiento no existe.");
      const roomRef = estRef.collection("rooms").doc(roomId);
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists) throw new Error("La habitación no existe en este establecimiento.");
      const bedRefs = bedIds.map((bedId) => roomRef.collection("beds").doc(bedId));
      const bedSnaps = await Promise.all(bedRefs.map((ref) => transaction.get(ref)));
      const allBedsSnap = await transaction.get(roomRef.collection("beds"));
      const invalidBed = bedSnaps.findIndex((bedSnap) => {
        const bed = bedSnap.data() || {};
        return !bedSnap.exists || bed.status !== "active" || (bed.outOfServiceReason != null && bed.outOfServiceReason !== "");
      });
      if (invalidBed !== -1) throw new Error(`La cama ${bedIds[invalidBed]} no existe o no está disponible para venta.`);
      const activeBedIds = allBedsSnap.docs
        .filter((bedSnap) => {
          const bed = bedSnap.data();
          return bed.status === "active" && (bed.outOfServiceReason == null || bed.outOfServiceReason === "");
        })
        .map((bedSnap) => bedSnap.id)
        .sort();
      if (saleMode === "full_room" && (activeBedIds.length !== bedIds.length || activeBedIds.some((id, index) => id !== [...bedIds].sort()[index]))) {
        throw new Error("full_room debe incluir exactamente todas las camas activas de la habitación.");
      }
      const currency = estSnap.data()?.currency || "BOB";

      // 1. Determinar buckets de availability a leer (bedId + yearMonth)
      const availabilityTargets: { [docId: string]: { bedId: string; days: string[] } } = {};
      for (const bedId of bedIds) {
        for (const dateStr of perBedDates[bedId]) {
          const [year, month, day] = dateStr.split("-");
          const yearMonth = `${year}-${month}`;
          const docId = `${bedId}_${yearMonth}`;
          if (!availabilityTargets[docId]) {
            availabilityTargets[docId] = { bedId, days: [] };
          }
          availabilityTargets[docId].days.push(day);
        }
      }

      const docIds = Object.keys(availabilityTargets);
      const docRefs = docIds.map((docId) => estRef.collection("availability").doc(docId));
      const snapshots = await Promise.all(docRefs.map((ref) => transaction.get(ref)));

      // 2. Validar que no haya conflictos (ninguna cama ocupada esos días)
      snapshots.forEach((snap, i) => {
        const docId = docIds[i];
        const target = availabilityTargets[docId];
        const daysMap = (snap.exists ? snap.data()?.days : {}) || {};
        for (const day of target.days) {
          if (daysMap[day] != null) {
            throw new Error(
              `La cama ${target.bedId} ya está ocupada el día ${day}.`
            );
          }
        }
      });

      // 3. Escribir/actualizar los buckets de availability
      snapshots.forEach((snap, i) => {
        const docId = docIds[i];
        const docRef = docRefs[i];
        const target = availabilityTargets[docId];
        const existingDays = (snap.exists ? snap.data()?.days : {}) || {};
        const updatedDays = { ...existingDays };
        const lineRef = lineRefByBed[target.bedId];

        for (const day of target.days) {
          updatedDays[day] = {
            reservationId: reservationRef.id,
            reservationLineId: lineRef.id,
            mode: saleMode,
          };
        }

        transaction.set(
          docRef,
          {
            bedId: target.bedId,
            roomId,
            days: updatedDays,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      // 4. Crear reservations/{id}/lines/{lineId} — AHORA SÍ, fuente de verdad real
      for (const bedId of bedIds) {
        const lineRef = lineRefByBed[bedId];
        const bedPrices = pricePerNight[bedId];
        const bedDates = perBedDates[bedId];
        transaction.set(lineRef, {
          bedId,
          roomId,
          saleMode,
          dateFrom: admin.firestore.Timestamp.fromDate(new Date(`${bedDates[0]}T00:00:00`)),
          dateTo: admin.firestore.Timestamp.fromDate(new Date(`${bedDates[bedDates.length - 1]}T00:00:00`)),
          guestId: guestId || null,
          pricePerNight: bedPrices, // snapshot histórico
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 5. Crear la reserva (con totalAmount calculado, no confiado del cliente)
      transaction.set(reservationRef, {
        channel,
        status: "confirmed",
        primaryGuestId: guestId || null,
        guestIds: guestId ? [guestId] : [],
        roomId,
        bedIds,
        checkInDate,
        checkOutDate,
        totalAmount,
        currency,
        createdBy: callerUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, reservationId: reservationRef.id, totalAmount };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", `Error en la transacción: ${error.message}`);
  }
});

// ============================================================================
// FIRESTORE TRIGGER: Sincronizar stock al registrar una compra
// ----------------------------------------------------------------------------
// FIX #3 del review de Security Rules: `purchases` se puede seguir creando
// directo desde el cliente (Security Rules ya lo permiten para el staff),
// pero nada actualizaba currentStock/lowStock ni generaba stockMovements.
//
// Se resuelve con un trigger (no un callable nuevo) para no cambiarle nada
// al frontend: el equipo sigue escribiendo `purchases` exactamente igual, y
// este trigger corre automáticamente en el backend, dentro de una
// transacción, generando un stockMovement tipo 'purchase_in' por cada ítem y
// actualizando currentStock/lowStock del producto.
//
// Idempotencia: si el trigger llegara a re-ejecutarse (reintento de Cloud
// Functions), el flag `stockProcessed` en la propia compra evita duplicar
// el movimiento de stock.
// ============================================================================
export const syncPurchaseStock = onDocumentCreated(
  "establishments/{establishmentId}/purchases/{purchaseId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const { establishmentId, purchaseId } = event.params;
    const purchaseRef = snap.ref;

    await db.runTransaction(async (transaction) => {
      const purchaseSnap = await transaction.get(purchaseRef);
      const purchase = purchaseSnap.data();
      if (!purchase) return;

      // Idempotencia: no reprocesar si ya se sincronizó el stock.
      if (purchase.stockProcessed === true) return;

      const items: Array<{ productId: string; quantity: number; unitCost?: number }> =
        Array.isArray(purchase.items) ? purchase.items : [];

      if (items.length === 0) {
        transaction.update(purchaseRef, {
          stockProcessed: true,
          stockProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      const productsCollection = db
        .collection("establishments")
        .doc(establishmentId)
        .collection("products");

      const productRefs = items.map((item) => productsCollection.doc(item.productId));
      const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));

      if (items.some((item) => typeof item.productId !== "string" || item.productId.length === 0
        || typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0
        || (item.unitCost !== undefined && (typeof item.unitCost !== "number" || !Number.isFinite(item.unitCost) || item.unitCost < 0)))) {
        throw new Error("La compra contiene productos o cantidades inválidas.");
      }
      if (new Set(items.map((item) => item.productId)).size !== items.length) {
        throw new Error("La compra no puede contener productos repetidos.");
      }
      if (productSnaps.some((productSnap) => !productSnap.exists)) {
        throw new Error("La compra contiene un producto inexistente.");
      }

      productSnaps.forEach((productSnap, i) => {
        const item = items[i];

        const productData = productSnap.data() || {};
        const currentStock = typeof productData.currentStock === "number" ? productData.currentStock : 0;
        const minimumStock = typeof productData.minimumStock === "number" ? productData.minimumStock : 0;
        const resultingStock = currentStock + (item.quantity || 0);

        const movementRef = db
          .collection("establishments")
          .doc(establishmentId)
          .collection("stockMovements")
          .doc();

        transaction.set(movementRef, {
          productId: item.productId,
          type: "purchase_in",
          quantity: item.quantity || 0,
          resultingStock,
          relatedPurchaseId: purchaseId,
          relatedChargeId: null,
          createdBy: purchase.createdBy || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(productRefs[i], {
          currentStock: resultingStock,
          lowStock: resultingStock <= minimumStock,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      transaction.update(purchaseRef, {
        stockProcessed: true,
        stockProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }
);

// ============================================================================
// CALLABLE FUNCTION: Check-in de Huésped
// Crea una estadía a partir de una reserva confirmada
// ============================================================================
export const checkInGuest = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, reservationId, guestIds, deposit } = request.data;

  if (!establishmentId || !reservationId || !Array.isArray(guestIds)) {
    throw new functions.https.HttpsError("invalid-argument", "Faltan parámetros requeridos.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No pertenecés al staff de este establecimiento.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const reservationRef = estRef.collection("reservations").doc(reservationId);
    const stayRef = estRef.collection("stays").doc();

    await db.runTransaction(async (transaction) => {
      const resSnap = await transaction.get(reservationRef);
      if (!resSnap.exists) {
        throw new Error("La reserva no existe.");
      }

      const reservation = resSnap.data();
      if (!reservation) throw new Error("Datos de reserva inválidos.");
      if (reservation.status !== "confirmed") {
        throw new Error("La reserva no está en estado confirmado.");
      }

      transaction.set(stayRef, {
        reservationId: reservationId,
        guestIds: guestIds && guestIds.length > 0 ? guestIds : [reservation.primaryGuestId].filter(Boolean),
        roomId: reservation.roomId,
        bedIds: reservation.bedIds,
        checkInDate: reservation.checkInDate,
        expectedCheckOutDate: reservation.checkOutDate,
        actualCheckOutDate: null,
        status: "active",
        deposit: deposit || 0,
        documentVerified: false,
        createdBy: request.auth?.uid || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const folioRef = estRef.collection("folios").doc();
      const reservationData = reservation;
      transaction.set(folioRef, {
        stayId: stayRef.id,
        currency: reservationData.currency || "BOB",
        totalCharges: 0,
        totalPaid: deposit || 0,
        balance: -(deposit || 0),
        status: "open",
        charges: [],
        payments: deposit ? [{ id: db.collection("dummy").doc().id, amount: deposit, method: "deposit", status: "completed", createdAt: admin.firestore.FieldValue.serverTimestamp() }] : [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, stayId: stayRef.id };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Registrar Consumo (Cargo al Folio)
// ============================================================================
export const addConsumption = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, stayId, description, quantity, unitPrice, productId } = request.data;

  if (!establishmentId || !stayId || !description || typeof quantity !== "number" || typeof unitPrice !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const stayRef = estRef.collection("stays").doc(stayId);

    await db.runTransaction(async (transaction) => {
      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new Error("La estadía no existe.");
      }

      const foliosSnap = await transaction.get(estRef.collection("folios").where("stayId", "==", stayId).limit(1));
      if (foliosSnap.empty) {
        throw new Error("No existe folio para esta estadía.");
      }

      const folioRef = foliosSnap.docs[0].ref;
      const folioData = foliosSnap.docs[0].data();

      const amount = quantity * unitPrice;
      const chargeId = db.collection("dummy").doc().id;

      const updatedCharges = [
        ...(folioData.charges || []),
        {
          id: chargeId,
          description,
          quantity,
          unitPrice,
          amount,
          status: "pending",
          productId: productId || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      ];

      const newTotalCharges = (folioData.totalCharges || 0) + amount;
      const newBalance = (folioData.totalPaid || 0) - newTotalCharges;

      transaction.update(folioRef, {
        charges: updatedCharges,
        totalCharges: newTotalCharges,
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Crear movimiento de stock si hay productId
      if (productId) {
        const productRef = estRef.collection("products").doc(productId);
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists) {
          const product = productSnap.data();
          if (!product) throw new Error("Datos de producto inválidos.");
          const currentStock = product.currentStock || 0;
          const resultingStock = currentStock - quantity;

          const movementRef = estRef.collection("stockMovements").doc();
          transaction.set(movementRef, {
            productId,
            type: "consumption",
            quantity,
            resultingStock,
            relatedChargeId: chargeId,
            relatedPurchaseId: null,
            createdBy: request.auth?.uid || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          transaction.update(productRef, {
            currentStock: resultingStock,
            lowStock: resultingStock <= (product.minimumStock || 0),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });

    return { success: true, message: "Consumo registrado." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Registrar Pago
// ============================================================================
export const recordPayment = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, stayId, amount, method, reference } = request.data;

  if (!establishmentId || !stayId || typeof amount !== "number" || !method) {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos.");
  }

  if (amount <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "El monto debe ser mayor a 0.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const stayRef = estRef.collection("stays").doc(stayId);

    await db.runTransaction(async (transaction) => {
      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new Error("La estadía no existe.");
      }

      const foliosSnap = await transaction.get(estRef.collection("folios").where("stayId", "==", stayId).limit(1));
      if (foliosSnap.empty) {
        throw new Error("No existe folio para esta estadía.");
      }

      const folioRef = foliosSnap.docs[0].ref;
      const folioData = foliosSnap.docs[0].data();

      const paymentId = db.collection("dummy").doc().id;
      const updatedPayments = [
        ...(folioData.payments || []),
        {
          id: paymentId,
          amount,
          method,
          status: "completed",
          reference: reference || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      ];

      const newTotalPaid = (folioData.totalPaid || 0) + amount;
      const newBalance = newTotalPaid - (folioData.totalCharges || 0);

      transaction.update(folioRef, {
        payments: updatedPayments,
        totalPaid: newTotalPaid,
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Registrar en caja si está abierta
      const cashShiftsSnap = await transaction.get(
        estRef.collection("cashShifts").where("status", "==", "open")
      );
      if (!cashShiftsSnap.empty) {
        const cashShiftRef = cashShiftsSnap.docs[0].ref;
        const movementRef = cashShiftRef.collection("movements").doc();
        transaction.set(movementRef, {
          type: "payment",
          amount,
          method,
          description: `Pago de folio - ${stayId}`,
          relatedFolioId: folioRef.id,
          createdBy: request.auth?.uid || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return { success: true, paymentId: db.collection("dummy").doc().id };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Registrar Reembolso
// ============================================================================
export const recordRefund = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, stayId, paymentId, amount } = request.data;

  if (!establishmentId || !stayId || !paymentId || typeof amount !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos.");
  }

  if (amount <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "El monto debe ser mayor a 0.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const stayRef = estRef.collection("stays").doc(stayId);

    await db.runTransaction(async (transaction) => {
      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new Error("La estadía no existe.");
      }

      const foliosSnap = await transaction.get(estRef.collection("folios").where("stayId", "==", stayId).limit(1));
      if (foliosSnap.empty) {
        throw new Error("No existe folio para esta estadía.");
      }

      const folioRef = foliosSnap.docs[0].ref;
      const folioData = foliosSnap.docs[0].data();

      const refundId = db.collection("dummy").doc().id;
      const updatedPayments = [
        ...(folioData.payments || []),
        {
          id: refundId,
          amount: -amount,
          method: "refund",
          status: "completed",
          reference: `Reembolso de ${paymentId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      ];

      const newTotalPaid = (folioData.totalPaid || 0) - amount;
      const newBalance = newTotalPaid - (folioData.totalCharges || 0);

      transaction.update(folioRef, {
        payments: updatedPayments,
        totalPaid: newTotalPaid,
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, refundId: db.collection("dummy").doc().id };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Check-out de Huésped
// Cierra la estadía y libera las camas
// ============================================================================
export const checkOutGuest = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, stayId, actualCheckOut } = request.data;

  if (!establishmentId || !stayId) {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros requeridos faltantes.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const stayRef = estRef.collection("stays").doc(stayId);

    await db.runTransaction(async (transaction) => {
      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new Error("La estadía no existe.");
      }

      const stay = staySnap.data();
      if (!stay) throw new Error("Datos de estadía inválidos.");
      if (stay.status !== "active") {
        throw new Error("La estadía ya fue cerrada.");
      }

      const foliosSnap = await transaction.get(estRef.collection("folios").where("stayId", "==", stayId).limit(1));
      if (foliosSnap.empty) {
        throw new Error("No existe folio para esta estadía.");
      }

      const folioData = foliosSnap.docs[0].data();
      if (folioData.balance < 0) {
        throw new Error(`El folio tiene deuda pendiente: ${Math.abs(folioData.balance)}. Debe completarse el pago.`);
      }

      const checkOutDate = new Date(actualCheckOut || new Date());
      const stayData = stay;
      transaction.update(stayRef, {
        actualCheckOutDate: admin.firestore.Timestamp.fromDate(checkOutDate),
        status: "checked_out",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(foliosSnap.docs[0].ref, {
        status: "closed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Liberar camas en availability
      const bedIds = stayData.bedIds || [];
      const checkOutDateStr = checkOutDate.toISOString().split("T")[0];

      for (const bedId of bedIds) {
        const [year, month] = checkOutDateStr.split("-");
        const yearMonth = `${year}-${month}`;
        const docId = `${bedId}_${yearMonth}`;
        const availRef = estRef.collection("availability").doc(docId);
        const availSnap = await transaction.get(availRef);
        if (availSnap.exists) {
          const days = availSnap.data()?.days || {};
          const day = checkOutDateStr.split("-")[2];
          if (days[day]) {
            delete days[day];
            transaction.update(availRef, { days });
          }
        }
      }
    });

    return { success: true, message: "Check-out completado." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Abrir Caja
// ============================================================================
export const openCashShift = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, openingAmount } = request.data;

  if (!establishmentId || typeof openingAmount !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);

    await db.runTransaction(async (transaction) => {
      const openShiftsSnap = await transaction.get(
        estRef.collection("cashShifts").where("status", "==", "open")
      );
      if (!openShiftsSnap.empty) {
        throw new Error("Ya existe una caja abierta.");
      }

      const shiftRef = estRef.collection("cashShifts").doc();
      transaction.set(shiftRef, {
        establishmentId,
        status: "open",
        openingAmount,
        closingAmount: null,
        openedBy: request.auth?.uid || "",
        closedBy: null,
        openedAt: admin.firestore.FieldValue.serverTimestamp(),
        closedAt: null,
        movements: [],
        totalExpected: null,
        totalActual: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: "Caja abierta." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Cerrar Caja
// ============================================================================
export const closeCashShift = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, cashShiftId, closingAmount } = request.data;

  if (!establishmentId || !cashShiftId || typeof closingAmount !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const shiftRef = estRef.collection("cashShifts").doc(cashShiftId);

    await db.runTransaction(async (transaction) => {
      const shiftSnap = await transaction.get(shiftRef);
      if (!shiftSnap.exists) {
        throw new Error("La caja no existe.");
      }

      const shift = shiftSnap.data();
      if (!shift) throw new Error("Datos de caja inválidos.");
      if (shift.status !== "open") {
        throw new Error("La caja no está abierta.");
      }

      transaction.update(shiftRef, {
        status: "closed",
        closingAmount,
        closedBy: request.auth?.uid || "",
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalExpected: shift.openingAmount,
        totalActual: closingAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: "Caja cerrada." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Registrar Movimiento Manual de Caja (Ingreso / Egreso)
// ============================================================================
export const addCashMovement = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, type, amount, reason, description, notes, method = "cash" } = request.data;
  const cashShiftId = request.data.cashShiftId || request.data.shiftId;

  if (!establishmentId || !cashShiftId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan parámetros requeridos: establishmentId y cashShiftId son obligatorios."
    );
  }

  const validTypes = ["in", "out", "income", "expense"];
  if (!type || !validTypes.includes(type)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `El tipo de movimiento debe ser uno de: ${validTypes.join(", ")}.`
    );
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El monto (amount) debe ser un número positivo mayor a 0."
    );
  }

  const movementDescription = (reason || description || "").trim();
  if (!movementDescription) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El motivo o descripción del movimiento es obligatorio."
    );
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "No perteneces al staff de este establecimiento."
    );
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const shiftRef = estRef.collection("cashShifts").doc(cashShiftId);
    const movementRef = shiftRef.collection("movements").doc();

    await db.runTransaction(async (transaction) => {
      const shiftSnap = await transaction.get(shiftRef);
      if (!shiftSnap.exists) {
        throw new Error("El turno de caja especificado no existe.");
      }

      const shift = shiftSnap.data();
      if (!shift) throw new Error("Datos de caja inválidos.");
      if (shift.status !== "open") {
        throw new Error("No se pueden registrar movimientos en una caja que no esté abierta.");
      }

      transaction.set(movementRef, {
        type,
        amount,
        method: method || "cash",
        description: movementDescription,
        reason: movementDescription,
        notes: notes || null,
        relatedFolioId: null,
        createdBy: request.auth?.uid || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      success: true,
      movementId: movementRef.id,
      message: "Movimiento de caja registrado exitosamente.",
    };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});


// ============================================================================
// CALLABLE FUNCTION: Registrar Movimiento de Stock
// ============================================================================
export const recordStockMovement = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, productId, quantity, type, description } = request.data;

  if (!establishmentId || !productId || typeof quantity !== "number" || !type) {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros inválidos.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const productRef = estRef.collection("products").doc(productId);

    await db.runTransaction(async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) {
        throw new Error("El producto no existe.");
      }

      const product = productSnap.data();
      if (!product) throw new Error("Datos de producto inválidos.");
      const currentStock = product.currentStock || 0;
      const qtyChange = type === "in" ? quantity : type === "out" ? -quantity : 0;
      const resultingStock = currentStock + qtyChange;

      if (resultingStock < 0) {
        throw new Error("Stock insuficiente.");
      }

      const movementRef = estRef.collection("stockMovements").doc();
      transaction.set(movementRef, {
        productId,
        type,
        quantity,
        resultingStock,
        description: description || "",
        relatedChargeId: null,
        relatedPurchaseId: null,
        createdBy: request.auth?.uid || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(productRef, {
        currentStock: resultingStock,
        lowStock: resultingStock <= (product.minimumStock || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: "Movimiento registrado." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Cambiar Cama en Reserva/Estadía
// ============================================================================
export const changeBed = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, reservationId, lineId, newBedId } = request.data;

  if (!establishmentId || !reservationId || !lineId || !newBedId) {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros requeridos faltantes.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const lineRef = estRef.collection("reservations").doc(reservationId).collection("lines").doc(lineId);

    await db.runTransaction(async (transaction) => {
      const lineSnap = await transaction.get(lineRef);
      if (!lineSnap.exists) {
        throw new Error("La línea de reserva no existe.");
      }

      const line = lineSnap.data();
      if (!line) throw new Error("Datos de línea inválidos.");
      const oldBedId = line.bedId;

      // Validar que nueva cama esté disponible en las fechas
      const bedDates = Object.keys(line.pricePerNight || {}).sort();
      for (const dateStr of bedDates) {
        const [year, month] = dateStr.split("-");
        const yearMonth = `${year}-${month}`;
        const docId = `${newBedId}_${yearMonth}`;
        const availRef = estRef.collection("availability").doc(docId);
        const availSnap = await transaction.get(availRef);
        const day = dateStr.split("-")[2];
        if (availSnap.exists && availSnap.data()?.days[day]) {
          throw new Error(`La cama ${newBedId} no está disponible el ${dateStr}.`);
        }
      }

      // Actualizar línea
      transaction.update(lineRef, {
        bedId: newBedId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Actualizar availability: liberar cama anterior, ocupar nueva
      for (const dateStr of bedDates) {
        const [year, month] = dateStr.split("-");
        const yearMonth = `${year}-${month}`;
        const day = dateStr.split("-")[2];

        // Liberar cama anterior
        const oldDocId = `${oldBedId}_${yearMonth}`;
        const oldAvailRef = estRef.collection("availability").doc(oldDocId);
        const oldAvailSnap = await transaction.get(oldAvailRef);
        if (oldAvailSnap.exists) {
          const days = { ...oldAvailSnap.data()?.days };
          if (days[day]) {
            delete days[day];
            transaction.update(oldAvailRef, { days });
          }
        }

        // Ocupar nueva cama
        const newDocId = `${newBedId}_${yearMonth}`;
        const newAvailRef = estRef.collection("availability").doc(newDocId);
        const newAvailSnap = await transaction.get(newAvailRef);
        const newDays = newAvailSnap.exists ? { ...newAvailSnap.data()?.days } : {};
        newDays[day] = {
          reservationId,
          reservationLineId: lineId,
          mode: line.saleMode,
        };
        transaction.set(
          newAvailRef,
          {
            bedId: newBedId,
            roomId: line.roomId,
            days: newDays,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    return { success: true, message: "Cama cambiada." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Extender Estadía
// ============================================================================
export const extendStay = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, stayId, newCheckOutDate, extraCharges } = request.data;

  if (!establishmentId || !stayId || !newCheckOutDate) {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros requeridos faltantes.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const stayRef = estRef.collection("stays").doc(stayId);

    await db.runTransaction(async (transaction) => {
      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new Error("La estadía no existe.");
      }

      const stay = staySnap.data();
      if (!stay) throw new Error("Datos de estadía inválidos.");
      if (stay.status !== "active") {
        throw new Error("La estadía debe estar activa para extenderla.");
      }

      const newCheckOut = new Date(newCheckOutDate);
      const oldCheckOut = new Date(stay.expectedCheckOutDate.seconds * 1000);

      if (newCheckOut <= oldCheckOut) {
        throw new Error("La nueva fecha debe ser posterior a la actual.");
      }

      // Actualizar Stay
      transaction.update(stayRef, {
        expectedCheckOutDate: admin.firestore.Timestamp.fromDate(newCheckOut),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Agregar cargos si los hay
      if (extraCharges && extraCharges > 0) {
        const foliosSnap = await transaction.get(estRef.collection("folios").where("stayId", "==", stayId).limit(1));
        if (!foliosSnap.empty) {
          const folioRef = foliosSnap.docs[0].ref;
          const folioData = foliosSnap.docs[0].data();

          const chargeId = db.collection("dummy").doc().id;
          const updatedCharges = [
            ...(folioData.charges || []),
            {
              id: chargeId,
              description: "Extensión de estadía",
              quantity: 1,
              unitPrice: extraCharges,
              amount: extraCharges,
              status: "pending",
              productId: null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          ];

          const newTotalCharges = (folioData.totalCharges || 0) + extraCharges;
          const newBalance = (folioData.totalPaid || 0) - newTotalCharges;

          transaction.update(folioRef, {
            charges: updatedCharges,
            totalCharges: newTotalCharges,
            balance: newBalance,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });

    return { success: true, message: "Estadía extendida." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Modificar Reserva
// ============================================================================
export const modifyReservation = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, reservationId, updates } = request.data;

  if (!establishmentId || !reservationId || !updates || typeof updates !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros requeridos faltantes.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const reservationRef = estRef.collection("reservations").doc(reservationId);

    await db.runTransaction(async (transaction) => {
      const resSnap = await transaction.get(reservationRef);
      if (!resSnap.exists) {
        throw new Error("La reserva no existe.");
      }

      const reservation = resSnap.data();
      if (!reservation) throw new Error("Datos de reserva inválidos.");
      if (reservation.status !== "confirmed") {
        throw new Error("Solo se pueden modificar reservas confirmadas.");
      }

      const allowedUpdates = ["primaryGuestId", "guestIds", "channel"];
      const filteredUpdates: any = {};

      for (const key of allowedUpdates) {
        if (key in updates) {
          filteredUpdates[key] = updates[key];
        }
      }

      filteredUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      transaction.update(reservationRef, filteredUpdates);
    });

    return { success: true, message: "Reserva modificada." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// CALLABLE FUNCTION: Cancelar Reserva
// ============================================================================
export const cancelReservation = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, reservationId, reason } = request.data;

  if (!establishmentId || !reservationId) {
    throw new functions.https.HttpsError("invalid-argument", "Parámetros requeridos faltantes.");
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const estRef = db.collection("establishments").doc(establishmentId);
    const reservationRef = estRef.collection("reservations").doc(reservationId);

    await db.runTransaction(async (transaction) => {
      const resSnap = await transaction.get(reservationRef);
      if (!resSnap.exists) {
        throw new Error("La reserva no existe.");
      }

      const reservation = resSnap.data();
      if (!reservation) throw new Error("Datos de reserva inválidos.");
      if (reservation.status === "cancelled") {
        throw new Error("La reserva ya estaba cancelada.");
      }

      const bedIds = reservation.bedIds || [];
      const checkInDate = new Date(reservation.checkInDate.seconds * 1000);
      const checkOutDate = new Date(reservation.checkOutDate.seconds * 1000);

      // Liberar todas las camas en el rango de fechas
      for (let d = new Date(checkInDate); d < checkOutDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const [year, month] = dateStr.split("-");
        const yearMonth = `${year}-${month}`;
        const day = dateStr.split("-")[2];

        for (const bedId of bedIds) {
          const docId = `${bedId}_${yearMonth}`;
          const availRef = estRef.collection("availability").doc(docId);
          const availSnap = await transaction.get(availRef);

          if (availSnap.exists) {
            const days = { ...availSnap.data()?.days };
            if (days[day] && days[day].reservationId === reservationId) {
              delete days[day];
              transaction.update(availRef, { days });
            }
          }
        }
      }

      // Actualizar reserva
      transaction.update(reservationRef, {
        status: "cancelled",
        cancellationReason: reason || null,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, message: "Reserva cancelada." };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});

// ============================================================================
// HELPER: Generar Resumen Diario para un Establecimiento
// ============================================================================
async function processDailySummaryForEstablishment(
  establishmentId: string,
  dateStr: string
) {
  const estRef = db.collection("establishments").doc(establishmentId);
  const [year, month, day] = dateStr.split("-");

  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

  const [reservationsSnap, staysSnap, foliosSnap, roomsSnap, availSnap] =
    await Promise.all([
      estRef.collection("reservations").get(),
      estRef.collection("stays").get(),
      estRef.collection("folios").get(),
      estRef.collection("rooms").get(),
      estRef.collection("availability").get(),
    ]);

  // 1. Reservas creadas en el día
  const newReservationsCount = reservationsSnap.docs.filter((d) => {
    const data = d.data();
    if (!data.createdAt) return false;
    const dt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt.seconds * 1000);
    return dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 2. Cancelaciones ocurridas en el día
  const cancellationsCount = reservationsSnap.docs.filter((d) => {
    const data = d.data();
    if (data.status !== "cancelled") return false;
    const dt = data.cancelledAt
      ? (data.cancelledAt.toDate ? data.cancelledAt.toDate() : new Date(data.cancelledAt.seconds * 1000))
      : (data.updatedAt?.toDate ? data.updatedAt.toDate() : null);
    return dt && dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 3. Check-ins ocurridos en el día
  const checkInsCount = staysSnap.docs.filter((d) => {
    const data = d.data();
    if (!data.checkInDate) return false;
    const dt = data.checkInDate.toDate ? data.checkInDate.toDate() : new Date(data.checkInDate.seconds * 1000);
    return dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 4. Check-outs ocurridos en el día
  const checkOutsCount = staysSnap.docs.filter((d) => {
    const data = d.data();
    if (!data.actualCheckOutDate) return false;
    const dt = data.actualCheckOutDate.toDate
      ? data.actualCheckOutDate.toDate()
      : new Date(data.actualCheckOutDate.seconds * 1000);
    return dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 5. Ingresos (pagos completados) registrados en folios durante el día
  let totalRevenue = 0;
  for (const folioDoc of foliosSnap.docs) {
    const folio = folioDoc.data();
    const payments = Array.isArray(folio.payments) ? folio.payments : [];
    for (const p of payments) {
      if (p.status === "completed" && p.createdAt && typeof p.amount === "number") {
        const pDate = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt.seconds * 1000);
        if (pDate >= startOfDay && pDate <= endOfDay) {
          totalRevenue += p.amount;
        }
      }
    }
  }

  // 6. Ocupación de camas
  const bedCountPromises = roomsSnap.docs.map(async (rDoc) => {
    const bedsSnap = await rDoc.ref.collection("beds").where("status", "==", "active").get();
    return bedsSnap.size;
  });
  const bedCounts = await Promise.all(bedCountPromises);
  const totalBeds = bedCounts.reduce((acc, count) => acc + count, 0);

  let occupiedBedsCount = 0;
  for (const doc of availSnap.docs) {
    if (doc.id.endsWith(`_${year}-${month}`)) {
      const days = doc.data()?.days || {};
      if (days[day]) {
        occupiedBedsCount++;
      }
    }
  }

  const occupancy = totalBeds > 0 ? Math.min(100, Math.round((occupiedBedsCount / totalBeds) * 100)) : 0;

  // 7. Guardar en dailySummaries/{YYYY-MM-DD} de forma idempotente
  const summaryRef = estRef.collection("dailySummaries").doc(dateStr);
  await summaryRef.set(
    {
      id: dateStr,
      date: dateStr,
      reservations: newReservationsCount,
      cancellations: cancellationsCount,
      checkIns: checkInsCount,
      checkOuts: checkOutsCount,
      revenue: Math.round(totalRevenue * 100) / 100,
      occupancy,
      totalBeds,
      occupiedBeds: occupiedBedsCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    dateStr,
    newReservationsCount,
    cancellationsCount,
    checkInsCount,
    checkOutsCount,
    totalRevenue,
    occupancy,
  };
}

// ============================================================================
// SCHEDULED FUNCTION: Generación Diaria de dailySummaries (Cierre Diario)
// Ejecuta a las 02:00 todos los días para consolidar el día anterior
// ============================================================================
export const generateDailySummaries = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "America/La_Paz",
    retryCount: 3,
  },
  async () => {
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const yesterdayDateStr = yesterday.toISOString().slice(0, 10);

    const establishmentsSnap = await db.collection("establishments").get();
    for (const estDoc of establishmentsSnap.docs) {
      try {
        await processDailySummaryForEstablishment(estDoc.id, yesterdayDateStr);
      } catch (err: any) {
        console.error(`Error procesando dailySummary para ${estDoc.id} fecha ${yesterdayDateStr}:`, err);
      }
    }
  }
);

// ============================================================================
// CALLABLE FUNCTION: Generar/Actualizar Resumen Diario On-Demand (Admin)
// ============================================================================
export const generateDailySummaryOnDemand = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado.");
  }

  const { establishmentId, date } = request.data;
  if (!establishmentId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Parámetros requeridos: establishmentId y date (formato YYYY-MM-DD)."
    );
  }

  const callerRoles = request.auth.token.roles || {};
  if (!callerRoles[establishmentId]) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos.");
  }

  try {
    const result = await processDailySummaryForEstablishment(establishmentId, date);
    return { success: true, summary: result };
  } catch (error: any) {
    throw new functions.https.HttpsError("aborted", error.message);
  }
});