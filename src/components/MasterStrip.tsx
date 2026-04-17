import React, { useState, useEffect } from 'react';
import { globalEngine, Bus } from '../lib/audioManager';
import { VerticalFader, VUMeter, useVU } from './uiControls';
import { X } from 'lucide-react';

const AudioSinkPlayer = ({ stream, sinkId }: { stream?: MediaStream, sinkId: string }) => {
  const audioRef = React.useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && stream && audioRef.current.srcObject !== stream) {
      audioRef.current.srcObject = stream;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError') {
            console.error("Playback error", e);
          }
        });
      }
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current && sinkId && 'setSinkId' in audioRef.current) {
      (audioRef.current as any).setSinkId(sinkId).catch((e: any) => console.error("SinkId error", e));
    }
  }, [sinkId]);

  return <audio ref={audioRef} autoPlay muted={false} style={{ display: 'none' }} />;
};

export const BusStrip: React.FC<{ bus: Bus, outputs: MediaDeviceInfo[], onRemove: () => void, onUpdate: () => void }> = ({ bus, outputs, onRemove, onUpdate }) => {
   const level = useVU(bus.analyser);
   const [vol, setVol] = useState(bus.volume);
   const [sink, setSink] = useState('default');

   const handleVol = (v: number) => {
       setVol(v);
       globalEngine.setBusVolume(bus.id, v);
   };

   return (
       <div className="flex flex-col items-center justify-end h-full gap-4 w-[100px] border-r border-border-dark pr-4 shrink-0 relative group">
          <button onClick={onRemove} className="absolute top-2 right-2 text-text-secondary hover:text-accent-danger opacity-0 group-hover:opacity-100 transition-opacity z-20">
             <X size={14} />
          </button>
          
          <AudioSinkPlayer stream={bus.dest.stream} sinkId={sink} />

          <div className="flex flex-col items-center gap-1 w-full text-center border-b border-border-dark pb-2 mb-auto">
              <div className="text-[11px] font-bold text-text-primary uppercase tracking-wider truncate w-full px-1">{bus.name}</div>
              <div className="text-[9px] font-mono text-text-secondary uppercase">OUTPUT</div>
          </div>
          
          <select 
             value={sink} 
             onChange={e => setSink(e.target.value)}
             className="w-full text-[9px] font-mono bg-bg-card text-text-secondary p-1 border border-border-dark rounded-sm outline-none shrink-0"
          >
            <option value="default">SYS DEFAULT</option>
            {outputs.map(o => <option key={o.deviceId} value={o.deviceId} className="truncate">{o.label || 'Unknown Output'}</option>)}
          </select>
          
          <div className="flex justify-center items-center gap-3 h-[160px] w-full">
            <VUMeter level={level} />
            <VerticalFader value={vol} onChange={handleVol} max={1.5} />
          </div>
          
          <div className="flex gap-1 font-mono text-[9px] w-full mt-1 shrink-0 h-5 px-3">
             <button 
                onClick={() => { globalEngine.toggleSolo(bus.id, true); onUpdate(); }}
                className={`flex-1 rounded-sm border transition-colors font-bold ${bus.solo ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-bg-deep border-border-dark text-text-secondary hover:border-accent-active'}`}
             >
                 S
             </button>
             <button 
                onClick={() => { globalEngine.toggleMono(bus.id, true); onUpdate(); }}
                className={`flex-[2] rounded-sm border transition-colors font-bold tracking-tighter ${bus.mono ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-bg-deep border-border-dark text-text-secondary hover:border-accent-active'}`}
             >
                 MONO
             </button>
          </div>
       </div>
   );
}

export const MasterStrip: React.FC<{ outputs: MediaDeviceInfo[], buses: Bus[], onRemoveBus: (id: string) => void, onUpdate: () => void }> = ({ outputs, buses, onRemoveBus, onUpdate }) => {
  const [masterVol, setMasterVol] = useState(1);
  const masterLevel = useVU(globalEngine.masterAnalyser);
  
  const handleMaster = (v: number) => {
    setMasterVol(v);
    globalEngine.setBusVolume('master', v);
  };

  return (
    <div className="flex bg-bg-surface p-6 gap-6 h-full z-10 relative shrink-0">
      
      {/* Buses */}
      {buses.map(bus => (
         <BusStrip key={bus.id} bus={bus} outputs={outputs} onRemove={() => onRemoveBus(bus.id)} onUpdate={onUpdate} />
      ))}

      {/* Master */}
      <div className="flex flex-col items-center justify-end h-full gap-4 w-[110px] bg-[rgba(0,255,156,0.02)] rounded-lg p-2 border border-accent-glow shrink-0 ml-2">
        <div className="flex flex-col items-center gap-1 w-full text-center border-b border-border-dark pb-2 mb-auto">
            <div className="text-[11px] font-bold text-accent-glow uppercase tracking-wider">MASTER</div>
            <div className="text-[9px] font-mono text-accent-glow/70 uppercase">MIXDOWN</div>
        </div>
        <div className="flex justify-center items-center gap-3 w-full h-[160px]">
          <div className="flex gap-1 h-full">
            <VUMeter level={masterLevel} />
            <VUMeter level={masterLevel * 0.95} /> 
          </div>
          <VerticalFader value={masterVol} onChange={handleMaster} max={1.5} />
        </div>
        
        <div className="flex justify-center w-full mt-1 h-5 px-5">
             <button 
                onClick={() => { globalEngine.toggleMono('master', true); onUpdate(); }}
                className={`w-full rounded-sm border transition-colors font-mono font-bold text-[9px] tracking-tighter ${globalEngine.masterMono ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-[rgba(0,255,156,0.05)] border-accent-glow/30 text-accent-glow/70 hover:border-accent-glow'}`}
             >
                 MONO
             </button>
        </div>
      </div>
    </div>
  );
};
