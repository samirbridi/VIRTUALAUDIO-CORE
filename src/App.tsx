import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Mic, MonitorUp, Circle, Square, Play, Waves } from 'lucide-react';
import { globalEngine, AudioChannel, Bus } from './lib/audioManager';
import { ChannelStrip } from './components/ChannelStrip';
import { MasterStrip } from './components/MasterStrip';
import { useAudioDevices } from './components/uiControls';

export default function App() {
  const [engineStarted, setEngineStarted] = useState(false);
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const { inputs, outputs } = useAudioDevices();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recFormat, setRecFormat] = useState<'webm' | 'wav' | 'mp3' | 'aiff'>('wav');
  
  const refreshState = useCallback(() => {
    setChannels(Array.from(globalEngine.channels.values()));
    setBuses(Array.from(globalEngine.buses.values()));
  }, []);

  const startEngine = async () => {
    globalEngine.init(6, 6); // Initialize 6 Inputs and 6 output buses
    setEngineStarted(true);
    refreshState();
  };

  const handleAddChannel = () => {
    globalEngine.createChannel(`VIRTUAL IN ${globalEngine.channels.size + 1}`);
    refreshState();
  };

  const handleAddBus = () => {
    const newId = `bus${Math.random().toString(36).substring(7)}`;
    globalEngine.createBus(newId, `Bus ${globalEngine.buses.size + 1}`);
    refreshState();
  };

  const removeChannel = (id: string) => {
    globalEngine.removeChannel(id);
    refreshState();
  };

  const removeBus = (id: string) => {
    globalEngine.removeBus(id);
    refreshState();
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      if (recFormat !== 'webm') {
          setIsProcessing(true);
      }
      
      try {
          const blob = await globalEngine.stopRecording(recFormat);
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.hidden = true;
            a.href = url;
            a.download = `gravação-voxbridge.${recFormat}`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
          }
      } catch (err) {
          console.error("Export Failed", err);
          alert("Failed to encode audio file");
      } finally {
          setIsProcessing(false);
      }
      
    } else {
      const ok = globalEngine.startRecording();
      if (ok) setIsRecording(true);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg-deep text-text-primary font-sans overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-bg-surface border-b border-border-dark shadow-sm z-20 h-[60px]">
        <div className="flex items-center gap-3">
          <div className="text-accent-glow font-bold text-lg tracking-[2px] uppercase flex items-center gap-2">
            VirtuAudio <span className="font-light text-text-primary/70">Core</span>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-3 flex-1 px-8">
          {!engineStarted ? (
            <button 
              onClick={startEngine}
              className="flex items-center justify-center gap-2 bg-text-primary hover:bg-white text-bg-deep px-6 py-2 rounded text-[11px] font-bold transition-transform active:scale-95 uppercase tracking-wide border border-transparent hover:border-text-primary"
            >
              <Play size={14} fill="currentColor" /> START ENGINE
            </button>
          ) : (
            <div className="flex gap-2 items-center">
                <div className="flex gap-2 bg-bg-card p-[2px] border border-border-dark rounded mr-2">
                  <div className="px-3 py-1 font-mono text-[11px] text-text-secondary flex items-center border-r border-border-dark">ENGINE: ASIO VIRTUAL</div>
                  <div className="px-3 py-1 font-mono text-[11px] text-accent-glow flex items-center">LATENCY: ACTIVE</div>
                </div>
                <button onClick={handleAddChannel} className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold hover:bg-bg-card border border-border-dark rounded transition-colors text-text-secondary hover:text-text-primary h-full">
                    + Add Input Strip
                </button>
                <div className="w-[1px] h-6 bg-border-dark mx-1" />
                <button onClick={handleAddBus} className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold hover:bg-bg-card border border-border-dark rounded transition-colors text-text-secondary hover:text-text-primary h-full">
                    + Add Output Strip
                </button>
            </div>
          )}
        </div>

        {engineStarted && (
           <div className="flex items-center gap-2 bg-[#251212] p-2 rounded-lg border border-[#442222]">
             {isProcessing ? (
               <div className="text-[10px] font-mono text-accent-glow px-4 animate-pulse">
                  ENCODING...
               </div>
             ) : (
               <select value={recFormat} onChange={e => setRecFormat(e.target.value as any)} disabled={isRecording} className="bg-transparent text-[10px] font-mono text-text-secondary px-2 rounded outline-none border-none disabled:opacity-50 appearance-none cursor-pointer">
                  <option value="webm">WEBM</option>
                  <option value="wav">WAV</option>
                  <option value="mp3">MP3</option>
                  <option value="aiff">AIFF</option>
               </select>
             )}
             <button 
                onClick={toggleRecording}
                disabled={isProcessing}
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50
                   ${isRecording ? 'bg-accent-danger text-white hover:bg-red-500' : 'bg-accent-danger text-white hover:bg-red-500 shadow-md'}
                `}
             >
                <div className={`w-2 h-2 rounded-full border border-white/50 ${isRecording ? 'bg-white animate-pulse shadow-[0_0_8px_white]' : 'bg-transparent'}`} />
                {isRecording ? 'RECORDING...' : 'RECORD'}
             </button>
           </div>
        )}
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden bg-border-dark p-[1px]">
        {engineStarted ? (
          <div className="flex-1 flex w-full overflow-hidden gap-[1px]">
             
             {/* Inputs Area */}
             <div className="flex flex-1 overflow-x-auto p-4 gap-3 bg-bg-surface">
               {channels.map((ch, idx) => (
                 <ChannelStrip 
                   key={ch.id} 
                   channel={ch} 
                   inputs={inputs}
                   buses={buses}
                   onUpdate={refreshState} 
                   onRemove={() => removeChannel(ch.id)} 
                 />
               ))}
               {channels.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-text-secondary gap-4 opacity-50 border border-dashed border-border-dark rounded-xl m-2">
                     <p className="font-mono text-[11px]">NO SOURCES ACTIVE</p>
                  </div>
               )}
             </div>

             {/* Master Area */}
             <div className="overflow-x-auto border-l border-border-dark flex bg-bg-surface shrink-0 max-w-[50vw]">
                <MasterStrip outputs={outputs} buses={buses} onRemoveBus={removeBus} onUpdate={refreshState} />
             </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-bg-surface w-full z-10 gap-6">
             <div className="text-text-primary text-xl font-bold tracking-widest uppercase">Select an audio engine</div>
             <p className="text-text-secondary text-sm max-w-md">
                VirtuAudio provides browser-native audio mixing. Connect standard inputs and virtual devices to route your streams visually.
             </p>
          </div>
        )}
      </main>

      <footer className="h-10 bg-bg-surface border-t border-border-dark flex items-center justify-between px-6 text-[11px] text-text-secondary font-mono uppercase z-20 shrink-0">
        <div className="flex gap-6">
          <span>48000 Hz</span>
          <span>24-BIT</span>
          <span>Buffer: 1024</span>
        </div>
        <div>ENGINE SYNC: ACTIVE</div>
      </footer>
    </div>
  );
}
