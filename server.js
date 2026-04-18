require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// --- VARIABLES GLOBALES ---
let lastQR = ""; 

// --- CONFIGURACIÓN IA (GROQ) ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP OPTIMIZADO PARA RENDER ---
const findChromePath = () => {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    const paths = [
        '/usr/bin/google-chrome-stable',
        // Ruta detectada en tu último log de Render
        '/opt/render/project/src/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome',
        '/opt/render/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Chrome encontrado en: ${p}`);
            return p;
        }
    }
    return undefined;
};

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "rodrigo-clon-session"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-default-apps',
            '--mute-audio'
        ],
        executablePath: findChromePath()
    }
});

client.on('qr', (qr) => {
    lastQR = qr; 
    console.log('--- NUEVO CÓDIGO QR GENERADO ---');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    lastQR = "CONECTADO"; 
    console.log('✅ ¡WhatsApp Conectado! El clon de Rodri está escuchando...');
});

// Función centralizada para procesar el clon
const procesarClon = async (msg) => {
    const body = msg.body.trim().toLowerCase();
    
    // Comando simple de testeo
    if (body === '!ping') {
        console.log('Test !ping detectado');
        return msg.reply('¡Golazo! Estoy vivo y conectado.');
    }

    if (body.startsWith('!clon')) {
        console.log(`🤖 Procesando pedido de clon para: "${msg.body}"`);
        const userQuery = msg.body.replace(/!clon/i, '').trim();
        
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping(); 

            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos Rodrigo Nahuel Narena, de Morón. Trabajás en rampa en Aerolíneas Argentinas. 
                        Sos programador Fullstack en formación. Estilo: Argentino de barrio, usás el voseo (vos, venís, hacés).
                        Muletillas: "¡Golazo!", "De una", "Posta", "Che", "Dale". 
                        Respondé breve, como un mensaje de texto real entre amigos. Nada de formalismos.` 
                    },
                    { role: "user", content: userQuery }
                ]
            });
            
            const aiText = response.choices[0].message.content;
            await msg.reply(aiText);
            console.log('📤 Respuesta del clon enviada con éxito.');

        } catch (err) {
            console.error('❌ Error en el motor de IA:', err.message);
            msg.reply('Che, se me tildó el cerebro. Bancame un toque y volvé a probar.');
        }
    }
};

// Escuchar mensajes nuevos de otros
client.on('message', async (msg) => {
    console.log(`📩 Mensaje de ${msg.from}: ${msg.body}`);
    await procesarClon(msg);
});

// Escuchar mensajes creados (incluyendo los tuyos)
client.on('message_create', async (msg) => {
    const body = msg.body.toLowerCase();
    // Permitimos que procese si viene de vos y es un comando conocido
    if (msg.fromMe && (body === '!ping' || body.startsWith('!clon'))) {
        console.log(`Self-message procesado: ${msg.body}`);
        await procesarClon(msg);
    }
});

client.initialize().catch(err => {
    console.error('❌ Error fatal iniciando WhatsApp:', err.message);
});

// --- RUTAS DEL SERVIDOR ---

app.get('/qr', (req, res) => {
    if (!lastQR) {
        res.send('<h1>Iniciando...</h1><script>setTimeout(()=>location.reload(), 5000)</script>');
    } else if (lastQR === "CONECTADO") {
        res.send('<h1>✅ ¡Conectado!</h1><p>Tu clon ya está activo.</p>');
    } else {
        res.send(`
            <html>
                <body style="background: #111; color: white; text-align: center; padding-top: 50px; font-family: sans-serif;">
                    <h1>Escaneá tu Clon</h1>
                    <div style="background: white; display: inline-block; padding: 20px; border-radius: 10px;">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
                    </div>
                    <script>setTimeout(() => location.reload(), 20000)</script>
                </body>
            </html>
        `);
    }
});

app.post('/analizar', upload.single('archivo'), async (req, res) => {
    try {
        const { pregunta } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No hay archivo" });
        let text = "";
        if (file.mimetype === 'application/pdf') {
            const data = await pdf(fs.readFileSync(file.path));
            text = data.text.substring(0, 15000);
        } else {
            text = fs.readFileSync(file.path, 'utf8').substring(0, 15000);
        }
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: `Doc: ${text}\nPregunta: ${pregunta}` }]
        });
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.json({ respuesta: response.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send('🚀 SandBox AI Clon Rodri Online'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
