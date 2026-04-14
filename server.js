require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Función moderna para leer PDF sin errores de DOM
async function getPdfText(path) {
    const data = new Uint8Array(fs.readFileSync(path));
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
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

app.post('/analizar', async (req, res) => {
    try {
        const { pregunta, nombreArchivo } = req.body;
        const rutaCompleta = `./archivos/${nombreArchivo}`;

        if (!fs.existsSync(rutaCompleta)) {
            return res.status(404).json({ error: "Archivo no encontrado en la carpeta /archivos" });
        }

        const textoExtraido = await getPdfText(rutaCompleta);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Actúa como SandBox AI. Usa este contexto para responder:
            CONTEXTO: ${textoExtraido.substring(0, 30000)}
            PREGUNTA: ${pregunta}
        `;

        const result = await model.generateContent(prompt);
        res.json({ respuesta: result.response.text() });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno: " + error.message });
    }
});

app.listen(3000, () => console.log("🚀 SandBox AI listo en el puerto 3000"));
