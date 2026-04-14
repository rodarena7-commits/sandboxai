require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

const app = express();

// Middleware de CORS abierto para Vercel
app.use(cors());
app.use(express.json());

// Configuración de Multer para archivos temporales
const upload = multer({ dest: 'uploads/' });

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Función para convertir archivos a formato Gemini
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

// Ruta base para chequear que Render está vivo
app.get('/', (req, res) => {
  res.send('🚀 SandBox AI Universal Core está en línea.');
});

// Ruta principal de análisis
app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se recibió archivo." });
    }

    console.log(`📂 Procesando archivo: ${file.originalname}`);

    // Usamos el alias -latest que suele resolver problemas de 404
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const filePart = fileToGenerativePart(file.path, file.mimetype);
    const prompt = `Actúa como SandBox AI. Analiza este contenido y responde: ${pregunta || "Haz un resumen"}`;

    const result = await model.generateContent([prompt, filePart]);
    const response = await result.response;
    const text = response.text();

    // Borramos el archivo para no llenar el disco de Render
    fs.unlinkSync(file.path);

    res.json({ respuesta: text });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("❌ Error en SandBox Core:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 SandBox AI listo en puerto ${PORT}`);
});
