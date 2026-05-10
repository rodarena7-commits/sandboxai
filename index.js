require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

let lastQR = "";
let sock;

// --- USUARIOS PARA DEVOCIONAL Y EVENTOS ---
const USUARIOS_DEVOCIONAL = [
  { nombre: 'Rodrigo', jid: '5491158660344@s.whatsapp.net' },
  { nombre: 'Gabo',    jid: '541122831781@s.whatsapp.net'  },
];

// --- GROQ CLIENT ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- FIREBASE ADMIN ---
let firebaseServiceAccount = {};
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // Si comienza con { es JSON directo, sino es Base64
    if (process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith('{')) {
      firebaseServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      // Decodificar desde Base64
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8');
      firebaseServiceAccount = JSON.parse(decoded);
    }
  } catch (err) {
    console.error('❌ Error parsando FIREBASE_SERVICE_ACCOUNT:', err.message);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});
const db = admin.firestore();

// --- GOOGLE DRIVE AUTH (para sincronización) ---
const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });
const LETRAS_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

// --- FUNCIONES DE SINCRONIZACIÓN DRIVE → FIRESTORE ---

async function listarLetrasEnDrive() {
    try {
        const res = await drive.files.list({
            q: `'${LETRAS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 100,
        });
        return res.data.files || [];
    } catch (err) {
        console.error('❌ Error listando Drive:', err.message);
        return [];
    }
}

async function leerContenidoDoc(fileId) {
    try {
        const res = await drive.files.export({
            fileId,
            mimeType: 'text/plain',
        });
        return String(res.data).substring(0, 1500);
    } catch (err) {
        console.error(`❌ Error leyendo doc ${fileId}:`, err.message);
        return "";
    }
}

async function sincronizarCancionesConFirestore() {
    console.log('🔄 Iniciando sincronización Drive → Firestore...');

    try {
        const archivos = await listarLetrasEnDrive();
        if (archivos.length === 0) {
            console.log('❌ No se encontraron archivos en Drive');
            return { exito: false, mensaje: 'No hay archivos en Drive' };
        }

        console.log(`📂 Encontré ${archivos.length} canciones en Drive`);

        let sincronizadas = 0;
        for (const archivo of archivos) {
            try {
                const letra = await leerContenidoDoc(archivo.id);
                if (letra.trim().length > 0) {
                    // Guardar en Firestore: colección 'canciones', doc con ID basado en nombre
                    const docId = archivo.name
                        .replace(/\.docx?$/i, '') // remover extensión
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '-')
                        .substring(0, 30);

                    await db.collection('canciones').doc(docId).set({
                        titulo: archivo.name.replace(/\.docx?$/i, ''),
                        letra: letra,
                        fechaSincronizacion: admin.firestore.FieldValue.serverTimestamp()
                    });

                    sincronizadas++;
                    console.log(`✅ ${archivo.name}`);
                }
            } catch (err) {
                console.error(`⚠️ Error procesando ${archivo.name}:`, err.message);
            }
        }

        console.log(`✅ Sincronización completada: ${sincronizadas} canciones guardadas`);
        return { exito: true, sincronizadas, mensaje: `${sincronizadas} canciones sincronizadas` };
    } catch (err) {
        console.error('❌ Error en sincronización:', err.message);
        return { exito: false, mensaje: 'Error durante la sincronización' };
    }
}

// --- FUNCIONES DE BÚSQUEDA EN FIRESTORE ---

async function obtenerCancionesDeFirestore(tema) {
    console.log(`🎵 Buscando canciones para: "${tema}"`);

    try {
        const snapshot = await db.collection('canciones').limit(50).get();

        if (snapshot.empty) {
            return "📭 La biblioteca de canciones está vacía. El admin debe ejecutar /sync para cargar canciones desde Google Drive.";
        }

        console.log(`📂 Encontré ${snapshot.size} canciones en Firestore`);

        const contenidos = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            contenidos.push({
                nombre: data.titulo || doc.id,
                letra: data.letra.substring(0, 1500)
            });
        });

        const catalogoCanciones = contenidos
            .filter(c => c.letra.trim().length > 0)
            .map((c, i) => `--- CANCIÓN ${i + 1}: "${c.nombre}" ---\n${c.letra}`)
            .join('\n\n');

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 2000,
            messages: [
                {
                    role: "system",
                    content: `Sos un experto en música cristiana y alabanzas. Tu tarea es seleccionar las canciones más apropiadas para un tema o petición específica.
Responde siempre en español, con un tono cálido y pastoral.
Sé conciso pero significativo en las justificaciones.`
                },
                {
                    role: "user",
                    content: `El usuario busca canciones para: "${tema}"

A continuación están las letras disponibles:

${catalogoCanciones}

Por favor, selecciona las hasta 10 canciones más apropiadas. Para cada una indica:
1. El nombre de la canción
2. Por qué es apropiada (2-3 oraciones)

Presenta la lista numerada, ordenada de más a menos recomendada.`
                }
            ]
        });

        return response.choices[0].message.content;
    } catch (err) {
        console.error('❌ Error en búsqueda Firestore:', err.message);
        return "❌ Error al buscar canciones. Intenta de nuevo más tarde.";
    }
}

// --- DETECCIÓN DE PEDIDOS DE CANCIONES ---

async function esUnPedidoDeCanciones(texto) {
    if (texto.length < 4 || texto.length > 200) return false;

    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 10,
            messages: [
                {
                    role: "system",
                    content: `Responde SOLO con "SI" o "NO". Sin explicaciones.`
                },
                {
                    role: "user",
                    content: `¿Esta persona está pidiendo canciones, alabanzas, música cristiana o sugerencias de canciones? Mensaje: "${texto}"`
                }
            ]
        });
        const respuesta = res.choices[0].message.content.trim().toUpperCase();
        return respuesta.includes('SI');
    } catch {
        return false;
    }
}

// --- DEVOCIONAL DIARIO Y CALENDARIO ---

async function generarDevocional() {
    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 500,
            messages: [
                {
                    role: "system",
                    content: `Eres un pastor cristiano que genera devocionales diarios breves.`
                },
                {
                    role: "user",
                    content: `Genera un devocional cristiano breve para hoy con:
1. Un versículo bíblico (en formato: Libro X:Y)
2. El texto del versículo
3. Una reflexión corta (2-3 líneas) sobre su significado para la vida
4. Una oración breve

Formato simple y directo para WhatsApp.`
                }
            ]
        });
        return res.choices[0].message.content;
    } catch (err) {
        console.error('❌ Error generando devocional:', err.message);
        return "📖 Devocional del día: Que Dios te bendiga";
    }
}

async function enviarDevocionalDiario() {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        const snapshot = await db.collection('devocionales').doc(hoy).get();

        if (snapshot.exists) {
            console.log(`✅ Devocional de ${hoy} ya enviado`);
            return;
        }

        const devocional = await generarDevocional();

        for (const usuario of USUARIOS_DEVOCIONAL) {
            try {
                await sock.sendMessage(usuario.jid, { text: `📖 Devocional del día (${usuario.nombre}):\n\n${devocional}` });
                console.log(`✅ Devocional enviado a ${usuario.nombre}`);
            } catch (err) {
                console.error(`❌ Error enviando a ${usuario.nombre}:`, err.message);
            }
        }

        await db.collection('devocionales').doc(hoy).set({
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            contenido: devocional
        });
    } catch (err) {
        console.error('❌ Error en enviarDevocionalDiario:', err.message);
    }
}

async function verificarEventos() {
    try {
        const ahora = new Date();
        const eventosSnapshot = await db.collection('eventos').where('notificadoHora', '==', false).get();

        for (const doc of eventosSnapshot.docs) {
            const evento = doc.data();
            const fechaEvento = new Date(evento.fechaISO);
            const diferenciaMs = fechaEvento - ahora;
            const diferenciaMin = Math.round(diferenciaMs / (1000 * 60));

            if (diferenciaMin <= 60 && diferenciaMin > 0) {
                for (const usuario of USUARIOS_DEVOCIONAL) {
                    try {
                        await sock.sendMessage(usuario.jid, {
                            text: `⏰ En ${diferenciaMin} minuto${diferenciaMin !== 1 ? 's' : ''}: ${evento.titulo}`
                        });
                    } catch (err) {
                        console.error(`Error notificando a ${usuario.nombre}:`, err.message);
                    }
                }
                await db.collection('eventos').doc(doc.id).update({ notificadoHora: true });
            }
        }
    } catch (err) {
        console.error('❌ Error en verificarEventos:', err.message);
    }
}

async function agendarEvento(texto, autorNombre) {
    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 300,
            messages: [
                {
                    role: "system",
                    content: `Extrae información de un evento en formato JSON. Responde SOLO con el JSON, sin más texto.
{
  "titulo": "nombre del evento",
  "descripcion": "descripción breve",
  "fechaISO": "2026-05-20T19:00:00-03:00"
}`
                },
                {
                    role: "user",
                    content: `Extrae el evento de: "${texto}"`
                }
            ]
        });

        const jsonStr = res.choices[0].message.content.trim();
        const eventoData = JSON.parse(jsonStr);

        const docRef = await db.collection('eventos').add({
            titulo: eventoData.titulo,
            descripcion: eventoData.descripcion || '',
            fechaISO: eventoData.fechaISO,
            creadoPor: autorNombre,
            notificadoDia: false,
            notificadoHora: false,
            fechaCreacion: admin.firestore.FieldValue.serverTimestamp()
        });

        const fecha = new Date(eventoData.fechaISO);
        const fechaFormato = fecha.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const horaFormato = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        return `✅ Evento agendado:\n📅 ${eventoData.titulo}\n📍 ${fechaFormato} a las ${horaFormato}\n\nTe notificaré 1 hora antes.`;
    } catch (err) {
        console.error('❌ Error agendando evento:', err.message);
        return '❌ Error al agendar el evento. Intenta de nuevo con este formato: "agenda: Evento el 20/05 a las 19:00"';
    }
}

// --- WHATSAPP ---

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Roberto", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            lastQR = qr;
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Conexión cerrada (Código: ${statusCode}). Reconectando: ${shouldReconnect}`);
            if (shouldReconnect) connectToWhatsApp();
            else { lastQR = ""; }
        } else if (connection === 'open') {
            lastQR = "CONECTADO";
            console.log('✅ WHATSAPP CONECTADO!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const esGrupo = from.endsWith('@g.us');

        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption || "";

        if (!text) return;

        // En grupos, responde solo si mencionan "roberto"
        if (esGrupo && !text.toLowerCase().includes('roberto')) return;

        const lowText = text.toLowerCase();

        // Comando ping
        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: '✅ Roberto en línea y listo para sugerir canciones.' });
            return;
        }

        // Detectar si quiere agendar evento
        if (lowText.includes('agenda:') || lowText.includes('agendar:')) {
            try {
                const autorNombre = from.includes('5491158660344') ? 'Rodrigo' :
                                   from.includes('541122831781') ? 'Gabo' : 'Usuario';
                const confirmacion = await agendarEvento(text, autorNombre);
                await sock.sendMessage(from, { text: confirmacion });
                return;
            } catch (err) {
                console.error('❌ Error agendando:', err.message);
                await sock.sendMessage(from, { text: '❌ Error al agendar el evento.' });
                return;
            }
        }

        // Detectar si es un pedido de canciones
        const esPedidoCanciones = await esUnPedidoDeCanciones(text);

        if (esPedidoCanciones) {
            try {
                await sock.sendPresenceUpdate('composing', from);
                await sock.sendMessage(from, {
                    text: `🎵 Buscando canciones para: "${text}"\n\nEstoy revisando la biblioteca, dame un momento... 🙏`
                });

                const listaCanciones = await obtenerCancionesDeFirestore(text);

                await sock.sendMessage(from, {
                    text: `${listaCanciones}\n\n_📚 Canciones de la biblioteca de Bibl-ia_`
                });

            } catch (err) {
                console.error('❌ Error en búsqueda:', err.message);
                await sock.sendMessage(from, {
                    text: '❌ Ocurrió un error buscando las canciones. Intenta de nuevo.'
                });
            }
            return;
        }

        // Si no es pedido de canciones y estamos en grupo, no responder
        if (esGrupo) return;

        // En chat individual: responder que Roberto solo busca canciones
        try {
            console.log(`📩 Mensaje recibido de ${from}: "${text}"`);
            await sock.sendPresenceUpdate('composing', from);

            await sock.sendMessage(from, {
                text: `Soy Roberto 🎵\n\nEspecialista en sugerencias de canciones y alabanzas.\n\nCuéntame:\n• ¿Qué tipo de canciones buscas?\n• ¿Para qué evento o estado emocional?\n• ¿Algún tema específico?\n\nY te sugeriré las mejores canciones de la biblioteca.`
            });

        } catch (err) {
            console.error('❌ Error:', err.message);
        }
    });

    // --- CRON JOBS ---

    // Verificar eventos cada 5 minutos
    setInterval(verificarEventos, 5 * 60 * 1000);
    console.log('📅 Verificador de eventos activo (cada 5 min)');

    // Devocional diario a las 7:00 AM Argentina
    setInterval(() => {
        const ahora = new Date();
        const horaArg = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        if (horaArg.getHours() === 7 && horaArg.getMinutes() === 0) {
            console.log('📖 Enviando devocional diario...');
            enviarDevocionalDiario();
        }
    }, 60 * 1000);
    console.log('📖 Devocional diario programado para las 7:00 AM Argentina');
}

