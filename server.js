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

// --- MOTOR WHATSAPP OPTIMIZADO PARA MEMORIA ---
const findChromePath = () => {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    const paths = [
        '/usr/bin/google-chrome-stable',
        '/opt/render/project/src/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome',
        '/opt/render/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return undefined;
};

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
    console.log('✅ ¡WhatsApp Conectado! Tu Gemelo Digital está activo.');
});

// --- LÓGICA DEL CLON (RODRIGO NAHUEL NARENA) ---
client.on('message', async (msg) => {
    // El bot responderá a cualquier mensaje que empiece con !clon
    // Opcionalmente podemos hacer que responda a TODO en chats privados mas adelante
    if (msg.body.startsWith('!clon')) {
        const userQuery = msg.body.replace('!clon', '').trim();
        
        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `Sos Rodrigo Nahuel Narena, tenés 35 años y vivís en Morón. 
                        Trabajás en el sector de rampa en Aerolíneas Argentinas, pero tu pasión es la programación (sos Fullstack developer en formación).
                        
                        ESTILO DE HABLA:
                        - Hablás como un pibe de barrio, buena onda pero respetuoso.
                        - Usás el "voseo" (querés, hacés, venís).
                        - Muletillas: "¡Dale!", "¡Golazo!", "De una", "Che", "Posta".
                        - Sos motivador y apasionado por la tecnología.
                        - No sos un asistente formal. Sos Rodri respondiendo a un amigo o colega.
                        - Si te preguntan por la rampa, mencioná algo de los aviones o el laburo físico.
                        - Si te preguntan por código, hablá como alguien que está aprendiendo y metiéndole garra.
                        
                        IMPORTANTE: Respondé siempre de forma humana y breve, como en un chat de WhatsApp.` 
                    },
                    { role: "user", content: userQuery }
                ]
            });
            
            // Enviamos la respuesta simulando que Rodri está escribiendo
            const chat = await msg.getChat();
            await chat.sendStateTyping(); 
            
            setTimeout(() => {
                msg.reply(response.choices[0].message.content);
            }, 1000);

        } catch (err) {
            console.error('Error en el clon:', err.message);
        }
    }
});

client.initialize().catch(err => {
    console.error('❌ Error fatal iniciando WhatsApp:', err.message);
});

// --- RUTAS DEL SERVIDOR ---

app.get('/qr', (req, res) => {
    if (!lastQR) {
        res.send('<h1>Esperando el QR...</h1><script>setTimeout(()=>location.reload(), 5000)</script>');
    } else if (lastQR === "CONECTADO") {
        res.send('<h1>✅ ¡WhatsApp ya está vinculado!</h1><p>Tu clon de Rodrigo está activo en este número.</p>');
    } else {
        res.send(`
            <html>
                <body style="background: #111; color: white; text-align: center; padding-top: 50px; font-family: sans-serif;">
                    <h1>Escaneá tu Clon</h1>
                    <div style="background: white; display: inline-block; padding: 20px; border-radius: 10px;">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
                    </div>
                    <p style="margin-top: 20px;">Vínculo exitoso. Probá enviando un mensaje con !clon</p>
                </body>
            </html>
        `);
    }
});

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Archivo no recibido." });

    let contenidoExtraido = "";
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdf(dataBuffer);
      contenidoExtraido = data.text.substring(0, 20000);
    } else {
      contenidoExtraido = fs.readFileSync(file.path, 'utf8').substring(0, 20000);
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Analizador SandBox AI Pro." },
        { role: "user", content: `DOCUMENTO:\n${contenidoExtraido}\n\nPREGUNTA: ${pregunta}` }
      ]
    });

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ respuesta: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: "Error", details: error.message });
  }
});

app.get('/', (req, res) => res.send('🚀 SandBox AI Híbrido: Clon de Rodri Activo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} abierto`));
