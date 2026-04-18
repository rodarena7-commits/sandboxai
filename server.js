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

// --- CONFIGURACIÓN IA (GROQ) ---
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- MOTOR WHATSAPP ---
// Esta función busca el ejecutable de Chrome en las rutas de Render
const getExecutablePath = () => {
    const renderPath = '/opt/render/project/src/.cache/puppeteer/chrome/linux-131.0.6778.85/chrome-linux64/chrome';
    if (fs.existsSync(renderPath)) return renderPath;
    return '/usr/bin/google-chrome-stable'; // Fallback
};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        executablePath: getExecutablePath()
    }
});

// Eventos de WhatsApp
client.on('qr', (qr) => {
    console.log('--- NUEVO CÓDIGO QR ---');
    qrcode.generate(qr, {small: true});
    console.log('👉 Escaneá este código para activar el Clon de Rodrigo');
});

client.on('ready', () => {
    console.log('✅ ¡WhatsApp Conectado! Tu clon está en línea.');
});

// Lógica de respuesta del "Gemelo Digital"
client.on('message', async (msg) => {
    // Solo responde si el mensaje no es de un grupo o si mencionan !clon
    if (msg.body.startsWith('!clon')) {
        const userQuery = msg.body.replace('!clon', '').trim();
        
        try {
            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos Rodrigo Nahuel Narena. 35 años, de Morón. 
                        Trabajás en rampa en Aerolíneas Argentinas. Sos programador autodidacta.
                        Tu estilo: Argentino, directo, usa 'vos', 'dale', 'golazo'. 
                        No sos formal. Respondé como si le hablaras a un amigo.` 
                    },
                    { role: "user", content: userQuery }
                ]
            });
            
            msg.reply(completion.choices[0].message.content);
        } catch (err) {
            console.error('Error en el clon:', err.message);
        }
    }
});

client.initialize().catch(err => console.error('Error inicializando WhatsApp:', err));

// --- RUTAS DEL SERVIDOR ---
app.get('/', (req, res) => {
    res.send('🚀 Servidor Híbrido Activo: PDF + WhatsApp Clone');
});

// Ruta para el analizador de documentos (Mantenemos lo anterior)
app.post('/analizar', upload.single('archivo'), async (req, res) => {
    try {
        const { pregunta } = req.body;
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No hay archivo" });

        let text = "";
        if (file.mimetype === 'application/pdf') {
            const data = await pdf(fs.readFileSync(file.path));
            text = data.text.substring(0, 30000);
        } else {
            text = fs.readFileSync(file.path, 'utf8').substring(0, 30000);
        }

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Analizador de documentos SandBox AI." },
                { role: "user", content: `Doc: ${text}\nPregunta: ${pregunta}` }
            ]
        });

        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.json({ respuesta: response.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} abierto`));
