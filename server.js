require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const pdf = require('pdf-parse');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// --- VARIABLES GLOBALES ---
let lastQR = ""; // Aquí guardaremos el código para la web

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
    }
});

client.on('qr', (qr) => {
    lastQR = qr; // <--- GUARDAMOS EL QR
    console.log('--- NUEVO CÓDIGO QR GENERADO ---');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    lastQR = "CONECTADO"; 
    console.log('✅ ¡WhatsApp Conectado!');
});

client.on('message', async (msg) => {
    if (msg.body.startsWith('!clon')) {
        const userQuery = msg.body.replace('!clon', '').trim();
        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "Sos Rodrigo Nahuel Narena. Trabajás en rampa en Aerolíneas Argentinas. Respondé como él, usá 'vos', 'dale', 'golazo'." },
                    { role: "user", content: userQuery }
                ]
            });
            msg.reply(response.choices[0].message.content);
        } catch (err) {
            console.error('Error:', err.message);
        }
    }
});

client.initialize().catch(err => console.error('Error WhatsApp:', err));

// --- RUTAS ---

// 1. Ruta para escanear el QR cómodamente
app.get('/qr', (req, res) => {
    if (!lastQR) {
        res.send('<h1>Esperando el QR...</h1><p>Recargá la página en unos segundos.</p><script>setTimeout(() => location.reload(), 3000)</script>');
    } else if (lastQR === "CONECTADO") {
        res.send('<h1>✅ ¡WhatsApp ya está vinculado!</h1><p>Ya podés cerrar esta pestaña.</p>');
    } else {
        res.send(`
            <html>
                <body style="background: #111; color: white; text-align: center; padding-top: 50px; font-family: sans-serif;">
                    <h1>Escaneá tu Clon de WhatsApp</h1>
                    <div style="background: white; display: inline-block; padding: 20px; border-radius: 10px;">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
                    </div>
                    <p style="margin-top: 20px;">Abrí WhatsApp > Dispositivos vinculados > Vincular dispositivo</p>
                    <script>setTimeout(() => location.reload(), 15000)</script>
                </body>
            </html>
        `);
    }
});

app.get('/', (req, res) => res.send('🚀 Servidor Híbrido Activo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} abierto`));
