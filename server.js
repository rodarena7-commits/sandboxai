require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuración CORS mejorada para Vercel
app.use(cors({
    origin: [
        'https://sandboxai-c0ieoyd9x-rodarena7-commits-projects.vercel.app',
        'http://localhost:5173',
        'http://localhost:10000',
        'https://sandboxai.onrender.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let lastQR = "";
let sock;
let connectionState = {
    status: 'starting',
    error: null,
    lastQRAt: null,
    connectedAt: null
};

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// --- CARGA DE ADN (BASE DE DATOS PERSONAL) ---
let adnPersonal = "Información no cargada. Usar estilo genérico de Rodrigo.";
const adnPath = path.join(__dirname, 'mi_adn.txt');

if (fs.existsSync(adnPath)) {
    adnPersonal = fs.readFileSync(adnPath, 'utf8').substring(0, 6000);
    console.log(`🧠 ADN Personal cargado. Tamaño actual: ${adnPersonal.length} caracteres.`);
}

// ============ FUNCIÓN PRINCIPAL DE WHATSAPP ============
async function connectToWhatsApp() {
    console.log('🔄 Iniciando conexión con WhatsApp...');
    connectionState.status = 'connecting';
    
    const authFolder = 'auth_info_baileys';
    console.log(`📁 Usando carpeta de autenticación: ${authFolder}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();
    
    console.log(`📱 Versión de Baileys: ${version}`);

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'info' }),
        browser: ["Clon de Rodri", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) { 
            lastQR = qr;
            connectionState.lastQRAt = new Date().toISOString();
            connectionState.status = 'qr_ready';
            console.log('📱 QR generado!');
            qrcode.generate(qr, { small: true }); 
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            connectionState.status = 'disconnected';
            connectionState.error = `Código: ${statusCode}`;
            
            console.log(`⚠️ Conexión cerrada (Código: ${statusCode}). Reconectando: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('❌ Sesión cerrada permanentemente.');
                lastQR = "";
                connectionState.status = 'logged_out';
            }
        } else if (connection === 'open') {
            connectionState.status = 'connected';
            connectionState.connectedAt = new Date().toISOString();
            connectionState.error = null;
            lastQR = "CONECTADO";
            console.log('✅ ¡WHATSAPP CONECTADO!');
            console.log('🎉 Bot ID:', sock.user?.id);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        if (from.endsWith('@g.us')) return;

        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";

        if (!text) {
            console.log('⚠️ Recibido mensaje vacío');
            return;
        }

        const lowText = text.toLowerCase();
        if (lowText === '!ping') {
            await sock.sendMessage(from, { text: '🏓 ¡Golazo! El clon está online.' });
            return;
        }
        
        if (lowText === '!estado') {
            await sock.sendMessage(from, { text: `✅ Bot activo\nConectado desde: ${connectionState.connectedAt || 'desconocido'}\nADN: ${adnPersonal.length} caracteres` });
            return;
        }

        try {
            console.log(`🤖 Respondiendo a: ${from}`);
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
                        1. Sos Rodrigo. SIEMPRE aclará al final "[Clon de Rodri]".
                        2. Usá voseo, che, dale. Nada de formalismos.
                        3. Sé breve y directo. Como un chat real.
                        4. Respondé en español argentino coloquial.` 
                    },
                    { role: "user", content: text }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            let aiResponse = response.choices[0].message.content;
            if (!aiResponse.includes('Clon') && !aiResponse.includes('Rodri')) {
                aiResponse = `${aiResponse}\n\n*(Clon de Rodri)*`;
            }

            await sock.sendMessage(from, { text: aiResponse });

        } catch (err) {
            console.error('❌ Error Groq:', err.message);
            await sock.sendMessage(from, { text: 'Ups, error en mi cerebro 🤖. Decile a Rodri que me revise.' });
        }
    });
}

// ============ ENDPOINT PRINCIPAL PARA ANALIZAR (LO QUE NECESITA VERCEL) ============
app.post('/analizar', async (req, res) => {
    // Log para debugging
    console.log('📊 Recibida petición en /analizar');
    console.log('Body:', req.body);
    
    try {
        const { texto, pregunta, pdfContent, accion } = req.body;
        
        // Determinar qué analizar (prioridad: pregunta > accion > texto)
        let contentToAnalyze = texto || pdfContent;
        let accionEspecifica = pregunta || accion || 'analizar';
        
        if (!contentToAnalyze) {
            return res.status(400).json({ 
                error: 'Falta texto para analizar',
                mensaje: 'Enviá un JSON con { "texto": "lo que quieras analizar" }'
            });
        }
        
        console.log(`📝 Analizando: "${contentToAnalyze.substring(0, 100)}..."`);
        
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { 
                    role: "system", 
                    content: `Sos un asistente analítico argentino experto en análisis de textos.
                    
                    REGLAS:
                    - Usá voseo (che, dale, vos)
                    - Sé claro, directo y conciso
                    - Si es un resumen, hacé puntos principales
                    - Si es una pregunta específica, respondé directamente
                    - Si no especifica acción, solo analizá el texto
                    - Respondé en español argentino coloquial` 
                },
                { 
                    role: "user", 
                    content: accionEspecifica !== 'analizar' 
                        ? `${accionEspecifica}\n\nTexto a analizar: ${contentToAnalyze}`
                        : `Analizá el siguiente texto:\n\n${contentToAnalyze}`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });
        
        const analisis = response.choices[0].message.content;
        
        res.json({ 
            analisis,
            status: 'success',
            longitud: analisis.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error en /analizar:', error);
        res.status(500).json({ 
            error: 'Error al procesar el análisis',
            detalle: error.message,
            status: 'error'
        });
    }
});

// Endpoint GET para verificar que existe
app.get('/analizar', (req, res) => {
    res.json({
        mensaje: "✅ Endpoint /analizar activo",
        metodo: "POST",
        ejemplo: {
            texto: "Texto a analizar",
            pregunta: "Opcional: hacé un resumen del texto"
        },
        url_backend: "https://sandboxai.onrender.com",
        estado_whatsapp: connectionState.status
    });
});

// ============ ENDPOINTS DE WHATSAPP ============
app.get('/nuevo-qr', async (req, res) => {
    res.send(`
        <html>
        <head>
            <meta http-equiv="refresh" content="5; url=/qr">
            <style>
                body { font-family: sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
                .loader { border: 4px solid #f3f3f3; border-top: 4px solid #25D366; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .box { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: auto; }
            </style>
        </head>
        <body>
            <div class="box">
                <h1>🔄 Reiniciando conexión...</h1>
                <div class="loader"></div>
                <p>Eliminando sesión vieja y generando nuevo QR</p>
                <p><strong>⚠️ Escaneá el nuevo QR con WhatsApp</strong></p>
            </div>
        </body>
        </html>
    `);
    
    console.log('🔄 Forzando nuevo QR...');
    
    if (sock) {
        await sock.end();
        sock = null;
    }
    
    const authFolder = 'auth_info_baileys';
    if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
        console.log('🗑️ Sesión eliminada');
    }
    
    lastQR = "";
    connectionState.status = 'resetting';
    
    setTimeout(() => {
        connectToWhatsApp();
    }, 2000);
});

app.get('/estado', (req, res) => {
    res.json({
        whatsapp: {
            conectado: !!sock?.user,
            usuario: sock?.user?.id || null,
            estado: connectionState.status,
            conectado_desde: connectionState.connectedAt,
            error: connectionState.error
        },
        qr: {
            disponible: (lastQR && lastQR !== "CONECTADO"),
            generado: connectionState.lastQRAt
        },
        sistema: {
            adn_cargado: adnPersonal.length,
            groq_api: process.env.GROQ_API_KEY ? "✅ Configurada" : "❌ Faltante",
            uptime: process.uptime()
        }
    });
});

app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") {
        return res.send(`
            <html>
            <body style="text-align:center; padding:50px;">
                <div style="background:#d4edda; padding:20px; border-radius:10px;">
                    <h1>✅ ¡Clon Activo!</h1>
                    <p>WhatsApp conectado: ${sock?.user?.id || 'Conectado'}</p>
                    <a href="/nuevo-qr">🔴 Desconectar y generar nuevo QR</a>
                </div>
            </body>
            </html>
        `);
    }
    
    if (!lastQR) {
        return res.send(`
            <html>
            <head><meta http-equiv="refresh" content="5"></head>
            <body style="text-align:center; padding:50px;">
                <h1>⏳ Iniciando...</h1>
                <p>Si esto persiste, <a href="/nuevo-qr">hacé clic aquí</a></p>
            </body>
            </html>
        `);
    }
    
    res.send(`
        <html>
        <body style="text-align:center; padding:50px;">
            <h2>📱 Escaneá este QR</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>WhatsApp → Ajustes → Dispositivos vinculados</p>
            <a href="/nuevo-qr">❌ Generar nuevo QR</a>
        </body>
        </html>
    `);
});

app.get('/', (req, res) => {
    res.json({
        nombre: "Clon de Rodrigo - Bot de WhatsApp",
        estado: lastQR === "CONECTADO" ? "conectado" : "esperando",
        endpoints: {
            qr: "/qr",
            estado: "/estado",
            analizar: "/analizar (POST)",
            nuevo_qr: "/nuevo-qr"
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: sock?.user ? 'healthy' : 'starting',
        timestamp: new Date().toISOString()
    });
});

// ============ INICIO DEL SERVIDOR ============
connectToWhatsApp();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Endpoint /analizar disponible en https://sandboxai.onrender.com/analizar`);
});
