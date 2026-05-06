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
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'service-account.json'), // Tu archivo de credenciales
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// --- ID DE TU CARPETA DE LETRAS EN DRIVE ---
// Copiá el ID de la URL de tu carpeta: drive.google.com/drive/folders/ESTE_ES_EL_ID
const LETRAS_FOLDER_ID = process.env.DRIVE_FOLDER_ID || 'TU_FOLDER_ID_AQUI';

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
        // Limitamos a 1500 chars por canción para no explotar el contexto
        return String(res.data).substring(0, 1500);
    } catch (err) {
        console.error(`❌ Error leyendo doc ${fileId}:`, err.message);
        return "";
    }
}

async function obtenerCancionesParaSermon(tituloSermon) {
    console.log(`🎵 Buscando canciones para el sermón: "${tituloSermon}"`);

    // 1. Listar todos los docs en la carpeta
    const archivos = await listarLetrasEnDrive();
    if (archivos.length === 0) {
        return "No encontré archivos de letras en tu Drive. Verificá el DRIVE_FOLDER_ID.";
    }
    console.log(`📂 Encontré ${archivos.length} canciones en Drive.`);

    // 2. Leer contenido de cada uno (en paralelo, máximo 50 para no sobrecargar)
    const archivosALeer = archivos.slice(0, 50);
    const contenidos = await Promise.all(
        archivosALeer.map(async (archivo) => {
            const texto = await leerContenidoDoc(archivo.id);
            return { nombre: archivo.name, letra: texto };
        })
    );

    // 3. Armar el contexto de canciones para el LLM
    const catalogoCanciones = contenidos
        .filter(c => c.letra.trim().length > 0)
        .map((c, i) => `--- CANCIÓN ${i + 1}: "${c.nombre}" ---\n${c.letra}`)
        .join('\n\n');

    // 4. Pedirle a Groq que seleccione y justifique
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
                content: `El título del sermón de hoy es: "${tituloSermon}"

A continuación están las letras de las canciones disponibles en nuestra biblioteca:

${catalogoCanciones}

Por favor, seleccioná las 10 canciones más apropiadas para este sermón. Para cada una indicá:
1. El nombre de la canción
2. Por qué se recomienda para este sermón (2-3 oraciones explicando la conexión temática)

Aclará que todas estas canciones están disponibles en los archivos de letras del Drive.
Presentá la lista numerada del 1 al 10, ordenada de la más a la menos recomendada.`
            }
        ]
    });

    return response.choices[0].message.content;
}

// --- DETECCIÓN DE TÍTULO DE SERMÓN con IA ---
async function esUnTituloDeSermon(texto) {
    // Primero filtramos casos obvios para no gastar llamadas a la API
    if (texto.length < 4 || texto.length > 200) return false;
    if (texto.startsWith('!')) return false; // comandos del bot

    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            max_tokens: 10,
            messages: [
                {
                    role: "system",
                    content: `Respondé SOLO con "SI" o "NO". Sin explicaciones.`
                },
                {
                    role: "user",
                    content: `¿Este mensaje parece ser el título de un sermón cristiano o tema bíblico para el que alguien buscaría canciones de alabanza? Mensaje: "${texto}"`
                }
            ]
        });
        const respuesta = res.choices[0].message.content.trim().toUpperCase();
        return respuesta.includes('SI') || respuesta.includes('SÍ');
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
            console.log(`⚠️ Conexión cerrada (Código: ${statusCode}). Reconectando: ${shouldReconnect}`);
            if (shouldReconnect) connectToWhatsApp();
            else { lastQR = ""; }
        } else if (connection === 'open') {
            lastQR = "CONECTADO";
            console.log('✅ ¡WHATSAPP CONECTADO!');
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

        // Comando ping
        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: '¡Golazo! El clon automático está online.' });
            return;
        }

        // Detectar si es un título de sermón
        const esSermon = await esUnTituloDeSermon(text);

        if (esSermon) {
            try {
                // Avisamos que estamos procesando (puede tardar)
                await sock.sendPresenceUpdate('composing', from);
                await sock.sendMessage(from, { 
                    text: `🎵 Buscando canciones para el sermón *"${text}"*...\n\nEstoy revisando tu biblioteca en Drive, dame un momento. 🙏` 
                });

                const listaCanciones = await obtenerCancionesParaSermon(text);

                await sock.sendMessage(from, { 
                    text: `${listaCanciones}\n\n_📁 Canciones extraídas de los archivos de letras en tu Google Drive_` 
                });

            } catch (err) {
                console.error('❌ Error en flujo sermón:', err.message);
                await sock.sendMessage(from, { 
                    text: '❌ Ocurrió un error buscando las canciones. Verificá la conexión con Drive.' 
                });
            }
            return;
        }

        // Flujo normal del clon de Rodrigo
        try {
            console.log(`🤖 Respondiendo a: ${from}. Pregunta: "${text}"`);
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
1. Sos Rodrigo. SIEMPRE aclaré al final "[Clon de Rodri]".
2. Usá voseo, che, dale. Nada de formalismos.
3. Sé breve y directo. Como un chat real.` 
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
            console.error('❌ Error Groq:', err.message);
        }
    });
}

connectToWhatsApp();

app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Clon Automático Activo</h1>');
    if (!lastQR) return res.send('<h1>Iniciando...</h1><p>Recargá en 10 segundos.</p>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Clon de Rodrigo</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escaneá desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('🚀 Motor Baileys + Drive activo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
