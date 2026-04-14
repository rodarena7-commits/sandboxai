require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

const app = express();

// Configuración de Middlewares
app.use(cors());
app.use(express.json());

// Configuración de Multer para aceptar CUALQUIER tipo de archivo
const upload = multer({ dest: 'uploads/' });

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Función auxiliar para convertir el archivo en un formato que Gemini entienda (Base64)
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

// --- RUTA PRINCIPAL ---
app.get('/', (req, res) => {
  res.send('🚀 SandBox AI Universal Backend está operativo. Envía cualquier archivo por POST /analizar');
});

// --- RUTA DE ANÁLISIS UNIVERSAL ---
app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se recibió ningún archivo." });
    }

    console.log(`📂 Procesando archivo: ${file.originalname} (${file.mimetype})`);

    // 1. Preparamos el modelo
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 2. Convertimos el archivo al formato de Gemini
    const imagePart = fileToGenerativePart(file.path, file.mimetype);

    // 3. Creamos el Prompt con contexto multimodal
    const prompt = `
      Actúa como SandBox AI. Eres un analista experto multimodal.
      Si el archivo es una imagen, descríbela o responde sobre ella.
      Si es un audio, analiza lo que se escucha.
      Si es un documento (PDF/TXT/etc), analiza su contenido.
      
      PREGUNTA DEL USUARIO: ${pregunta || "Haz un resumen completo de este material."}
    `;

    // 4. Enviamos TODO a Gemini (Texto + Archivo)
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // 5. Limpieza: Borramos el archivo del servidor de Render después de usarlo
    fs.unlinkSync(file.path);

    res.json({ 
      respuesta: text,
      metadata: {
        nombre: file.originalname,
        tipo: file.mimetype
      }
    });

  } catch (error) {
    console.error("❌ Error en SandBox Core:", error);
    res.status(500).json({ error: "Error procesando el archivo: " + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SandBox AI Universal listo en el puerto ${PORT}`);
});
