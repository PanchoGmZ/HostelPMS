import { 
  signInWithEmailAndPassword, 
  signOut, 
  setPersistence, 
  browserLocalPersistence,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import { auth } from './config';

// 1. Configurar persistencia explícita
// En un PMS, usamos 'browserLocalPersistence' para que la sesión sobreviva si 
// el recepcionista recarga la página o cierra la pestaña por accidente.
export const initializeAuthPersistence = async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error("Error configurando la persistencia de sesión:", error);
  }
};

// 2. Función de Login
export const loginUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Error en login:", error);
    throw error; 
  }
};

// 3. Función de Logout
export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    throw error;
  }
};

// 4. Observador de Estado (Listener)
// Esta función avisa a React cada vez que el usuario entra o sale.
// Es crucial para proteger las rutas privadas en tu Frontend.
export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};