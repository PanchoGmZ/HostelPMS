import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { CleaningTask, MaintenanceIncident, TaskStatus } from '../../types/operations'
const root = (id: string) => `establishments/${id}`
export async function listOperations(establishmentId: string) { const base = root(establishmentId); const [cleaning, maintenance] = await Promise.all([getDocs(collection(db, `${base}/cleaningTasks`)), getDocs(collection(db, `${base}/maintenanceIncidents`))]); return { cleaning: cleaning.docs.map((item) => ({ id: item.id, ...item.data() })) as CleaningTask[], maintenance: maintenance.docs.map((item) => ({ id: item.id, ...item.data() })) as MaintenanceIncident[] } }
export async function createCleaningTask(establishmentId: string, task: Omit<CleaningTask, 'id'>) { await setDoc(doc(collection(db, `${root(establishmentId)}/cleaningTasks`)), { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }) }
export async function updateCleaningStatus(establishmentId: string, taskId: string, status: TaskStatus) { await updateDoc(doc(db, `${root(establishmentId)}/cleaningTasks`, taskId), { status, updatedAt: serverTimestamp() }) }
export async function createIncident(establishmentId: string, incident: Omit<MaintenanceIncident, 'id'>) { await setDoc(doc(collection(db, `${root(establishmentId)}/maintenanceIncidents`)), { ...incident, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }) }
export async function updateIncidentStatus(establishmentId: string, incidentId: string, status: TaskStatus) { await updateDoc(doc(db, `${root(establishmentId)}/maintenanceIncidents`, incidentId), { status, updatedAt: serverTimestamp() }) }
