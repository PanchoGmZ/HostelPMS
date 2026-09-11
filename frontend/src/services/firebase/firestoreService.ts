import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  serverTimestamp,
  QueryConstraint
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from './config';

// 1. Obtener un documento individual por su ID
export const getDocumentById = async <T = DocumentData>(collectionPath: string, docId: string): Promise<T | null> => {
  try {
    const docRef = doc(db, collectionPath, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
    return null;
  } catch (error) {
    console.error(`Error obteniendo documento de ${collectionPath}:`, error);
    throw error;
  }
};

// 2. Consulta genérica con filtros
export const getDocumentsWithQuery = async <T = DocumentData>(
  collectionPath: string, 
  constraints: QueryConstraint[]
): Promise<T[]> => {
  try {
    const collectionRef = collection(db, collectionPath);
    const q = query(collectionRef, ...constraints);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];
  } catch (error) {
    console.error(`Error en consulta a ${collectionPath}:`, error);
    throw error;
  }
};

// 3. Helper para obtener el timestamp del servidor (Consistencia)
export const getSystemTimestamp = () => serverTimestamp();