connectToWhatsApp();

// --- ENDPOINTS ---

app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Roberto está conectado</h1>');
    if (!lastQR) return res.send('<h1>⏳ Iniciando...</h1><p>Recarga en 10 segundos.</p>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Roberto</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escanea desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/sync', async (req, res) => {
    const resultado = await sincronizarCancionesConFirestore();
    res.json({
        success: resultado.exito,
        message: resultado.mensaje,
        canciones: resultado.sincronizadas || 0
    });
});

app.post('/agregar-evento', async (req, res) => {
    try {
        const { titulo, descripcion, fechaISO, creadoPor } = req.body;

        if (!titulo || !fechaISO) {
            return res.status(400).json({ error: 'Se requieren titulo y fechaISO' });
        }

        const docRef = await db.collection('eventos').add({
            titulo,
            descripcion: descripcion || '',
            fechaISO,
            creadoPor: creadoPor || 'API',
            notificadoDia: false,
            notificadoHora: false,
            fechaCreacion: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Evento creado correctamente',
            eventoId: docRef.id
        });
    } catch (err) {
        console.error('❌ Error en /agregar-evento:', err.message);
        res.status(500).json({ error: 'Error al crear el evento' });
    }
});

app.get('/eventos', async (req, res) => {
    try {
        const snapshot = await db.collection('eventos').orderBy('fechaISO').get();
        const eventos = [];
        snapshot.forEach(doc => {
            eventos.push({ id: doc.id, ...doc.data() });
        });
        res.json({ success: true, eventos });
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

app.get('/', (req, res) => res.send('🎵 Roberto - Bot de canciones con Firestore y calendario'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
