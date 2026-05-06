require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// --- ESTADO Y CACHE ---
let lastQR = "";
let sock;

// --- CONFIGURACIÓN IA (GROQ) ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP (BAILEYS - SIN NAVEGADOR / ULTRA LIGERO) ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }), // Silenciamos logs para ahorrar RAM
        browser: ["Clon de Rodri", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log('--- NUEVO CÓDIGO QR ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. ¿Reconectando?:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            lastQR = "CONECTADO";
            console.log('✅ ¡WHATSAPP CONECTADO (MODO LIGERO)!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const lowText = text.toLowerCase();

        // Respuesta Simple
        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: '¡Golazo! El clon está online y consumiendo muy poca RAM.' });
            return;
        }

        // Lógica del Clon
        if (lowText.startsWith('!clon')) {
            const query = text.replace(/!clon/i, '').trim() || "¿Cómo va todo?";
            
            try {
                // Simular que escribe
                await sock.sendPresenceUpdate('composing', from);

                const response = await groq.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { 
                            role: "system", 
                            content: `Sos Rodrigo Nahuel Narena (35 años, de Morón). 
                            Trabajás en rampa en Aerolíneas Argentinas y sos desarrollador web. 
                            Estilo: Argentino, directo, buena onda. Usás "vos", "che", "dale", "golazo". 
                            Respondé breve y natural.` 
                        },
                        { role: "user", content: query }
                    ]
                });

                await sock.sendMessage(from, { text: response.choices[0].message.content });
            } catch (err) {
                console.error('Error Groq:', err.message);
            }
        }
    });
}

connectToWhatsApp();

// --- RUTAS DEL SERVIDOR ---
app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Sesión Vinculada</h1><p>Tu clon está activo.</p>');
    if (!lastQR) return res.send('<h1>Iniciando servidor...</h1>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Clon de Rodrigo (Modo Ligero)</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escaneá desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('🚀 SandBox AI: Motor Baileys Activo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
