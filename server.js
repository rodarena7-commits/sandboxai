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

// --- CONFIGURACIÓN IA (GROQ) ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP ---
// Eliminamos la ruta hardcodeada para que Puppeteer busque el navegador instalado
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        // Si existe la variable de entorno la usa, si no, deja que puppeteer decida
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
    }
});

client.on('qr', (qr) => {
    console.log('--- NUEVO CÓDIGO QR DETECTADO ---');
    qrcode.generate(qr, {small: true});
    console.log('👉 Escaneá este código en WhatsApp > Dispositivos vinculados');
});

client.on('ready', () => {
    console.log('✅ ¡WhatsApp Conectado y listo!');
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

// Lógica de respuesta (Modo Clon)
client.on('message', async (msg) => {
    if (msg.body.startsWith('!clon')) {
        const userQuery = msg.body.replace('!clon', '').trim();
        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                      role: "system", 
                      content: "Sos Rodrigo Nahuel Narena. Respondé como él, usá expresiones como '¡Golazo!' o '¡Dale!'. Trabajás en rampa en Aerolíneas y sos programador." 
                    },
                    { role: "user", content: userQuery }
                ]
            });
            msg.reply(response.choices[0].message.content);
        } catch (err) {
            console.error('Error en el clon:', err.message);
        }
    }
});

// Inicializar el cliente de WhatsApp
console.log('⏳ Iniciando motor de WhatsApp...');
client.initialize().catch(err => {
    console.error('❌ Fallo crítico al iniciar WhatsApp:', err.message);
    console.log('💡 Tip: Revisa que el Build Command sea: npm install && npx puppeteer browsers install chrome');
});

// --- RUTAS API ---
app.get('/', (req, res) => {
  res.send('🚀 Servidor Híbrido: PDF + WhatsApp funcionando');
});

// Ruta para analizar PDFs (RAG Lite)
app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Archivo no recibido." });

    let contenidoExtraido = "";
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdf(dataBuffer);
      contenidoExtraido = data.text.substring(0, 30000);
    } else {
      contenidoExtraido = fs.readFileSync(file.path, 'utf8').substring(0, 30000);
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Eres SandBox AI Pro. Responde basándote en el documento." },
        { role: "user", content: `DOC:\n${contenidoExtraido}\n\nPREGUNTA: ${pregunta}` }
      ]
    });

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ respuesta: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: "Error en el análisis", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});
