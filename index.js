require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

const QR_FILE = path.join(__dirname, 'qr_permanente.txt');

let lastQR = "";
let sock;
let isConnected = false;

// Cargar QR guardado si existe
function cargarQRGuardado() {
    if (fs.existsSync(QR_FILE)) {
        return fs.readFileSync(QR_FILE, 'utf8').trim();
    }
    return null;
}

// Guardar QR en archivo
function guardarQR(qr) {
    fs.writeFileSync(QR_FILE, qr, 'utf8');
}

lastQR = cargarQRGuardado() || "";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Roberto", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            lastQR = qr;
            guardarQR(qr);
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Conexión cerrada (Código: ${statusCode}). Reconectando: ${shouldReconnect}`);
            isConnected = false;
            if (shouldReconnect) connectToWhatsApp();
            else {
                lastQR = "";
                if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log('✅ WHATSAPP CONECTADO!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption || "";

        if (!text) return;

        console.log(`📩 Mensaje de ${from}: "${text}"`);

        try {
            await sock.sendPresenceUpdate('composing', from);
            await sock.sendMessage(from, {
                text: `Hola 👋\n\nSoy Roberto.\n\nMensaje recibido: "${text}"\n\n¡Funciona! ✅`
            });
        } catch (err) {
            console.error('❌ Error:', err.message);
        }
    });
}

connectToWhatsApp();

// --- ENDPOINTS ---

app.get('/qr', (req, res) => {
    if (isConnected) return res.send('<h1>✅ Roberto está conectado</h1>');
    if (!lastQR) return res.send('<h1>⏳ Iniciando...</h1><p>Recarga en 10 segundos.</p>');
    res.send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
            <h2>Vincular Roberto</h2>
            <p style="color:#999; font-size:0.9rem;">QR permanente - No cambia</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(lastQR)}&size=300x300" />
            <p>Escanea desde WhatsApp > Dispositivos Vinculados</p>
        </div>
    `);
});

app.get('/', (req, res) => res.send('🎵 Roberto - Bot básico'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} activo`));
