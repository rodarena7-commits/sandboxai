import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  FileText, 
  Image as ImageIcon, 
  Mic, 
  FileSpreadsheet, 
  Archive, 
  Trash2, 
  UploadCloud, 
  Loader2, 
  BookOpen,
  Sparkles,
  Paperclip,
  X,
  Plus,
  BrainCircuit,
  MessageSquare
} from 'lucide-react';

// El entorno inyecta la API Key automáticamente si se deja vacía
const apiKey = ""; 

const App = () => {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: '¡Bienvenido a **SandBox AI**! 🚀\n\nSoy tu concentrador de conocimiento. Puedes subir archivos y preguntarme cualquier cosa. Si necesitas una explicación visual, ¡pídeme un diagrama!',
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing, isGeneratingImage]);

  // Manejo de subida de archivos (Simulación de procesamiento RAG)
  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    const newFiles = uploadedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type,
      size: (file.size / 1024).toFixed(2) + ' KB',
      status: 'analyzing',
      raw: file
    }));
    
    setFiles(prev => [...prev, ...newFiles]);

    // Simular que la IA está "leyendo" el archivo para el RAG
    newFiles.forEach(f => {
      setTimeout(() => {
        setFiles(current => current.map(item => 
          item.id === f.id ? { ...item, status: 'indexed' } : item
        ));
      }, 2000);
    });
  };

  const removeFile = (id) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const getFileIcon = (type) => {
    if (type.includes('pdf')) return <BookOpen className="text-red-500" />;
    if (type.includes('image')) return <ImageIcon className="text-blue-400" />;
    if (type.includes('audio')) return <Mic className="text-purple-500" />;
    if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet className="text-green-500" />;
    if (type.includes('zip') || type.includes('compressed')) return <Archive className="text-amber-600" />;
    return <FileText className="text-slate-400" />;
  };

  // Función principal para llamar a Gemini
  const callGemini = async (userPrompt, currentFiles) => {
    setIsProcessing(true);
    
    try {
      // Prompt mejorado para actuar como SandBox AI
      const systemPrompt = `Eres SandBox AI, una plataforma avanzada de gestión de conocimiento. 
      Analiza los archivos del usuario: ${currentFiles.map(f => f.name).join(', ')}.
      Responde de forma técnica pero accesible. 
      Si el usuario pide algo visual, menciona que vas a generar una imagen.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });

      const data = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude procesar esa consulta.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse, type: 'text' }]);

      // Disparador de Imagen 4.0 si se detecta intención visual
      const visualKeywords = ['imagen', 'diagrama', 'visualiza', 'dibujo', 'esquema', 'grafico'];
      if (visualKeywords.some(key => userPrompt.toLowerCase().includes(key))) {
        handleImageGeneration(userPrompt);
      }

    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error de comunicación con SandBox Core.", type: 'text' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Generación de imágenes educativas
  const handleImageGeneration = async (prompt) => {
    setIsGeneratingImage(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: `A clean, professional educational diagram or technical illustration about: ${prompt}` }],
          parameters: { sampleCount: 1 }
        })
      });
      
      const data = await response.json();
      if (data.predictions?.[0]?.bytesBase64Encoded) {
        const imageUrl = `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`;
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: imageUrl, 
          type: 'image',
          caption: 'He generado este recurso visual para complementar la explicación.'
        }]);
      }
    } catch (error) {
      console.error("Image generation failed");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input, type: 'text' };
    setMessages(prev => [...prev, userMessage]);
    
    const currentInput = input;
    const currentFiles = [...files];
    setInput('');
    
    callGemini(currentInput, currentFiles);
  };

  return (
    <div className="flex h-screen bg-[#f1f5f9] text-slate-800 font-sans overflow-hidden">
      {/* Sidebar - SandBox Library */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-10">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-200">
              <BrainCircuit size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-slate-900">SandBox AI</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] ml-1">Universal Knowledge Hub</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
          <div className="mb-6">
            <label className="group relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer bg-slate-50 hover:bg-indigo-50/30 hover:border-indigo-400 transition-all duration-300">
              <div className="flex flex-col items-center justify-center text-center p-4">
                <UploadCloud className="w-10 h-10 text-slate-300 group-hover:text-indigo-500 transition-colors mb-2" />
                <p className="text-xs font-bold text-slate-600">Ingresar Material</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Suelta aquí tus PDFs, <br/>Audios o Imágenes</p>
              </div>
              <input type="file" className="hidden" multiple onChange={handleFileUpload} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Biblioteca Local ({files.length})</span>
            </div>
            
            {files.length === 0 && (
              <div className="text-center py-12 opacity-30 grayscale">
                <Archive className="mx-auto mb-3 text-slate-400" size={40} />
                <p className="text-xs font-medium">Tu baúl está vacío</p>
              </div>
            )}

            {files.map(file => (
              <div key={file.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:shadow-lg hover:border-indigo-100 transition-all group animate-in fade-in slide-in-from-left-2">
                <div className="shrink-0 p-2 bg-slate-50 rounded-lg">{getFileIcon(file.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate text-slate-700">{file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-slate-400 font-bold">{file.size}</span>
                    <span className={`text-[9px] font-black uppercase ${file.status === 'indexed' ? 'text-green-500' : 'text-indigo-400 animate-pulse'}`}>
                      • {file.status === 'indexed' ? 'Indexado' : 'Analizando'}
                    </span>
                  </div>
                </div>
                <button onClick={() => removeFile(file.id)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 text-red-400 rounded-xl transition-all">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 mt-auto border-t border-slate-50">
          <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-2xl text-white">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-sm font-black shadow-inner">RA</div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate">Rod Arena</p>
              <p className="text-[10px] text-slate-400 font-medium">Desarrollador</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Interface */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header bar */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Sincronizado con Gemini 1.5 Flash</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <MessageSquare size={18} />
            <div className="h-4 w-px bg-slate-200"></div>
            <Sparkles size={18} className="text-indigo-500" />
          </div>
        </header>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-8">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                  <div className={`p-5 rounded-3xl shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-100' 
                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                  }`}>
                    {msg.type === 'text' ? (
                      <div className="text-[15px] leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</div>
                    ) : (
                      <div className="space-y-4">
                        <img src={msg.content} alt="AI Visual" className="rounded-2xl max-w-full h-auto shadow-2xl border-4 border-white" />
                        {msg.caption && <p className="text-xs font-bold text-slate-500 italic px-2">{msg.caption}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex justify-start animate-in fade-in">
                <div className="bg-white border border-slate-100 p-5 rounded-3xl rounded-tl-none flex items-center gap-4 shadow-sm">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                  </div>
                  <span className="text-sm text-slate-500 font-bold">SandBox AI procesando material...</span>
                </div>
              </div>
            )}

            {isGeneratingImage && (
              <div className="flex justify-start animate-in fade-in">
                <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-3xl rounded-tl-none flex items-center gap-4 shadow-sm">
                  <Loader2 className="animate-spin text-indigo-600" size={20} />
                  <span className="text-sm text-indigo-600 font-bold">Dibujando explicación visual...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Console Input Area */}
        <div className="p-6 bg-transparent">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative group">
              <div className="absolute inset-0 bg-indigo-500/10 rounded-3xl blur-xl group-focus-within:bg-indigo-500/20 transition-all"></div>
              <div className="relative flex items-center bg-white border border-slate-200 rounded-3xl shadow-2xl p-2 pl-6 focus-within:border-indigo-400 transition-all">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={files.length > 0 ? "Pregunta sobre tu biblioteca..." : "Sube archivos para activar SandBox AI..."}
                  className="flex-1 bg-transparent border-none py-4 text-[15px] font-medium outline-none text-slate-700 placeholder:text-slate-300"
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 transition-all flex items-center justify-center shadow-lg active:scale-95 ml-2"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-100 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Multimodal RAG</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-100 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Imagen 4.0 Support</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
