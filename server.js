// 1. Cargamos las librerías necesarias
require('dotenv').config(); // Lee tu archivo .env secreto
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');
const fs = require('fs');

const app = express();
app.use(express.json());

// 2. Configuramos Gemini con la clave que vive en process.env
// (Recuerda que Node.js la saca del archivo .env automáticamente)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// 3. Ruta para procesar un documento (Lógica RAG simplificada)
app.post('/analizar', async (req, res) => {
    try {
        const { pregunta, rutaArchivo } = req.body;

        // --- PARTE LANGCHAIN / PARSER ---
        // Leemos el archivo físico de tu Mac
        const dataBuffer = fs.readFileSync(rutaArchivo);
        const data = await pdf(dataBuffer);
        const textoExtraido = data.text; // Aquí ya tenemos el texto del PDF

        // --- PARTE GEMINI ---
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // --- PARTE RAG ---
        // Combinamos el texto del archivo con la pregunta del usuario
        const prompt = `
            Eres SandBox AI. Utiliza el siguiente contenido para responder.
            CONTENIDO DEL ARCHIVO: ${textoExtraido.substring(0, 20000)} 
            PREGUNTA DEL USUARIO: ${pregunta}
        `;

        const result = await model.generateContent(prompt);
        const respuestaIA = result.response.text();

        res.json({ respuesta: respuestaIA });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Hubo un error procesando el archivo." });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 SandBox AI Backend corriendo en http://localhost:${PORT}`);
});
