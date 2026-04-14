require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const pdf = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Configuración de Grok (xAI) usando el cliente compatible de OpenAI
const client = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

app.get('/', (req, res) => {
  res.send('🚀 SandBox AI: Grok Engine Online');
});

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No se subió ningún archivo." });

    console.log(`📂 Procesando con Grok: ${file.originalname}`);

    let contenidoExtraido = "";

    // Extracción de texto del PDF
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdf(dataBuffer);
      contenidoExtraido = data.text;
    } else {
      contenidoExtraido = fs.readFileSync(file.path, 'utf8');
    }

  // REEMPLAZA ESTA PARTE EN TU SERVER.JS:
const completion = await client.chat.completions.create({
  model: "grok-2-1212", // Este es el nombre exacto de la versión estable
  messages: [
    { 
      role: "system", 
      content: "Eres SandBox AI, experto en análisis. Responde basándote en el texto." 
    },
    { 
      role: "user", 
      content: `Documento:\n${contenidoExtraido}\n\nPregunta: ${pregunta || "Haz un resumen"}` 
    },
  ],
});

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    res.json({ respuesta: completion.choices[0].message.content });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("❌ Error en Grok Core:", error.message);
    res.status(500).json({ error: "Error en el motor Grok", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Grok activo en puerto ${PORT}`));
