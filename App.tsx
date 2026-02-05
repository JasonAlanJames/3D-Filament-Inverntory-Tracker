
import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, RefreshCw, CheckCircle2, 
  Database, Settings, X, ShieldAlert, AlertTriangle, Globe,
  Mic, Send, MessageSquare, Package, Info, ExternalLink
} from 'lucide-react';
import { extractFilamentDetails, queryInventory } from './services/geminiService';
import { getSheetData, findFilamentRow, syncFilament } from './services/googleSheetsService';
import { AppStatus, FilamentDetails, ProcessingState, AppConfig, AuthState } from './types';

const GOOGLE_CLIENT_ID = '785127494720-kcsokq8vuv2fc5d6g65gv2vuh2lk9le5.apps.googleusercontent.com';
const STORAGE_KEY = 'filament_sync_user_config_v2';
const VERSION = '0.2.4';

declare const google: any;

const extractIdFromUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : url;
};

const App: React.FC = () => {
  const [state, setState] = useState<ProcessingState>({ status: AppStatus.IDLE });
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { spreadsheetId: '', sheetName: 'Sheet1' };
  });
  const [auth, setAuth] = useState<AuthState>({ accessToken: null, expiresAt: null });
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [isListening, setIsListening] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log(`FilamentSync Production Build v${VERSION}`);
    
    const initGis = () => {
      if (typeof google !== 'undefined' && !tokenClient) {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/spreadsheets',
          callback: (response: any) => {
            setAuth({
              accessToken: response.access_token,
              expiresAt: Date.now() + (parseInt(response.expires_in) * 1000)
            });
            setState({ status: AppStatus.IDLE });
          },
        });
        setTokenClient(client);
      }
    };
    const timer = setInterval(() => { if (typeof google !== 'undefined') { initGis(); clearInterval(timer); } }, 500);
    return () => clearInterval(timer);
  }, [tokenClient]);

  const connectGoogle = () => tokenClient?.requestAccessToken({ prompt: 'select_account' });

  const processImage = async (dataUrl: string) => {
    if (!auth.accessToken) { connectGoogle(); return; }
    setState({ status: AppStatus.PROCESSING, imagePreview: dataUrl });
    try {
      const details = await extractFilamentDetails(dataUrl);
      const sheetId = extractIdFromUrl(config.spreadsheetId);
      const sheetData = await getSheetData(sheetId, config.sheetName, auth.accessToken!);
      const rowIndex = findFilamentRow(sheetData, details);
      
      if (rowIndex !== -1) {
        const existingRow = sheetData[rowIndex - 1];
        // In the 11-column mapping, Qty is Column B (index 1)
        const currentQtyInSheet = parseInt(existingRow[1]) || 1;
        setState({ 
          status: AppStatus.SELECT_STATUS, 
          result: { ...details, qtyInStock: currentQtyInSheet + 1 }, 
          imagePreview: dataUrl,
          existingRowIndex: rowIndex
        });
      } else {
        setState({ status: AppStatus.REVIEW, result: { ...details, qtyInStock: 1, usedStatus: 'Full' }, imagePreview: dataUrl });
      }
    } catch (error: any) {
      setState({ status: AppStatus.ERROR, error: error.message });
    }
  };

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAiQuery(transcript);
      handleAiQuery(transcript);
    };
    recognition.start();
  };

  const handleAiQuery = async (query: string = aiQuery) => {
    if (!query.trim() || !auth.accessToken) return;
    setState({ ...state, status: AppStatus.QUERYING_AI, aiResponse: 'Consulting stock records...' });
    try {
      const sheetId = extractIdFromUrl(config.spreadsheetId);
      const data = await getSheetData(sheetId, config.sheetName, auth.accessToken!);
      const response = await queryInventory(query, data);
      setState({ ...state, status: AppStatus.IDLE, aiResponse: response });
    } catch (e) {
      setState({ ...state, status: AppStatus.IDLE, aiResponse: "Inventory query failed." });
    }
  };

  const handleSync = async (statusOverride?: string) => {
    setState(prev => ({ ...prev, status: AppStatus.SYNCING }));
    try {
      const finalDetails = { ...state.result!, usedStatus: statusOverride || state.result?.usedStatus || 'Full' };
      const sheetId = extractIdFromUrl(config.spreadsheetId);
      await syncFilament(sheetId, config.sheetName, finalDetails, auth.accessToken!, state.existingRowIndex);
      setState({ status: AppStatus.SUCCESS });
    } catch (error: any) {
      setState({ status: AppStatus.ERROR, error: error.message });
    }
  };

  const isAuthValid = !!(auth.accessToken && auth.expiresAt && Date.now() < auth.expiresAt);

  const openSheet = () => {
    if (config.spreadsheetId) {
      const url = config.spreadsheetId.includes('http') ? config.spreadsheetId : `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`;
      window.open(url, '_blank');
    } else {
      setState({ status: AppStatus.CONFIGURING });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 min-h-screen flex flex-col selection:bg-blue-500/30">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-900/40">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">FilamentSync</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAuthValid && (
            <button 
              onClick={openSheet}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 transition-all"
            >
              <ExternalLink className="w-4 h-4 text-blue-400" />
              View Stock Sheet
            </button>
          )}
          {isAuthValid && (
            <div className="px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-black uppercase flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live Connection
            </div>
          )}
          <button onClick={() => setState({ status: AppStatus.CONFIGURING })} className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        <main className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col relative min-h-[500px]">
          {state.status === AppStatus.IDLE && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12">
              {!isAuthValid ? (
                <div className="max-w-sm text-center">
                  <Globe className="w-16 h-16 text-blue-400 mx-auto mb-6" />
                  <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter">Production Console</h3>
                  <button onClick={connectGoogle} className="w-full py-5 bg-white text-slate-950 font-black rounded-2xl flex items-center justify-center gap-4 uppercase tracking-widest text-sm shadow-xl">
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="G" /> Authorize with Google
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl">
                  <button onClick={() => { setState({status: AppStatus.CAPTURING}); navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(s=>{if(videoRef.current) videoRef.current.srcObject=s;}); }} className="group p-10 bg-blue-600 hover:bg-blue-500 rounded-[2.5rem] flex flex-col items-center gap-4 shadow-xl active:scale-95 transition-all">
                    <Camera className="w-10 h-10 text-white" />
                    <span className="font-black text-xl text-white uppercase tracking-tight">Sync New Label</span>
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="group p-10 bg-slate-800 hover:bg-slate-700 rounded-[2.5rem] flex flex-col items-center gap-4 shadow-xl active:scale-95 transition-all">
                    <Upload className="w-10 h-10 text-slate-400" />
                    <span className="font-black text-xl text-slate-300 uppercase tracking-tight">Upload Asset</span>
                  </button>
                </div>
              )}
              <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => { const f=e.target.files?.[0]; if(f){const r=new FileReader(); r.onload=ev=>processImage(ev.target?.result as string); r.readAsDataURL(f);}}} />
            </div>
          )}

          {state.status === AppStatus.CAPTURING && (
            <div className="flex-1 flex flex-col bg-black relative">
              <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
              <div className="p-8 bg-slate-950/90 backdrop-blur-xl flex justify-between items-center border-t border-slate-800">
                <button onClick={() => { if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); setState({status: AppStatus.IDLE}); }} className="text-slate-500 font-black uppercase text-xs">Cancel</button>
                <button onClick={() => { if (videoRef.current && canvasRef.current) { const c=canvasRef.current; c.width=videoRef.current.videoWidth; c.height=videoRef.current.videoHeight; c.getContext('2d')?.drawImage(videoRef.current,0,0); const d=c.toDataURL('image/jpeg'); if(videoRef.current.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); processImage(d);}}} className="w-20 h-20 bg-white rounded-full border-[8px] border-slate-900 active:scale-90 transition-transform" />
                <div className="w-12" />
              </div>
            </div>
          )}

          {state.status === AppStatus.PROCESSING && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-6 text-center">
              <div className="relative">
                <RefreshCw className="w-16 h-16 text-blue-500 animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-widest text-white">AI Processing...</h2>
                <p className="text-slate-500 text-xs font-bold mt-2 uppercase">Analyzing Asset Metadata</p>
              </div>
            </div>
          )}

          {state.status === AppStatus.SELECT_STATUS && state.result && (
            <div className="flex-1 flex flex-col items-center justify-center p-10 space-y-8 animate-in slide-in-from-bottom duration-500">
              <div className="text-center space-y-2">
                <div className="inline-block p-4 bg-amber-500/10 border border-amber-500/30 rounded-full mb-4">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tight text-white">Existing Stock</h2>
                <p className="text-slate-400 font-medium italic">"{state.result.brand} {state.result.materialType} {state.result.color}"</p>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-4">Calculated New Qty: {state.result.qtyInStock}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                {['Full', 'Half Full', 'Quarter Full', 'Almost Empty'].map((s) => (
                  <button key={s} onClick={() => handleSync(s)} className="p-6 bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-400 rounded-3xl text-xs font-black uppercase tracking-widest transition-all hover:-translate-y-1">
                    {s}
                  </button>
                ))}
              </div>
              <button onClick={() => setState({status: AppStatus.IDLE})} className="text-slate-500 uppercase font-black text-[10px] tracking-[0.2em] hover:text-white transition-colors">Discard Sync</button>
            </div>
          )}

          {state.status === AppStatus.REVIEW && state.result && (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden animate-in fade-in duration-500">
              <div className="w-full lg:w-1/3 p-6 bg-slate-950 border-r border-slate-800 flex flex-col">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">Verification Frame</span>
                <img src={state.imagePreview} className="w-full rounded-2xl border border-white/10 object-cover aspect-square shadow-2xl" alt="Scan" />
              </div>
              <div className="flex-1 p-8 flex flex-col overflow-auto">
                <h3 className="text-xl font-black uppercase mb-6 flex items-center gap-2"><Info className="w-5 h-5 text-blue-500"/> Confirm Details</h3>
                <div className="grid grid-cols-2 gap-4 flex-1">
                  {Object.entries(state.result).map(([k, v]) => (
                    <div key={k}>
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1 tracking-tighter">{k}</label>
                      <input type="text" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-xs font-bold text-blue-100" value={v || 'Unknown'} readOnly />
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex gap-3">
                  <button onClick={() => setState({status: AppStatus.IDLE})} className="px-6 py-4 bg-slate-800 font-black rounded-xl text-[10px] uppercase text-slate-400 hover:text-white transition-all">Cancel</button>
                  <button onClick={() => handleSync()} className="flex-1 bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-black text-white uppercase text-xs shadow-lg transition-all active:scale-95">Sync to Database</button>
                </div>
              </div>
            </div>
          )}

          {state.status === AppStatus.SUCCESS && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
              <h2 className="text-4xl font-black uppercase mb-2 tracking-tighter">Sync Successful</h2>
              <p className="text-slate-500 mb-10 font-bold uppercase text-[10px] tracking-widest">Global inventory records updated</p>
              <button onClick={() => setState({status: AppStatus.IDLE})} className="px-12 py-5 bg-blue-600 text-white font-black rounded-2xl uppercase text-xs shadow-xl tracking-widest hover:bg-blue-500 active:scale-95 transition-all">Done</button>
            </div>
          )}

          {state.status === AppStatus.CONFIGURING && (
            <div className="flex-1 p-10 max-w-xl mx-auto w-full">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tight">System Settings</h2>
                <button onClick={() => setState({status: AppStatus.IDLE})} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700"><X className="w-5 h-5"/></button>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Google Sheet URL</label>
                  <input 
                    type="text" 
                    placeholder="Paste complete URL here..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-4 font-mono text-xs text-blue-400 focus:border-blue-500 outline-none" 
                    value={config.spreadsheetId} 
                    onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })} 
                  />
                  <p className="text-[9px] text-slate-600 mt-2 font-bold uppercase italic">The system automatically extracts the Spreadsheet ID from the URL.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Sheet Tab Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g., FilamentTracker"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-4 text-xs font-bold outline-none focus:border-blue-500" 
                    value={config.sheetName} 
                    onChange={(e) => setConfig({ ...config, sheetName: e.target.value })} 
                  />
                </div>
                <button onClick={() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); setState({status: AppStatus.IDLE}); }} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg tracking-widest hover:bg-blue-500 transition-all">Update Connection</button>
              </div>
            </div>
          )}
        </main>

        <aside className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 flex flex-col h-full shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="font-black uppercase tracking-tight text-slate-200">Stock Analyst</h3>
            </div>
            
            <div className="flex-1 overflow-auto bg-slate-950/50 rounded-2xl p-4 mb-4 border border-slate-800/50 min-h-[350px]">
              {state.status === AppStatus.QUERYING_AI ? (
                 <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Consulting Data...</span>
                 </div>
              ) : state.aiResponse ? (
                <div className="space-y-4">
                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-sm leading-relaxed text-slate-300 font-medium">
                    {state.aiResponse}
                  </div>
                  <button onClick={() => setState({...state, aiResponse: undefined})} className="text-[10px] font-black uppercase text-slate-600 hover:text-slate-400 tracking-widest transition-colors">Clear</button>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-30">
                  <Package className="w-12 h-12" />
                  <p className="text-xs font-bold uppercase tracking-tight leading-relaxed">Inquire about PLA levels, color variants, or replenishment needs.</p>
                </div>
              )}
            </div>

            <div className="relative group">
              <input 
                type="text" 
                placeholder="Query Stock..." 
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs font-medium outline-none focus:border-purple-500/50 transition-all pr-24"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiQuery()}
              />
              <div className="absolute right-2 top-2 flex gap-1">
                <button onClick={startVoice} className={`p-2.5 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  <Mic className="w-4 h-4" />
                </button>
                <button onClick={() => handleAiQuery()} className="p-2.5 bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-900/40 hover:bg-purple-500">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <canvas ref={canvasRef} hidden />
    </div>
  );
};

export default App;
