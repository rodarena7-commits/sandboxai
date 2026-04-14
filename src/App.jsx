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
  MessageSquare,
  PlayCircle
} from 'lucide-react';

const App = () => {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: '¡Bienvenido a **SandBox AI Pro**! 🚀\n\nTu centro de conocimiento universal está listo. Sube cualquier archivo a tu biblioteca y analicémoslo juntos.',
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    const newFiles = uploadedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type,
      size: (file.size / 1024).toFixed(2) + ' KB',
      status: 'ready',
      raw: file
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const getFileIcon = (type) => {
    if (type.includes('pdf')) return <BookOpen style={{color: '#ef4444'}} />;
    if (type.includes('image')) return <ImageIcon style={{color: '#3b82f6'}} />;
    if (type.includes('audio')) return <Mic style={{color: '#a855f7'}} />;
    if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet style={{color: '#22c55e'}} />;
    if (type.includes('video')) return <PlayCircle style={{color: '#f59e0b'}} />;
    return <FileText style={{color: '#94a3b8'}} />;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || files.length === 0) {
      if (files.length === 0) alert("Sube al menos un archivo a tu biblioteca.");
      return;
    }

    const userPrompt = input;
    const fileToAnalyze = files[files.length - 1]; // Analiza el último archivo subido

    setMessages(prev => [...prev, { role: 'user', content: userPrompt, type: 'text' }]);
    setInput('');
    setIsProcessing(true);

    const formData = new FormData();
    formData.append('archivo', fileToAnalyze.raw);
    formData.append('pregunta', userPrompt);

    try {
      const response = await fetch('https://sandboxai.onrender.com/analizar', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.respuesta || `Error: ${data.error}`, 
        type: 'text' 
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "❌ Error de conexión con el servidor de Render.", 
        type: 'text' 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={s.container}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
        body { margin: 0; background-color: #f1f5f9; overflow: hidden; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>

      {/* Sidebar - SandBox Library */}
      <aside style={s.sidebar}>
        <div style={{padding: '24px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            <div style={s.logoIcon}><BrainCircuit size={24} /></div>
            <h1 style={s.logoText}>SandBox AI</h1>
          </div>
          <p style={s.tagline}>Universal Knowledge Hub</p>
        </div>

        <div style={s.scrollArea}>
          <div style={{marginBottom: '20px'}}>
            <label style={s.dropzone}>
              <UploadCloud size={32} color="#94a3b8" />
              <p style={{fontSize: '12px', fontWeight: 'bold', margin: '8px 0 0'}}>Ingresar Material</p>
              <p style={{fontSize: '10px', color: '#94a3b8', marginTop: '4px'}}>PDF, IMG, AUDIO, XLS...</p>
              <input type="file" hidden multiple onChange={handleFileUpload} />
            </label>
          </div>

          <div style={{padding: '0 4px'}}>
            <span style={s.sectionTitle}>Biblioteca Local ({files.length})</span>
            
            {files.length === 0 && (
              <div style={s.emptyState}>
                <Archive size={40} color="#e2e8f0" />
                <p style={{fontSize: '12px', color: '#94a3b8'}}>Tu baúl está vacío</p>
              </div>
            )}

            {files.map(file => (
              <div key={file.id} style={s.fileItem}>
                <div style={s.fileIconBox}>{getFileIcon(file.type)}</div>
                <div style={{flex: 1, minWidth: 0}}>
                  <p style={s.fileName}>{file.name}</p>
                  <p style={s.fileDetail}>{file.size} • Listo</p>
                </div>
                <button onClick={() => removeFile(file.id)} style={s.deleteBtn}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={s.sidebarFooter}>
          <div style={s.userBadge}>
            <div style={s.avatar}>RA</div>
            <div style={{overflow: 'hidden'}}>
              <p style={{fontSize: '12px', fontWeight: 'bold', margin: 0, color: '#fff'}}>Rod Arena</p>
              <p style={{fontSize: '10px', color: '#94a3b8', margin: 0}}>Pro Developer</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Interface */}
      <main style={s.main}>
        <header style={s.header}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div style={s.statusDot}></div>
            <span style={s.statusText}>Conectado a Render Core</span>
          </div>
          <Sparkles size={18} color="#6366f1" />
        </header>

        <div style={s.chatArea}>
          <div style={{maxWidth: '800px', margin: '0 auto'}}>
            {messages.map((msg, i) => (
              <div key={i} style={{display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '24px'}}>
                <div style={{
                  ...s.bubble,
                  backgroundColor: msg.role === 'user' ? '#6366f1' : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#1e293b',
                  borderRadius: msg.role === 'user' ? '24px 24px 4px 24px' : '24px 24px 24px 4px',
                  boxShadow: msg.role === 'user' ? '0 10px 15px -3px rgba(99, 102, 241, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div style={{display: 'flex', gap: '12px', alignItems: 'center', color: '#64748b'}}>
                <div style={s.loaderBubble}>
                  <Loader2 className="spinner" size={18} color="#6366f1" />
                </div>
                <span style={{fontSize: '14px', fontWeight: '500'}}>Analizando biblioteca multimodal...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div style={s.inputContainer}>
          <div style={{maxWidth: '800px', margin: '0 auto', position: 'relative'}}>
            <form onSubmit={handleSubmit} style={s.inputBox}>
              <input 
                style={s.inputField} 
                placeholder={files.length > 0 ? "Pregunta sobre tu biblioteca..." : "Sube archivos para activar SandBox AI..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" style={s.sendButton} disabled={!input.trim() || isProcessing}>
                <Send size={20} />
              </button>
            </form>
            <div style={s.inputFooter}>
              <span>Gemini 1.5 Flash</span>
              <span>•</span>
              <span>RAG Universal</span>
              <span>•</span>
              <span>Render Backend</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const s = {
  container: { display: 'flex', height: '100vh', width: '100vw' },
  sidebar: { width: '300px', backgroundColor: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', shrink: 0 },
  logoIcon: { backgroundColor: '#6366f1', padding: '8px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' },
  logoText: { fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-1px', color: '#0f172a' },
  tagline: { fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', margin: '4px 0 0 2px' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: '0 20px' },
  dropzone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', border: '2px dashed #e2e8f0', borderRadius: '20px', cursor: 'pointer', backgroundColor: '#f8fafc', transition: 'all 0.2s' },
  sectionTitle: { fontSize: '11px', fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' },
  emptyState: { textAlign: 'center', padding: '40px 0', opacity: 0.5 },
  fileItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#fff', border: '1px solid #f1f5f9', borderRadius: '16px', marginBottom: '8px', transition: 'all 0.2s' },
  fileIconBox: { padding: '8px', backgroundColor: '#f8fafc', borderRadius: '10px' },
  fileName: { fontSize: '12px', fontWeight: 'bold', margin: 0, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fileDetail: { fontSize: '10px', color: '#94a3b8', margin: 0 },
  deleteBtn: { padding: '6px', border: 'none', backgroundColor: 'transparent', color: '#cbd5e1', cursor: 'pointer' },
  sidebarFooter: { padding: '20px', borderTop: '1px solid #f1f5f9' },
  userBadge: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '16px' },
  avatar: { width: '36px', height: '36px', borderRadius: '12px', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'black', fontSize: '14px' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' },
  header: { height: '64px', backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', shrink: 0 },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 10px #22c55e' },
  statusText: { fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  chatArea: { flex: 1, overflowY: 'auto', padding: '40px' },
  bubble: { maxWidth: '85%', padding: '16px 24px', fontSize: '15px', lineHeight: '1.6', fontWeight: '500' },
  loaderBubble: { padding: '12px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' },
  inputContainer: { padding: '20px 40px 40px' },
  inputBox: { display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: '24px', padding: '8px 8px 8px 24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' },
  inputField: { flex: 1, border: 'none', outline: 'none', fontSize: '16px', padding: '12px 0', fontWeight: '500', color: '#1e293b' },
  sendButton: { backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '18px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' },
  inputFooter: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px', fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }
};

export default App;
