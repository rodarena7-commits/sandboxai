require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Configuración de la librería PDF para entorno de servidor
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

const app = express();

// Middlewares
app.use(cors()); // Permite que tu frontend se conecte al backend
app.use(express.json());

// Configuración de almacenamiento de archivos (Temporal en Render)
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Guardamos el archivo con su nombre original
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Configuración de Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Función para extraer texto del PDF
async function getPdfText(filePath) {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ 
        data, 
        useSystemFonts: true,
        disableFontFace: true 
    });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }
    return fullText;
}

// --- RUTAS ---

// 1. Ruta principal para evitar el "Cannot GET /"
app.get('/', (req, res) => {
    res.send('🚀 SandBox AI Backend funcionando correctamente. Listo para recibir archivos.');
});

// 2. Ruta para subir y analizar el archivo en un solo paso
app.post('/analizar', upload.single('archivo'), async (req, res) => {
    try {
        const { pregunta } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "No se subió ningún archivo." });
        }

        console.log(`Procesando archivo: ${file.filename}`);
        
        // Extraemos el texto del PDF subido
        const textoExtraido = await getPdfText(file.path);
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Actúa como SandBox AI, un experto en análisis de documentos.
            Responde de forma clara basándote únicamente en el siguiente contenido:
            
            CONTENIDO DEL DOCUMENTO:
            ${textoExtraido.substring(0, 30000)}
            
            PREGUNTA DEL USUARIO:
            ${pregunta || "¿De qué trata este documento?"}
        `;

        const result = await model.generateContent(prompt);
        const respuestaIA = result.response.text();

        // OPCIONAL: Borrar el archivo después de procesarlo para no llenar el disco de Render
        fs.unlinkSync(file.path);

        res.json({ 
            respuesta: respuestaIA,
            nombreArchivo: file.originalname 
        });

    } catch (error) {
        console.error("Error en el proceso:", error);
        res.status(500).json({ error: "Error al procesar el archivo: " + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SandBox AI en línea en el puerto ${PORT}`);
});
