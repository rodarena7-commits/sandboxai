require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Multer (Carpeta temporal para archivos)
const upload = multer({ dest: 'uploads/' });

// Inicialización de Google AI con la clave de tu usuario nuevo
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Función para convertir archivos a Base64 para Gemini
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

app.get('/', (req, res) => {
  res.send('🚀 SandBox AI Gemini Core está Activo.');
});

app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se recibió ningún archivo." });
    }

    console.log(`📂 Procesando: ${file.originalname}`);

    // CONFIGURACIÓN DEL MODELO - Asegúrate que el nombre sea exacto
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Convertimos el archivo subido
    const filePart = fileToGenerativePart(file.path, file.mimetype);

    const prompt = `
      Eres SandBox AI, un asistente experto. 
      Analiza el contenido de este archivo y responde a la siguiente consulta:
      
      PREGUNTA: ${pregunta || "Haz un resumen detallado del contenido."}
    `;

    // Llamada a la IA
    const result = await model.generateContent([prompt, filePart]);
    const response = await result.response;
    const text = response.text();

    // Limpieza de archivos temporales
    fs.unlinkSync(file.path);

    res.json({ respuesta: text });

  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("❌ Error en el Servidor:", error);
    res.status(500).json({ 
      error: "Error procesando el archivo", 
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
