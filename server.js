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
// Usamos el cliente de OpenAI apuntando a los servidores de Groq
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

app.get('/', (req, res) => {
  res.send('🚀 SandBox AI: Groq Turbo Engine Online (Llama 3.1)');
});

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Archivo no recibido." });

    console.log(`📂 Procesando con Groq: ${file.originalname}`);

    let contenidoExtraido = "";

    // Leemos el PDF localmente
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdf(dataBuffer);
      contenidoExtraido = data.text;
    } else {
      contenidoExtraido = fs.readFileSync(file.path, 'utf8');
    }

    // Llamada a Groq usando Llama 3.1 70B
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages: [
        { 
          role: "system", 
          content: "Eres SandBox AI Pro, un asistente experto en análisis de documentos técnicos. Responde de forma clara y precisa basándote en el texto proporcionado." 
        },
        { 
          role: "user", 
          content: `CONTENIDO DEL DOCUMENTO:\n${contenidoExtraido}\n\nPREGUNTA DEL USUARIO: ${pregunta || "Haz un resumen estructurado"}` 
        },
      ],
      temperature: 0.5,
    });

    // Limpiar archivo temporal
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    res.json({ respuesta: completion.choices[0].message.content });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("❌ Error en Groq Core:", error.message);
    
    res.status(500).json({ 
      error: "Error en el motor Groq", 
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Motor Groq listo en puerto ${PORT}`);
});
