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

const app = express();
app.use(cors());
app.use(express.json());

let lastQR = "";
let sock;

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- GOOGLE DRIVE AUTH ---
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const LETRAS_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '';

// --- CARGA DE ADN ---
let adnPersonal = "Información no cargada. Usar estilo genérico de Rodrigo.";
const adnPath = path.join(__dirname, 'mi_adn.txt');
if (fs.existsSync(adnPath)) {
    adnPersonal = fs.readFileSync(adnPath, 'utf8').substring(0, 6000);
    console.log(`🧬 ADN Personal cargado. ${adnPersonal.length} caracteres.`);
}

// --- FUNCIONES DE GOOGLE DRIVE ---

async function listarLetrasEnDrive() {
    try {
        const res = await drive.files.list({
            q: `'${LETRAS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 100,
        });
        return res.data.files || [];
    } catch (err) {
        console.error('Error listando Drive:', err.message);
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
        console.error(`Error leyendo doc ${fileId}:`, err.message);
        return "";
    }
}

async function obtenerCancionesParaSermon(tituloSermon) {
    console.log(`Buscando canciones para: "${tituloSermon}"`);

    const archivos = await listarLetrasEnDrive();
    if (archivos.length === 0) {
        return "No encontre archivos de letras en tu Drive. Verifica el DRIVE_FOLDER_ID.";
    }
    console.log(`Encontre ${archivos.length} canciones en Drive.`);

    const archivosALeer = archivos.slice(0, 50);
    const contenidos = await Promise.all(
        archivosALeer.map(async (archivo) => {
            const texto = await leerContenidoDoc(archivo.id);
            return { nombre: archivo.name, letra: texto };
        })
    );

    const catalogoCanciones = contenidos
        .filter(c => c.letra.trim().length > 0)
        .map((c, i) => `--- CANCION ${i + 1}: "${c.nombre}" ---\n${c.letra}`)
        .join('\n\n');

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        messages: [
            {
                role: "system",
                content: `Sos un ministro de alabanza cristiano con profundo conocimiento biblico y musical. 
Tu tarea es analizar letras de canciones y seleccionar las mas apropiadas para un sermon especifico.
Responde siempre en español, con un tono calido y pastoral.
Se conciso pero significativo en las justificaciones.`
            },
            {
                role: "user",
                content: `El titulo del sermon de hoy es: "${tituloSermon}"

A continuacion estan las letras de las canciones disponibles en nuestra biblioteca:

${catalogoCanciones}

Por favor, selecciona las 10 canciones mas apropiadas para este sermon. Para cada una indica:
1. El nombre de la cancion
2. Por que se recomienda para este sermon (2-3 oraciones explicando la conexion tematica)

Aclara que todas estas canciones estan disponibles en los archivos de letras del Drive.
Presenta la lista numerada del 1 al 10, ordenada de la mas a la menos recomendada.`
            }
        ]
    });

    return response.choices[0].message.content;
}

// --- DETECCION DE TITULO DE SERMON ---
async function esUnTituloDeSermon(texto) {
    if (texto.length < 4 || texto.length > 200) return false;
    if (texto.startsWith('!')) return false;

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
                    content: `Este mensaje parece ser el titulo de un sermon cristiano o tema biblico para el que alguien buscaria canciones de alabanza? Mensaje: "${texto}"`
                }
            ]
        });
        const respuesta = res.choices[0].message.content.trim().toUpperCase();
        return respuesta.includes('SI');
    } catch {
        return false;
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
        browser: ["Clon de Rodri", "Chrome", "1.0.0"],
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
            console.log(`Conexion cerrada (Codigo: ${statusCode}). Reconectando: ${shouldReconnect}`);
            if (shouldReconnect) connectToWhatsApp();
            else { lastQR = ""; }
        } else if (connection === 'open') {
            lastQR = "CONECTADO";
            console.log('WHATSAPP CONECTADO!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        if (from.endsWith('@g.us')) return;

        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";

        if (!text) return;

        const lowText = text.toLowerCase();

        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: 'Golazo! El clon automatico esta online.' });
            return;
        }

        const esSermon = await esUnTituloDeSermon(text);

        if (esSermon) {
            try {
                await sock.sendPresenceUpdate('composing', from);
                await sock.sendMessage(from, { 
                    text: `Buscando canciones para el sermon "${text}"...\n\nEstoy revisando tu biblioteca en Drive, dame un momento.` 
                });

                const listaCanciones = await obtenerCancionesParaSermon(text);

                await sock.sendMessage(from, { 
                    text: `${listaCanciones}\n\nCanciones extraidas de los archivos de letras en tu Google Drive.` 
                });

            } catch (err) {
                console.error('Error en flujo sermon:', err.message);
                await sock.sendMessage(from, { 
                    text: 'Ocurrio un error buscando las canciones. Verifica la conexion con Drive.' 
                });
            }
            return;
        }

        try {
            console.log(`Respondiendo a: ${from}. Pregunta: "${text}"`);
            await sock.sendPresenceUpdate('composing', from);

            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos el CLON DIGITAL de Rodrigo Nahuel Narena. 
                        
CONTEXTO DE TU VIDA (ADN):
${adnPersonal}

REGLAS DE ORO:
1. Sos Rodrigo. SIEMPRE aclara al final "[Clon de Rodri]".
2. Usa voseo, che, dale. Nada de formalismos.
3. Se breve y directo. Como un chat real.` 
                    },
                    { role: "user", content: text }
                ]
            });

            let aiResponse = response.choices[0].message.content;
            if (!aiResponse.includes('Clon')) {
                aiResponse = `${aiResponse}\n\n*(Respuesta del Clon de Rodri)*`;
            }

            await sock.sendMessage(from, { text: aiResponse });

        } catch (err) {
            console.error('Error Groq:', err.message);
        }
    });
}

connectToWhatsApp();

app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>Clon Automatico Activo</h1>');
    if (!lastQR) return res.send('<h1>Iniciando...</h1><p>Recarga en 10 segundos.</p>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Clon de Rodrigo</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escanea desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('Motor Baileys + Drive activo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Puerto ${PORT} activo`));
