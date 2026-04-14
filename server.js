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

// FUERZA LA API A v1 PARA EVITAR EL ERROR 404 DE LA BETA
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

app.get('/', (req, res) => res.send('🚀 SandBox Core V1 Online'));

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Archivo no recibido." });

    console.log(`📂 Procesando: ${file.originalname}`);

    // ESPECIFICAMOS LA VERSIÓN v1 EN EL MÉTODO
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash" },
      { apiVersion: 'v1' } // <--- ESTO ES LO QUE ARREGLA EL 404
    );

    const filePart = fileToGenerativePart(file.path, file.mimetype);
    const prompt = `Actúa como SandBox AI. Analiza este archivo y responde a: ${pregunta || "Haz un resumen"}`;

    const result = await model.generateContent([prompt, filePart]);
    const response = await result.response;
    
    fs.unlinkSync(file.path);
    res.json({ respuesta: response.text() });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: "Error en la IA", details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT} listo.`));
