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

const app = express();
app.use(cors());
app.use(express.json());

let lastQR = "";
let sock;

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- CARGA DE ADN (BASE DE DATOS PERSONAL) ---
let adnPersonal = "Información no cargada. Usar estilo genérico de Rodrigo.";
const adnPath = path.join(__dirname, 'mi_adn.txt');

if (fs.existsSync(adnPath)) {
    adnPersonal = fs.readFileSync(adnPath, 'utf8').substring(0, 6000);
    console.log(`🧠 ADN Personal cargado. Tamaño actual: ${adnPersonal.length} caracteres.`);
}

async function connectToWhatsApp() {
    // Usamos una carpeta específica para la sesión
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            // Añadimos cache de llaves para evitar el error de Bad MAC
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Clon de Rodri", "Chrome", "1.0.0"],
        // Aumentamos los tiempos de espera para evitar desconexiones en Render
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
            
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('❌ Sesión cerrada permanentemente. Por favor, borra la carpeta auth_info_baileys y re-escanea.');
                lastQR = "";
            }
        } else if (connection === 'open') {
            lastQR = "CONECTADO";
            console.log('✅ ¡WHATSAPP CONECTADO Y SINCRONIZADO!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        // No responder si no hay mensaje, si es nuestro o si es un error de descifrado
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        if (from.endsWith('@g.us')) return; // Ignorar grupos

        // Extraer texto con validación por si el mensaje falla al descifrar (Bad MAC)
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";

        if (!text) {
            console.log('⚠️ Recibido mensaje vacío o sin descifrar (Bad MAC). Ignorando...');
            return;
        }

        const lowText = text.toLowerCase();
        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: '¡Golazo! El clon automático está online y estable.' });
            return;
        }

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

app.get('/', (req, res) => res.send('🚀 Motor Baileys estable con ADN'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
