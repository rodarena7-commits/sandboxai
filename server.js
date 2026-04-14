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

// Configuración de DeepSeek usando el cliente de OpenAI
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY, // Asegúrate de cambiar el nombre en Render
});

// Ruta de salud
app.get('/', (req, res) => {
  res.send('🚀 SandBox AI: DeepSeek Engine Online');
});

// Ruta principal de análisis
app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se subió ningún archivo." });
    }

    console.log(`📂 Procesando con DeepSeek: ${file.originalname}`);

    let contenidoExtraido = "";

    // 1. Extraer texto según el tipo de archivo
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdf(dataBuffer);
      contenidoExtraido = data.text;
    } else {
      // Para archivos de texto simple (.txt, .js, etc)
      contenidoExtraido = fs.readFileSync(file.path, 'utf8');
    }

    // 2. Llamada a DeepSeek Chat
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { 
          role: "system", 
          content: "Eres SandBox AI Pro. Analiza el siguiente contenido y responde a la pregunta del usuario basándote en la información proporcionada." 
        },
        { 
          role: "user", 
          content: `CONTENIDO DEL DOCUMENTO:\n${contenidoExtraido}\n\nPREGUNTA: ${pregunta || "Haz un resumen"}` 
        },
      ],
      stream: false,
    });

    // 3. Limpieza de archivos temporales
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    res.json({ respuesta: completion.choices[0].message.content });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("❌ Error en DeepSeek Core:", error.message);
    res.status(500).json({ 
      error: "Error procesando con DeepSeek", 
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Motor DeepSeek activo en puerto ${PORT}`);
});
