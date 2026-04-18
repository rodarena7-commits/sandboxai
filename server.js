require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

let lastQR = "";

// --- IA GROQ ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP ULTRA OPTIMIZADO ---
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "rodrigo-clon" }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', // Ahorra mucha RAM
            '--no-zygote',
            '--disable-gpu',
            '--disable-canvas-aa',
            '--disable-2d-canvas-clip-utils',
            '--disable-gl-drawing-for-tests',
            '--mute-audio'
        ],
        // Usamos la ruta que ya sabemos que funciona en Render
        executablePath: '/opt/render/project/src/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome'
    }
});

client.on('qr', (qr) => {
    lastQR = qr;
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    lastQR = "CONECTADO";
    console.log('✅ Clon de Rodrigo ONLINE y estable');
});

client.on('message', async (msg) => {
    console.log(`📩 Recibido: ${msg.body}`);
    const body = msg.body.toLowerCase();

    if (body === '!ping') return msg.reply('¡Golazo! Estoy vivo.');

    if (body.startsWith('!clon')) {
        const query = msg.body.replace(/!clon/i, '').trim();
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();

            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ 
                    role: "system", 
                    content: "Sos Rodrigo Nahuel Narena, de Morón. Trabajás en rampa en Aerolíneas. Sos programador. Hablá como él (voseo, che, dale, golazo). Breve y humano." 
                }, { role: "user", content: query }]
            });

            await msg.reply(completion.choices[0].message.content);
        } catch (err) {
            console.error('Error Groq:', err.message);
        }
    }
});

client.initialize().catch(e => console.error('Error inicializando:', e));

// --- RUTAS ---
app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Conectado</h1>');
    if (!lastQR) return res.send('<h1>Iniciando...</h1>');
    res.send(`<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />`);
});

app.get('/', (req, res) => res.send('🚀 Clon Rodri Live'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));
