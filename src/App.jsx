import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  FileText, 
  UploadCloud, 
  Loader2, 
  BookOpen, 
  Sparkles, 
  BrainCircuit, 
  X,
  Image as ImageIcon,
  Mic,
  FileSpreadsheet,
  Archive,
  PlayCircle
} from 'lucide-react';

const App = () => {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: '¡Bienvenido a **SandBox AI Universal**! 🚀\n\nAhora puedes subir cualquier tipo de archivo: PDFs, Imágenes, Word, Excel o Audio. ¿En qué puedo ayudarte hoy?',
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  // Función para elegir el icono según el tipo de archivo
  const getFileIcon = (file) => {
    if (!file) return <FileText />;
    const type = file.type;
    const name = file.name.toLowerCase();

    if (type.includes('pdf')) return <BookOpen color="#ef4444" size={24} />;
    if (type.includes('image')) return <ImageIcon color="#3b82f6" size={24} />;
    if (type.includes('audio')) return <Mic color="#a855f7" size={24} />;
    if (type.includes('video')) return <PlayCircle color="#f59e0b" size={24} />;
    if (name.endsWith('.xlsx') || name.endsWith('.csv') || type.includes('spreadsheet')) return <FileSpreadsheet color="#22c55e" size={24} />;
    if (type.includes('zip') || type.includes('compressed')) return <Archive color="#f97316" size={24} />;
    
    return <FileText color="#94a3b8" size={24} />;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedFile) return;

    const userPrompt = input;
    setMessages(prev => [...prev, { role: 'user', content: userPrompt, type: 'text' }]);
    setInput('');
    setIsProcessing(true);

    const formData = new FormData();
    formData.append('archivo', selectedFile);
    formData.append('pregunta', userPrompt);

    try {
      const response = await fetch('https://sandboxai.onrender.com/analizar', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.respuesta || data.error, type: 'text' }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "❌ Error de conexión con Render. Asegúrate de que el servidor soporte este tipo de archivo.", type: 'text' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={s.container}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
        body { margin: 0; background-color: #f1f5f9; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={{padding: '24px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            <div style={s.logoIcon}><BrainCircuit size={24} /></div>
            <h1 style={s.logoText}>SandBox AI</h1>
          </div>
        </div>

        <div style={{flex: 1, padding: '0 16px', overflowY: 'auto'}}>
          {!selectedFile ? (
            <label style={s.dropzone}>
              <UploadCloud size={32} color="#94a3b8" />
              <p style={{fontSize: '12px', fontWeight: 'bold', margin: '8px 0 0'}}>Ingresar Material</p>
              <p style={{fontSize: '10px', color: '#94a3b8', marginTop: '4px'}}>PDF, IMG, DOCX, XLS, MP3...</p>
              <input type="file" hidden onChange={(e) => setSelectedFile(e.target.files[0])} />
            </label>
          ) : (
            <div style={s.fileCard}>
              <button onClick={() => setSelectedFile(null)} style={s.removeBtn}><X size={14}/></button>
              <div style={s.iconBg}>
                {getFileIcon(selectedFile)}
              </div>
              <div style={{minWidth: 0, flex: 1}}>
                <p style={s.fileName}>{selectedFile.name}</p>
                <p style={s.fileStatus}>Archivo Cargado</p>
              </div>
            </div>
          )}
        </div>

        <div style={s.sidebarFooter}>
          <div style={s.userBadge}>
            <div style={s.avatar}>RA</div>
            <div>
              <p style={{fontSize: '12px', fontWeight: 'bold', margin: 0}}>Rod Arena</p>
              <p style={{fontSize: '10px', color: '#94a3b8', margin: 0}}>Universal Developer</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat */}
      <main style={s.chatContainer}>
        <header style={s.chatHeader}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div style={s.statusDot}></div>
            <span style={s.statusText}>Multimodal System Active</span>
          </div>
          <Sparkles size={18} color="#6366f1" />
        </header>

        <div style={s.messagesArea}>
          {messages.map((msg, i) => (
            <div key={i} style={{display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '20px'}}>
              <div style={{
                ...s.bubble,
                backgroundColor: msg.role === 'user' ? '#6366f1' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#1e293b',
                borderRadius: msg.role === 'user' ? '20px 20px 0 20px' : '20px 20px 20px 0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div style={{display: 'flex', gap: '10px', alignItems: 'center', color: '#64748b', fontSize: '14px'}}>
              <Loader2 className="spinner" size={18} /> Procesando información multimodal...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={s.inputWrapper}>
          <form onSubmit={handleSubmit} style={s.inputBox}>
            <input 
              style={s.input} 
              placeholder={selectedFile ? "Pregunta sobre el archivo..." : "Sube cualquier archivo para comenzar"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!selectedFile}
            />
            <button type="submit" style={s.sendBtn} disabled={!input.trim() || isProcessing}>
              <Send size={18} />
            </button>
          </form>
          <p style={{textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px'}}>
            Análisis Universal • Gemini 1.5 Flash Engine
          </p>
        </div>
      </main>
    </div>
  );
};

const s = {
  container: { display: 'flex', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' },
  sidebar: { width: '280px', backgroundColor: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' },
  logoIcon: { backgroundColor: '#6366f1', padding: '8px', borderRadius: '10px', color: '#fff' },
  logoText: { fontSize: '20px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' },
  dropzone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', border: '2px dashed #e2e8f0', borderRadius: '16px', cursor: 'pointer', backgroundColor: '#f8fafc', textAlign: 'center', padding: '10px' },
  fileCard: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#f0f4ff', borderRadius: '16px', position: 'relative', border: '1px solid #dbeafe' },
  iconBg: { backgroundColor: '#fff', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
  fileName: { fontSize: '12px', fontWeight: 'bold', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fileStatus: { fontSize: '10px', color: '#6366f1', fontWeight: 'bold', margin: 0, textTransform: 'uppercase' },
  removeBtn: { position: 'absolute', top: '-8px', right: '-8px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '50%', padding: '4px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  sidebarFooter: { padding: '20px', borderTop: '1px solid #f1f5f9' },
  userBadge: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' },
  chatContainer: { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' },
  chatHeader: { height: '64px', backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 8px #22c55e' },
  statusText: { fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' },
  messagesArea: { flex: 1, padding: '40px', overflowY: 'auto' },
  bubble: { maxWidth: '80%', padding: '16px 20px', fontSize: '15px', lineHeight: '1.5' },
  inputWrapper: { padding: '24px 40px' },
  inputBox: { display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: '20px', padding: '8px 8px 8px 24px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' },
  input: { flex: 1, border: 'none', outline: 'none', fontSize: '15px', padding: '10px 0' },
  sendBtn: { backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '14px', padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
};

export default App;
