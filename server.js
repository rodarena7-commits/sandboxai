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

// Inicialización limpia
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

app.get('/', (req, res) => res.send('🚀 SandBox Core Online'));

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No se recibió archivo." });

    console.log(`📂 Analizando: ${file.originalname}`);

    // CAMBIO A GEMINI-PRO: Es el modelo con mayor disponibilidad global
    // Si este falla, el problema es 100% la API KEY o el Proyecto de Google
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Nota: gemini-pro a veces requiere solo texto. 
    // Si vas a enviar PDFs/Imágenes, intentemos con gemini-1.5-flash-latest de nuevo
    // pero con una configuración de seguridad mínima.
    
    const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const filePart = fileToGenerativePart(file.path, file.mimetype);
    const prompt = `Analiza este documento y responde: ${pregunta || "Resumen"}`;

    const result = await modelFlash.generateContent([prompt, filePart]);
    const response = await result.response;
    
    fs.unlinkSync(file.path);
    res.json({ respuesta: response.text() });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("❌ Error Crítico:", error.message);
    res.status(500).json({ error: "Error en la IA", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} listo.`));
