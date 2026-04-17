import React, { useState, useEffect, useRef } from 'react';
import { globalEngine } from '../lib/audioManager';

// Custom Hook to manage animations/VU
export function useVU(analyser?: AnalyserNode) {
  const [level, setLevel] = useState(0);
  const reqRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser) return;
    const array = new Uint8Array(analyser.frequencyBinCount);
    
    const update = () => {
      analyser.getByteTimeDomainData(array);
      let sum = 0;
      for (let i = 0; i < array.length; i++) {
        const val = (array[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / array.length);
      // amplify slightly for visual effect
      const visuallyScaled = Math.min(1, rms * 5); 
      setLevel(visuallyScaled);
      reqRef.current = requestAnimationFrame(update);
    };
    
    reqRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(reqRef.current);
  }, [analyser]);

  return level;
}

export function useAudioDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // trigger permission
        const lists = await navigator.mediaDevices.enumerateDevices();
        setDevices(lists);
      } catch (err) {
        console.error("Audio devices restricted", err);
      }
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, []);

  return {
    inputs: devices.filter(d => d.kind === 'audioinput'),
    outputs: devices.filter(d => d.kind === 'audiooutput')
  };
}

// Components
export const VUMeter: React.FC<{ level: number }> = ({ level }) => {
  const heightPrc = Math.max(0, Math.min(100, level * 100));
  const isClipping = level > 0.95;
  return (
    <div className="w-2.5 h-[160px] bg-black p-[2px] rounded-sm overflow-hidden relative flex flex-col justify-end">
      <div 
        className={`w-full transition-all duration-75 ease-out rounded-[1px] opacity-90 ${isClipping ? 'bg-accent-danger' : 'bg-accent-glow'}`}
        style={{ height: `${heightPrc}%` }}
      />
      <div className="absolute inset-0 vu-meter-bars pointer-events-none" />
    </div>
  );
};

export const VerticalFader: React.FC<{
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
}> = ({ value, onChange, min = 0, max = 1.5 }) => {
  return (
    <div className="relative h-[160px] w-8 flex justify-center items-center">
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={0.01} 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-[160px] h-8 appearance-none bg-transparent outline-none origin-center -rotate-90 slider-thumb-styled fader-track-styled cursor-pointer"
      />
    </div>
  );
};

export const Knob: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
}> = ({ label, value, onChange, min, max }) => {
  const prc = (value - min) / (max - min);
  const rot = -135 + (prc * 270); // Sweep from -135deg to +135deg
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[10px] text-text-secondary font-mono font-bold uppercase tracking-wider">{label}</div>
      <div className="relative w-8 h-8 rounded-full bg-bg-deep border border-border-dark group cursor-pointer shadow-inner">
         <input 
            type="range" min={min} max={max} step={0.1} value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
         />
         <div 
            className="absolute top-1/2 left-1/2 w-[1.5px] h-3.5 bg-text-primary origin-[50%_0%] pointer-events-none transition-transform duration-75"
            style={{ transform: `rotate(${rot}deg)` }}
         />
      </div>
      <div className="text-[9px] text-text-secondary font-mono">{value > 0 ? '+' : ''}{value.toFixed(1)}</div>
    </div>
  );
}
