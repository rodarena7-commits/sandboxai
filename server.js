require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Inicializamos el SDK
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

app.get('/', (req, res) => res.send('🚀 SandBox Core V1.5 Online'));

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Archivo no recibido." });

    console.log(`📂 Procesando: ${file.originalname}`);

    // SOLUCIÓN DEFINITIVA AL 404:
    // Quitamos la especificación manual de apiVersion para que el SDK 0.12.0 
    // use la ruta correcta automáticamente para 'gemini-1.5-flash'.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

    const filePart = fileToGenerativePart(file.path, file.mimetype);
    const prompt = `Analiza este documento y responde: ${pregunta || "Resumen"}`;

    const result = await model.generateContent([prompt, filePart]);
    const response = await result.response;
    const text = response.text();
    
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ respuesta: text });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("❌ Error en SandBox Core:", error.message);
    res.status(500).json({ error: "Error interno en la IA", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} listo.`));
