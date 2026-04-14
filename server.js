require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

const app = express();

// Middleware: CORS abierto para que Vercel y Render se comuniquen sin problemas
app.use(cors());
app.use(express.json());

// Configuración de Multer: Almacenamiento temporal de archivos en la carpeta 'uploads'
const upload = multer({ dest: 'uploads/' });

// Inicialización de la IA con la variable de entorno de Render
// Al tener Pospago, Google requiere que la clave sea enviada sin errores de sintaxis
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

/**
 * Convierte un archivo local a un objeto que Gemini puede procesar.
 * @param {string} path - Ruta del archivo en el servidor.
 * @param {string} mimeType - Tipo de archivo (image/jpeg, application/pdf, etc).
 */
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

// Ruta de salud: Para verificar que el backend está vivo desde el navegador
app.get('/', (req, res) => {
  res.send('🚀 SandBox AI Core V1 está operativo y listo para procesar material.');
});

// Ruta Principal de Análisis Multimodal
app.post('/analizar', upload.single('archivo'), async (req, res) => {
  try {
    const { pregunta } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se recibió ningún archivo en la petición." });
    }

    console.log(`📂 Procesando archivo: ${file.originalname} (${file.mimetype})`);

    // --- SOLUCIÓN AL ERROR 404 ---
    // Forzamos el uso de la versión 'v1' estable. 
    // Usamos el modelo 'gemini-1.5-flash' que es el estándar para cuentas de pago y gratuitas.
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash" },
      { apiVersion: 'v1' } 
    );

    // Preparamos el archivo y el prompt
    const filePart = fileToGenerativePart(file.path, file.mimetype);
    const prompt = `Actúa como SandBox AI, un asistente de análisis de documentos. 
    Analiza este material y responde a la siguiente consulta del usuario de forma detallada:
    
    CONSULTA: ${pregunta || "Por favor, haz un resumen ejecutivo de este documento."}`;

    // Llamada a la API de Gemini
    const result = await model.generateContent([prompt, filePart]);
    const response = await result.response;
    const text = response.text();

    // LIMPIEZA: Borramos el archivo del servidor de Render para liberar espacio
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    res.json({ respuesta: text });

  } catch (error) {
    // Si hay error, intentamos borrar el archivo para no dejar basura
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error("❌ Error en SandBox Core:", error.message);
    
    // Devolvemos el error detallado para que sepas qué pasó en la consola del navegador
    res.status(500).json({ 
      error: "Error interno en la IA", 
      details: error.message 
    });
  }
});

// El puerto 10000 es el estándar de Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 SandBox AI Universal listo en el puerto ${PORT}`);
});
