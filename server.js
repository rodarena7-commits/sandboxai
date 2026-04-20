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
    adnPersonal = fs.readFileSync(adnPath, 'utf8').substring(0, 100000);
    console.log('🧠 ADN Personal cargado correctamente.');
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["Clon de Rodri", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { lastQR = qr; qrcode.generate(qr, { small: true }); }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) connectToWhatsApp();
        } else if (connection === 'open') {
            lastQR = "CONECTADO";
            console.log('✅ Clon con ADN activo y en modo automático.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        // No responder a mensajes propios ni a mensajes sin texto
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        // CONFIGURACIÓN: Responder solo a chats individuales (no grupos) para evitar spam
        if (isGroup) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const lowText = text.toLowerCase();

        // Comando de testeo oculto
        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: '¡Golazo! El clon automático está online.' });
            return;
        }

        // --- RESPUESTA AUTOMÁTICA DEL CLON ---
        try {
            console.log(`🤖 Respondiendo automáticamente a: ${from}`);
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
                        1. Sos Rodrigo, pero SIEMPRE debés incluir una breve aclaración al final o al principio del mensaje (ej: "[Clon de Rodri]") para que la persona sepa que no es el humano real.
                        2. No sos un asistente. Sos Rodri chateando: usá voseo, che, dale, abreviaturas de WhatsApp.
                        3. Si alguien te pregunta algo muy personal o que no está en tu ADN, decí que "esperen a que el Rodri real se libere y te conteste bien".
                        4. Sé breve. Nadie manda testamentos por WhatsApp.` 
                    },
                    { role: "user", content: text }
                ]
            });

            let aiResponse = response.choices[0].message.content;
            
            // Asegurarnos de que la aclaración esté presente si la IA se olvida
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
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Clon Automático Activo</h1>');
    res.send(`<div style="text-align:center"><h2>Escaneá el nuevo motor</h2><img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" /></div>`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Motor automático en puerto ${PORT}`));
