require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

// --- ESTADO Y CACHE ---
let lastQR = "";

// --- CONFIGURACIÓN IA (GROQ) ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP CON OPTIMIZACIÓN DE RECURSOS PRO ---
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "rodrigo-pro-session" }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', // Crucial para no triplicar el uso de RAM
            '--no-zygote',
            '--disable-gpu',
            '--mute-audio',
            '--disable-extensions',
            '--js-flags="--max-old-space-size=256"' // Limitamos el heap de Node/V8
        ],
        // Ruta absoluta instalada en Render
        executablePath: '/opt/render/project/src/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome'
    }
});

// --- LÓGICA DE RESPUESTA ---
const responderComoRodri = async (msg) => {
    const text = msg.body.trim();
    const lowText = text.toLowerCase();

    // Comandos rápidos
    if (lowText === '!ping') return msg.reply('¡Golazo! El clon de Rodri está online en modo Pro.');
    
    if (lowText.startsWith('!clon')) {
        const query = text.replace(/!clon/i, '').trim() || "¿Cómo va todo?";
        console.log(`🤖 Generando respuesta para: ${query}`);

        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();

            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos Rodrigo Nahuel Narena (35 años, de Morón). 
                        Trabajás en rampa en Aerolíneas Argentinas y sos desarrollador web. 
                        Estilo: Argentino, directo, buena onda. Usás "vos", "che", "dale", "golazo". 
                        Respondé breve y natural, como un mensaje de WhatsApp real.` 
                    },
                    { role: "user", content: query }
                ]
            });

            await msg.reply(response.choices[0].message.content);
        } catch (err) {
            console.error('❌ Error en Groq:', err.message);
            msg.reply('Se me tildó un toque el cerebro, che. Bancame y probá de nuevo.');
        }
    }
};

// --- EVENTOS DEL CLIENTE ---
client.on('qr', (qr) => {
    lastQR = qr;
    qrcode.generate(qr, {small: true});
    console.log('👉 QR generado. Escanealo en la URL /qr');
});

client.on('ready', () => {
    lastQR = "CONECTADO";
    console.log('✅ ¡WHATSAPP CONECTADO Y ESTABLE!');
});

client.on('message', responderComoRodri);
client.on('message_create', async (msg) => {
    if (msg.fromMe && (msg.body.toLowerCase().startsWith('!clon') || msg.body.toLowerCase() === '!ping')) {
        await responderComoRodri(msg);
    }
});

// Inicialización
console.log('⏳ Arrancando motor de WhatsApp...');
client.initialize().catch(err => console.error('Fallo al iniciar:', err));

// --- RUTAS DEL SERVIDOR ---
app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Sesión Vinculada</h1><p>Tu clon está activo.</p>');
    if (!lastQR) return res.send('<h1>Iniciando servidor...</h1>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Clon de Rodrigo</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escaneá desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('🚀 SandBox AI: Motor Híbrido Activo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
