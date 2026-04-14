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

// Configuración de Groq
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

app.get('/', (req, res) => {
  res.send('🚀 SandBox AI: Groq Turbo Engine Online (Llama 3.3)');
});

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Archivo no recibido." });

    console.log(`📂 Procesando con Groq: ${file.originalname}`);

    let contenidoExtraido = "";

    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdf(dataBuffer);
      
      // AJUSTE DE SEGURIDAD PARA TPM:
      // Bajamos a 30,000 caracteres para asegurar que no exceda los 12,000 tokens por minuto
      // que permite la capa gratuita de Groq para el modelo 70B.
      contenidoExtraido = data.text.substring(0, 30000);
      console.log(`📏 Texto extraído: ${data.text.length} caracteres. Recortado a: ${contenidoExtraido.length}`);
    } else {
      contenidoExtraido = fs.readFileSync(file.path, 'utf8').substring(0, 30000);
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", 
      messages: [
        { 
          role: "system", 
          content: "Eres SandBox AI Pro. Responde de forma concisa basándote en el texto proporcionado para ahorrar tokens. Si el texto está cortado, analiza lo que tienes disponible." 
        },
        { 
          role: "user", 
          content: `DOC:\n${contenidoExtraido}\n\nPREGUNTA: ${pregunta || "Resumen"}` 
        },
      ],
      temperature: 0.5,
    });

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ respuesta: completion.choices[0].message.content });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("❌ Error en Groq Core:", error.message);
    res.status(500).json({ error: "Error en el motor Groq", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Motor Groq listo en puerto ${PORT}`));
