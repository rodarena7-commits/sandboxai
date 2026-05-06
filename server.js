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

// ============ CONFIGURACIÓN CORS (para Vercel) ============
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

// ============ ESTADO GLOBAL ============
let lastQR = "";
let sock;
let connectionState = {
    status: 'starting',
    error: null,
    lastQRAt: null,
    connectedAt: null
};

// ============ GROQ (IA) ============
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

// ============ CARGA DE MEMORIA (ADN) ============
// Primero valor por defecto
let adnPersonal = "Información no cargada. Usar estilo genérico de Rodrigo. Recordá que soy Rodrigo, uso voseo, soy argentino, me gusta el fútbol y la tecnología.";

const adnPath = path.join(__dirname, 'mi_adn.txt');

// Intentar cargar el archivo si existe (en Render o local)
try {
    if (fs.existsSync(adnPath)) {
        const raw = fs.readFileSync(adnPath, 'utf8');
        adnPersonal = raw.substring(0, 6000);
        console.log(`🧠 ADN Personal cargado desde archivo. Tamaño: ${adnPersonal.length} caracteres.`);
    } else {
        console.log(`⚠️ No se encontró ${adnPath}. Usando memoria por defecto.`);
        // Opcional: crear archivo por defecto
        const defaultContent = `Soy Rodrigo Nahuel Narena.
Información personal:
- Me llamo Rodrigo, pero podés decirme Rodri.
- Soy argentino, nacido en [tu ciudad].
- Uso voseo: "che", "dale", "vos".
- Me gusta el fútbol, hincha de [tu club].
- Programador, apasionado por la tecnología.
- [Agregá aquí más información que quieras que recuerde el clon]`;
        fs.writeFileSync(adnPath, defaultContent, 'utf8');
        adnPersonal = defaultContent;
        console.log(`📝 Creado archivo mi_adn.txt con contenido por defecto. Editálo para personalizar.`);
    }
} catch (err) {
    console.error('❌ Error al leer/escribir mi_adn.txt:', err.message);
}

