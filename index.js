require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const OpenAI = require('openai');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const pdfParse = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());

const QR_FILE = path.join(__dirname, 'qr_permanente.txt');

let lastQR = "";
let sock;
let isConnected = false;

// --- GROQ CONFIG ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- GOOGLE DRIVE AUTH ---
let driveClient = null;
const LETRAS_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

function initializeDrive() {
    try {
        const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
        const auth = new google.auth.GoogleAuth({
            credentials: serviceAccount,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        console.log('✅ Google Drive inicializado');
    } catch (err) {
        console.error('❌ Error iniciando Drive:', err.message);
    }
}

initializeDrive();

// --- QR PERSISTENCE ---
function cargarQRGuardado() {
    if (fs.existsSync(QR_FILE)) {
        return fs.readFileSync(QR_FILE, 'utf8').trim();
    }
    return null;
}

function guardarQR(qr) {
    fs.writeFileSync(QR_FILE, qr, 'utf8');
}

lastQR = cargarQRGuardado() || "";

// --- FUNCIONES DE DRIVE Y GROQ ---

async function listarLetrasEnDrive() {
    if (!driveClient) return [];
    try {
        const res = await driveClient.files.list({
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
    if (!driveClient) return "";
    try {
        const res = await driveClient.files.export({
            fileId,
            mimeType: 'text/plain',
        });
        return String(res.data).substring(0, 1500);
    } catch (err) {
        console.error(`❌ Error leyendo doc ${fileId}:`, err.message);
        return "";
    }
}

async function obtenerCancionesParaSermon(tituloSermon) {
    console.log(`🎵 Buscando canciones para: "${tituloSermon.substring(0, 60)}..."`);

    const archivos = await listarLetrasEnDrive();
    if (archivos.length === 0) {
        return "No encontré archivos de letras en el Drive. Verificá el DRIVE_FOLDER_ID.";
    }
    console.log(`📂 Encontré ${archivos.length} canciones en Drive.`);

    const archivosALeer = archivos.slice(0, 50);
    const contenidos = await Promise.all(
        archivosALeer.map(async (archivo) => {
            const texto = await leerContenidoDoc(archivo.id);
            return { nombre: archivo.name, letra: texto };
        })
    );

    const catalogoCanciones = contenidos
        .filter(c => c.letra.trim().length > 0)
        .map((c, i) => `--- CANCIÓN ${i + 1}: "${c.nombre}" ---\n${c.letra}`)
        .join('\n\n');

    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 2000,
            messages: [
                {
                    role: "system",
                    content: `Sos un ministro de alabanza cristiano con profundo conocimiento bíblico y musical.
Tu tarea es analizar letras de canciones y seleccionar las más apropiadas para un sermón específico.
Respondé siempre en español, con un tono cálido y pastoral.
Sé conciso pero significativo en las justificaciones.`
                },
                {
                    role: "user",
                    content: `El tema del sermón es: "${tituloSermon}"

A continuación están las letras de las canciones disponibles:

${catalogoCanciones}

Por favor, seleccioná las 10 canciones más apropiadas para este tema. Para cada una indicá:
1. El nombre de la canción
2. Por qué se recomienda (2-3 oraciones explicando la conexión temática)

Presentá la lista numerada del 1 al 10, ordenada de la más a la menos recomendada.`
                }
            ]
        });

        return response.choices[0].message.content;
    } catch (err) {
        console.error('❌ Error Groq:', err.message);
        return "Error consultando con IA. Intentá más tarde.";
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
            guardarQR(qr);
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Conexión cerrada (Código: ${statusCode}). Reconectando: ${shouldReconnect}`);
            isConnected = false;
            if (shouldReconnect) connectToWhatsApp();
            else {
                lastQR = "";
                if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log('✅ WHATSAPP CONECTADO!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');

        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption ||
                     msg.message.documentMessage?.caption || "";

        const lowText = text.toLowerCase();
        const mentionsRoberto = lowText.includes('roberto');

        // En grupos: solo responder si mencionan "Roberto"
        if (isGroup && !mentionsRoberto) return;

        const isPDF = msg.message.documentMessage?.mimetype === 'application/pdf';

        let sermonTexto = text;

        if (isPDF) {
            try {
                await sock.sendMessage(from, { text: '📄 Recibí el PDF, extrayendo el contenido del sermón...' });
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                );
                const pdfData = await pdfParse(buffer);
                sermonTexto = pdfData.text.substring(0, 3000);
            } catch (err) {
                console.error('❌ Error leyendo PDF:', err.message);
                await sock.sendMessage(from, { text: '❌ No pude leer el PDF. Intentá enviarlo de nuevo.' });
                return;
            }
        }

        if (!sermonTexto.trim()) return;

        try {
            await sock.sendPresenceUpdate('composing', from);
            const preview = isPDF ? 'el sermón del PDF' : sermonTexto.substring(0, 60);
            await sock.sendMessage(from, {
                text: `🎵 Buscando canciones para *"${preview}"*...\n\nRevisando la biblioteca en Drive, dame un momento. 🙏`
            });

            const listaCanciones = await obtenerCancionesParaSermon(sermonTexto);

            await sock.sendMessage(from, {
                text: `${listaCanciones}\n\n_📁 Canciones extraídas del Google Drive_`
            });
        } catch (err) {
            console.error('❌ Error:', err.message);
            await sock.sendMessage(from, { text: '❌ Ocurrió un error buscando las canciones.' });
        }
    });
}

connectToWhatsApp();

// --- ENDPOINTS ---

app.get('/qr', (req, res) => {
    if (isConnected) return res.send('<h1>✅ Roberto está conectado</h1>');
    if (!lastQR) return res.send('<h1>⏳ Iniciando...</h1><p>Recarga en 10 segundos.</p>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Roberto</h2>
            <p style="color:#999; font-size:0.9rem;">QR permanente - No cambia</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escanea desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('🎵 Roberto - Bot de alabanza'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
