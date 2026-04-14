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
  BrainCircuit,
  MessageSquare,
  X
} from 'lucide-react';

const App = () => {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: '¡Bienvenido a **SandBox AI**! 🚀\n\nHe conectado este panel con tu servidor de Render. Sube un PDF y hazme una pregunta para analizarlo en tiempo real.',
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
    } else {
      alert("Por favor, selecciona un archivo PDF.");
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
  };

  const getFileIcon = (type) => {
    if (type?.includes('pdf')) return <BookOpen className="text-red-500" />;
    return <FileText className="text-slate-400" />;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedFile) return;

    const userPrompt = input;
    const currentFile = selectedFile;

    // Añadir mensaje del usuario al chat
    setMessages(prev => [...prev, { role: 'user', content: userPrompt, type: 'text' }]);
    setInput('');
    setIsProcessing(true);

    // Lógica real de conexión con el Backend de Render
    const formData = new FormData();
    formData.append('archivo', currentFile);
    formData.append('pregunta', userPrompt);

    try {
      const response = await fetch('https://sandboxai.onrender.com/analizar', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Error del servidor: ${data.error}`, 
          type: 'text' 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.respuesta, 
          type: 'text' 
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "❌ Error de conexión: Asegúrate de que tu servidor en Render esté encendido.", 
        type: 'text' 
      }]);
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#f1f5f9] text-slate-800 font-sans overflow-hidden">
      {/* Sidebar - Biblioteca y Estado */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-10">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-200">
              <BrainCircuit size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-slate-900">SandBox AI</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] ml-1">Live Backend Connection</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-6">
            {!selectedFile ? (
              <label className="group relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer bg-slate-50 hover:bg-indigo-50/30 hover:border-indigo-400 transition-all duration-300">
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <UploadCloud className="w-10 h-10 text-slate-300 group-hover:text-indigo-500 transition-colors mb-2" />
                  <p className="text-xs font-bold text-slate-600">Subir Documento</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">Haz clic para buscar tu PDF</p>
                </div>
                <input type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
              </label>
            ) : (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl relative animate-in fade-in zoom-in-95">
                <button 
                  onClick={removeFile}
                  className="absolute -top-2 -right-2 bg-white border border-slate-200 rounded-full p-1 text-slate-400 hover:text-red-500 shadow-sm"
                >
                  <X size={14} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <BookOpen className="text-red-500" size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate text-indigo-900">{selectedFile.name}</p>
                    <p className="text-[9px] text-indigo-400 font-bold uppercase">Listo para analizar</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="px-1">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Información del Sistema</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Este panel envía tus archivos directamente a <strong>Render</strong> para procesamiento RAG con <strong>Gemini 1.5 Flash</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 mt-auto border-t border-slate-50">
          <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-2xl text-white">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-sm font-black">RA</div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate">Rod Arena</p>
              <p className="text-[10px] text-slate-400 font-medium">SandBox Developer</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Interface */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Conectado a sandboxai.onrender.com</span>
          </div>
          <Sparkles size={18} className="text-indigo-500" />
        </header>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8">
          <div className="max-w-4xl mx-auto space-y-8">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                  <div className={`p-5 rounded-3xl shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-100' 
                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                  }`}>
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex justify-start animate-in fade-in">
                <div className="bg-white border border-slate-100 p-5 rounded-3xl rounded-tl-none flex items-center gap-4 shadow-sm">
                  <Loader2 className="animate-spin text-indigo-600" size={20} />
                  <span className="text-sm text-slate-500 font-bold">SandBox AI analizando documento en Render...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative group">
              <div className="absolute inset-0 bg-indigo-500/10 rounded-3xl blur-xl group-focus-within:bg-indigo-500/20 transition-all"></div>
              <div className="relative flex items-center bg-white border border-slate-200 rounded-3xl shadow-2xl p-2 pl-6 focus-within:border-indigo-400 transition-all">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={selectedFile ? "Pregunta sobre el PDF..." : "Sube un archivo para comenzar..."}
                  className="flex-1 bg-transparent border-none py-4 text-[15px] font-medium outline-none text-slate-700 placeholder:text-slate-300"
                  disabled={isProcessing}
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || !selectedFile || isProcessing}
                  className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 transition-all flex items-center justify-center shadow-lg active:scale-95 ml-2"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
            <p className="text-center text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest">
              Powered by Google Gemini 1.5 Flash • RAG Engine
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
