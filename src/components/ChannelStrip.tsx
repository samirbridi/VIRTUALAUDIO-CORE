import { Mic, Monitor, Volume2, Settings, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import { globalEngine, AudioChannel } from '../lib/audioManager';
import { Knob, VerticalFader, VUMeter, useVU } from './uiControls';

export const ChannelStrip: React.FC<{
  channel: AudioChannel;
  inputs: MediaDeviceInfo[];
  buses: Array<{id: string, name: string}>;
  onUpdate: () => void;
  onRemove: () => void;
}> = ({ channel, inputs, buses, onUpdate, onRemove }) => {
  const level = useVU(channel.analyser);

  const [vol, setVol] = useState(channel.volume);
  const [eq, setEq] = useState(channel.eq);
  const [muted, setMuted] = useState(channel.muted);
  
  // Track forced re-render for routing and sources
  const [, setTick] = useState(0);

  const handleVol = (v: number) => {
    setVol(v);
    globalEngine.setVolume(channel.id, v);
  };

  const handleEq = (band: 'low'|'mid'|'high', v: number) => {
    const newEq = { ...eq, [band]: v };
    setEq(newEq);
    globalEngine.setEQ(channel.id, band, v);
  };

  const handleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    globalEngine.setMute(channel.id, newMuted);
  };

  const handleRouting = (busId: string) => {
    const active = !channel.routedTo.has(busId);
    globalEngine.setRouting(channel.id, busId, active);
    setTick(t=>t+1);
  };

  const handleSourceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    await globalEngine.setChannelSource(channel.id, val);
    setTick(t=>t+1);
  };

  return (
    <div className="flex flex-col bg-bg-card border border-border-dark w-[140px] shrink-0 p-3 rounded-lg items-center relative group transition-colors">
      <button onClick={onRemove} className="absolute top-2 right-2 text-text-secondary hover:text-accent-danger opacity-0 group-hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>

      {/* Header / Input Selector */}
      <div className="flex flex-col items-center gap-1 w-full border-b border-border-dark pb-2 mb-3">
        <div className="text-[11px] font-bold text-text-primary uppercase tracking-wider truncate px-1 text-center w-full">
          {channel.name}
        </div>
        <select 
          value={channel.sourceId}
          onChange={handleSourceChange}
          className="w-full mt-1 text-[9px] font-mono bg-bg-deep text-text-secondary p-1 border border-border-dark rounded-sm outline-none cursor-pointer hover:border-accent-active truncate"
        >
           <option value="none">- NO SOURCE -</option>
           <option value="app">🖥️ APP AUDIO</option>
           <optgroup label="Hardware Devices">
               {inputs.map(i => <option key={i.deviceId} value={i.deviceId}>🎧 {i.label || 'Unknown Device'}</option>)}
           </optgroup>
        </select>
      </div>

      {/* Routing */}
      <div className="grid grid-cols-2 gap-1 w-full mb-3">
        <RoutingButton active={channel.routedTo.has('master')} label="MAS" onClick={() => handleRouting('master')} />
        {buses.map(bus => (
           <RoutingButton 
             key={bus.id} 
             active={channel.routedTo.has(bus.id)} 
             label={bus.name.replace('Bus ', 'B')} 
             onClick={() => handleRouting(bus.id)} 
           />
        ))}
      </div>

      {/* EQ */}
      <div className="flex flex-col gap-3 py-2 border-y border-border-dark w-full items-center mb-3">
        <Knob label="High" min={-24} max={24} value={eq.high} onChange={(v) => handleEq('high', v)} />
        <Knob label="Mid" min={-24} max={24} value={eq.mid} onChange={(v) => handleEq('mid', v)} />
        <Knob label="Low" min={-24} max={24} value={eq.low} onChange={(v) => handleEq('low', v)} />
      </div>

      {/* Fader & Meter */}
      <div className="flex justify-center items-center gap-3 h-[160px] w-full">
        <VUMeter level={level} />
        <VerticalFader value={vol} onChange={handleVol} min={0} max={1.5} />
      </div>

      {/* Toggles */}
      <div className="flex gap-1 font-mono text-[9px] w-full mt-3 h-5">
         <button 
            onClick={handleMute}
            className={`flex-[1.5] rounded-sm border transition-colors font-bold ${muted ? 'bg-accent-danger border-accent-danger text-white' : 'bg-bg-deep border-border-dark text-text-secondary hover:border-accent-active'}`}
         >
             M
         </button>
         <button 
            onClick={() => { globalEngine.toggleSolo(channel.id, false); onUpdate(); }}
            className={`flex-[1.5] rounded-sm border transition-colors font-bold ${channel.solo ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-bg-deep border-border-dark text-text-secondary hover:border-accent-active'}`}
         >
             S
         </button>
         <button 
            onClick={() => { globalEngine.toggleMono(channel.id, false); onUpdate(); }}
            className={`flex-[2] rounded-sm border transition-colors font-bold tracking-tighter ${channel.mono ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-bg-deep border-border-dark text-text-secondary hover:border-accent-active'}`}
         >
             MONO
         </button>
      </div>
    </div>
  );
};

const RoutingButton = ({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`text-[9px] font-mono py-1 rounded-sm transition-all border
      ${active ? 'border-accent-glow text-accent-glow bg-[rgba(0,255,156,0.05)]' : 'bg-bg-deep border-border-dark text-text-secondary hover:border-accent-active'}
    `}
  >
    {label}
  </button>
);
