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

// --- ESTADO GLOBAL ---
let lastQR = "";

// --- CONFIGURACIÓN IA (GROQ) ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP OPTIMIZADO PARA MEMORIA ---
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "rodrigo-clon-v2" }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process', 
            '--no-zygote',
            '--disable-gpu',
            '--mute-audio'
        ],
        // Ruta verificada para Render
        executablePath: '/opt/render/project/src/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome'
    }
});

// --- GESTOR DE MENSAJES CENTRALIZADO ---
const handleIncomingMessage = async (msg) => {
    const text = msg.body.trim();
    const lowText = text.toLowerCase();

    // 1. Prueba de vida inmediata
    if (lowText === '!ping') {
        console.log('🤖 Prueba !ping detectada.');
        return msg.reply('¡Golazo! El bot está vivo y escuchando perfectamente.');
    }

    // 2. Lógica del Clon de Rodrigo
    if (lowText.startsWith('!clon')) {
        console.log(`🤖 Procesando consulta clon: "${text}"`);
        const query = text.replace(/!clon/i, '').trim() || "¿Qué hacés, Rodri?";

        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping(); // Simula que estás escribiendo

            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos Rodrigo Nahuel Narena (35 años, de Morón). 
                        Laburás en rampa en Aerolíneas Argentinas y sos programador Fullstack. 
                        Estilo: Argentino, directo, usás el "vos", "che", "dale", "golazo". 
                        No sos formal. Respondé como si le hablaras a un amigo en un chat rápido.` 
                    },
                    { role: "user", content: query }
                ]
            });

            const respuesta = completion.choices[0].message.content;
            await msg.reply(respuesta);
            console.log('📤 Respuesta enviada con éxito.');
        } catch (err) {
            console.error('❌ Error en Groq:', err.message);
            msg.reply('Che, se me tildó la IA un toque. Probá de nuevo en un ratito.');
        }
    }
};

// --- EVENTOS DEL CLIENTE ---
client.on('qr', (qr) => {
    lastQR = qr;
    qrcode.generate(qr, {small: true});
    console.log('👉 QR generado. Escanealo en /qr');
});

client.on('ready', () => {
    lastQR = "CONECTADO";
    console.log('✅ ¡WHATSAPP CONECTADO! El bot ya puede responder.');
});

// Evento para mensajes de OTROS
client.on('message', async (msg) => {
    console.log(`📩 Mensaje RECIBIDO de ${msg.from}: ${msg.body}`);
    await handleIncomingMessage(msg);
});

// Evento para mensajes TUYOS (Auto-mensaje o desde el celu vinculado)
client.on('message_create', async (msg) => {
    // Solo procesamos si empieza con los comandos para evitar bucles
    if (msg.fromMe && (msg.body.toLowerCase().startsWith('!clon') || msg.body.toLowerCase() === '!ping')) {
        console.log(`Self-message detectado: ${msg.body}`);
        await handleIncomingMessage(msg);
    }
});

client.on('auth_failure', () => console.error('❌ Fallo de autenticación. Cerrá sesión y re-escaneá.'));

// Inicialización
console.log('⏳ Iniciando sesión de WhatsApp...');
client.initialize().catch(e => console.error('❌ Error al inicializar:', e));

// --- RUTAS HTTP ---
app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") return res.send('<h1>✅ Conectado y estable</h1><p>Ya podés cerrar esto.</p>');
    if (!lastQR) return res.send('<h1>⏳ Iniciando servidor...</h1><p>Recargá en 10 segundos.</p>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Escaneá tu Clon de Rodrigo</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Vincular dispositivo > Escanear</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('🚀 Servidor Híbrido Rodri Live'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
