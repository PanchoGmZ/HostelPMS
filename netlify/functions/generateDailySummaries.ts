import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { getFirebaseAdmin } from '../server/src/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { processDailySummaryForEstablishment } from '../server/src/services/reports/generateDailySummary';

const generateDailySummariesHandler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('Iniciando cron job: generateDailySummaries');
  
  getFirebaseAdmin();
  const db = getFirestore();

  // El cron corre a las 06:00 UTC (02:00 America/La_Paz).
  // Para obtener la fecha de "ayer", restamos 24 horas y formateamos en el huso horario local.
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const yesterdayDateStr = formatter.format(yesterday);
  console.log(`Procesando cierre diario para la fecha: ${yesterdayDateStr}`);

  try {
    const establishmentsSnap = await db.collection('establishments').get();
    let successCount = 0;
    let errorCount = 0;

    for (const estDoc of establishmentsSnap.docs) {
      try {
        await processDailySummaryForEstablishment(estDoc.id, yesterdayDateStr);
        successCount++;
        console.log(`Resumen generado exitosamente para establecimiento: ${estDoc.id}`);
      } catch (err: any) {
        errorCount++;
        console.error(`Error procesando dailySummary para ${estDoc.id} fecha ${yesterdayDateStr}:`, err.message);
        // Continuamos con el siguiente establecimiento para no detener el cron si falla uno.
      }
    }

    console.log(`Cron job finalizado. Éxito: ${successCount}. Fallos: ${errorCount}.`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Cron job ejecutado.' }),
    };
  } catch (error: any) {
    console.error('Fallo crítico en cron job:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Fallo crítico al iniciar proceso de cierre diario.' }),
    };
  }
};

// Cron: Ejecutar a las 06:00 UTC = 02:00 America/La_Paz (UTC-4 sin DST)
export const handler = schedule('0 6 * * *', generateDailySummariesHandler);