// ============ FUNCIÓN DE WHATSAPP ============
async function connectToWhatsApp() {
    console.log('🔄 Iniciando conexión con WhatsApp...');
    connectionState.status = 'connecting';
    
    const authFolder = 'auth_info_baileys';
    console.log(`📁 Usando carpeta de autenticación: ${authFolder}`);
    
    try {
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
                console.log('📱 QR generado! Escaneá con WhatsApp.');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                connectionState.status = 'disconnected';
                connectionState.error = `Código: ${statusCode}`;
                console.log(`⚠️ Conexión cerrada (${statusCode}). Reconectando: ${shouldReconnect}`);
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 5000);
                } else {
                    console.log('❌ Sesión cerrada permanentemente. Borrar carpeta auth_info_baileys');
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
            if (from.endsWith('@g.us')) return; // ignorar grupos

            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.imageMessage?.caption || "";

            if (!text) return;

            const lowText = text.toLowerCase();
            if (lowText === '!ping') {
                await sock.sendMessage(from, { text: '🏓 ¡Golazo! El clon está online.' });
                return;
            }
            if (lowText === '!estado') {
                await sock.sendMessage(from, { text: `✅ Activo\nConectado desde: ${connectionState.connectedAt || 'desconocido'}\nMemoria: ${adnPersonal.length} caracteres` });
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
                            
                            MEMORIA (información sobre vos):
                            ${adnPersonal}
                            
                            INSTRUCCIONES:
                            1. Sos Rodrigo. Respondé en primera persona.
                            2. Usá voseo argentino (che, dale, vos).
                            3. Sé breve y directo, como un chat real.
                            4. SIEMPRE cerrá con "[Clon de Rodri]".` 
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
                await sock.sendMessage(from, { text: 'Ups, mi cerebro falló 🤖. Decile a Rodri que me revise.' });
            }
        });
    } catch (err) {
        console.error('❌ Error fatal en connectToWhatsApp:', err);
        setTimeout(connectToWhatsApp, 10000);
    }
}

// ============ ENDPOINTS ============

// 1. Para que la web de Vercel consulte la memoria (usa la misma variable adnPersonal)
app.post('/analizar', async (req, res) => {
    console.log('📊 [ANALIZAR] Body recibido:', req.body);
    try {
        const { pregunta, texto } = req.body;
        const consulta = pregunta || texto;
        if (!consulta || consulta.trim() === "") {
            return res.status(400).json({ error: 'Falta la pregunta', ejemplo: { pregunta: "¿Qué sabes de vos?" } });
        }
        
        console.log(`❓ Pregunta: "${consulta}"`);
        console.log(`📚 Memoria actual (${adnPersonal.length} caracteres): ${adnPersonal.substring(0, 100)}...`);
        
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `Sos el CLON DIGITAL de Rodrigo Nahuel Narena.
                    
                    TU MEMORIA COMPLETA:
                    ${adnPersonal}
                    
                    REGLAS:
                    1. Respondé basándote ESTRICTAMENTE en la memoria. Si no hay información, decí "No tengo eso en mi memoria."
                    2. Usá voseo argentino (che, dale, vos).
                    3. Respondé de manera conversacional, breve.
                    4. Finalizá siempre con "[Clon de Rodri]".`
                },
                { role: "user", content: consulta }
            ],
            temperature: 0.7,
            max_tokens: 600
        });
        
        let respuesta = response.choices[0].message.content;
        if (!respuesta.includes('Clon')) {
            respuesta = `${respuesta}\n\n*(Clon de Rodri)*`;
        }
        
        res.json({ analisis: respuesta, status: 'success' });
    } catch (error) {
        console.error('❌ Error en /analizar:', error);
        res.status(500).json({ error: 'Error interno', detalle: error.message });
    }
});

// 2. Ver qué memoria está usando el bot (diagnóstico)
app.get('/ver-memoria', (req, res) => {
    res.json({
        memoria_cargada: adnPersonal !== "Información no cargada. Usar estilo genérico de Rodrigo. Recordá que soy Rodrigo, uso voseo, soy argentino, me gusta el fútbol y la tecnología.",
        tamaño: adnPersonal.length,
        preview: adnPersonal.substring(0, 400) + (adnPersonal.length > 400 ? '...' : '')
    });
});

// 3. Actualizar memoria en caliente (útil para pruebas)
app.post('/actualizar-memoria', express.json(), (req, res) => {
    const { nuevaMemoria } = req.body;
    if (!nuevaMemoria) {
        return res.status(400).json({ error: 'Falta nuevaMemoria' });
    }
    adnPersonal = nuevaMemoria.substring(0, 6000);
    // Opcional: también guardar en archivo
    try {
        fs.writeFileSync(adnPath, adnPersonal, 'utf8');
    } catch(e) { console.error('No se pudo guardar archivo:', e.message); }
    res.json({ status: 'ok', nuevo_tamaño: adnPersonal.length });
});

// 4. QR y control de WhatsApp
app.get('/nuevo-qr', async (req, res) => {
    res.send(`
        <html><body style="text-align:center;padding:50px;">
        <h1>🔄 Reiniciando conexión...</h1>
        <p>Se eliminará la sesión y se generará un nuevo QR en unos segundos.</p>
        <script>setTimeout(()=>{location.href='/qr'}, 5000);</script>
        </body></html>
    `);
    if (sock) await sock.end();
    const authFolder = 'auth_info_baileys';
    if (fs.existsSync(authFolder)) fs.rmSync(authFolder, { recursive: true, force: true });
    lastQR = "";
    setTimeout(() => connectToWhatsApp(), 2000);
});

app.get('/estado', (req, res) => {
    res.json({
        whatsapp: {
            conectado: !!sock?.user,
            usuario: sock?.user?.id || null,
            estado: connectionState.status,
            conectado_desde: connectionState.connectedAt
        },
        memoria: { tamaño: adnPersonal.length },
        groq: !!process.env.GROQ_API_KEY
    });
});

app.get('/qr', (req, res) => {
    if (lastQR === "CONECTADO") {
        return res.send(`<html><body style="text-align:center"><h1>✅ Ya conectado</h1><a href="/nuevo-qr">Desconectar</a></body></html>`);
    }
    if (!lastQR) {
        return res.send(`<html><body style="text-align:center"><h1>⏳ Generando QR...</h1><meta http-equiv="refresh" content="3"></body></html>`);
    }
    res.send(`
        <html><body style="text-align:center">
        <h2>📱 Escaneá este QR</h2>
        <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
        <p>WhatsApp → Ajustes → Dispositivos vinculados</p>
        <a href="/nuevo-qr">Generar nuevo QR</a>
        </body></html>
    `);
});

app.get('/', (req, res) => {
    res.json({
        nombre: "Clon de Rodrigo - Bot de WhatsApp + API",
        estado: lastQR === "CONECTADO" ? "conectado" : "esperando",
        endpoints: ["/qr", "/estado", "/analizar (POST)", "/ver-memoria", "/actualizar-memoria (POST)"]
    });
});

app.get('/health', (req, res) => {
    res.json({ status: sock?.user ? 'healthy' : 'starting', uptime: process.uptime() });
});

// ============ INICIO DEL SERVIDOR ============
connectToWhatsApp();

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Endpoint /analizar listo para recibir consultas desde Vercel`);
});
