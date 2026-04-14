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
      
      // SOLUCIÓN AL ERROR 413: Recortamos el texto para no exceder los límites de la API gratuita
      // 40,000 caracteres son aproximadamente entre 10,000 y 15,000 tokens, lo cual es seguro para Groq Free.
      contenidoExtraido = data.text.substring(0, 40000);
      console.log(`📏 Texto extraído: ${data.text.length} caracteres. Recortado a: ${contenidoExtraido.length}`);
    } else {
      contenidoExtraido = fs.readFileSync(file.path, 'utf8').substring(0, 40000);
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", 
      messages: [
        { 
          role: "system", 
          content: "Eres SandBox AI Pro. Responde basándote en el texto proporcionado. Si el texto parece cortado, es debido a límites de tamaño, responde con lo mejor que tengas disponible." 
        },
        { 
          role: "user", 
          content: `CONTENIDO DEL DOCUMENTO (Fragmento):\n${contenidoExtraido}\n\nPREGUNTA: ${pregunta || "Resumen"}` 
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
