import { useRef, useEffect, useState } from 'react';

import { encodeWAV, encodeAIFF, encodeMP3 } from './audioExport';

export interface Bus {
  id: string;
  name: string;
  fader: GainNode;
  soloNode: GainNode;
  dest: MediaStreamAudioDestinationNode;
  analyser: AnalyserNode;
  volume: number;
  solo: boolean;
  mono: boolean;
}

export interface AudioChannel {
  id: string;
  name: string;
  sourceStream?: MediaStream;
  sourceNode?: MediaStreamAudioSourceNode;
  inputSelectorNode: GainNode; // We connect dynamic sources here
  gainNode: GainNode;
  soloNode: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  analyser: AnalyserNode;
  splitter: GainNode; 
  sends: Map<string, GainNode>; // busId (or 'master') -> GainNode
  muted: boolean;
  volume: number; 
  solo: boolean;
  mono: boolean;
  eq: { low: number; mid: number; high: number }; 
  routedTo: Set<string>; // Set of busIds
  sourceId: string; // 'none', 'app', or deviceId
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  channels: Map<string, AudioChannel> = new Map();
  buses: Map<string, Bus> = new Map();
  
  masterFader!: GainNode;
  masterAnalyser!: AnalyserNode;
  masterDest!: MediaStreamAudioDestinationNode;
  masterMono: boolean = false;

  recorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];

  init(numInputs = 6, numBuses = 6) {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    // Setup Master
    this.masterFader = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterDest = this.ctx.createMediaStreamDestination();
    this.masterFader.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.masterDest);
    this.masterAnalyser.connect(this.ctx.destination); // Default output

    // Create custom buses
    for (let i = 1; i <= numBuses; i++) {
        this.createBus(`bus${i}`, `Bus ${i}`);
    }

    // Create default channels
    for (let i = 1; i <= numInputs; i++) {
        this.createChannel(`VIRTUAL IN ${i}`);
    }
  }

  createBus(id: string, name: string) {
    if (!this.ctx) return;
    const fader = this.ctx.createGain();
    const soloNode = this.ctx.createGain();
    const dest = this.ctx.createMediaStreamDestination();
    const analyser = this.ctx.createAnalyser();
    
    fader.connect(analyser);
    analyser.connect(soloNode);
    soloNode.connect(dest);
    
    this.buses.set(id, { id, name, fader, soloNode, dest, analyser, volume: 1.0, solo: false, mono: false });

    // Wire up existing channels to this new bus
    this.channels.forEach(ch => {
        const send = this.ctx!.createGain();
        send.gain.value = ch.routedTo.has(id) ? 1 : 0;
        ch.splitter.connect(send);
        send.connect(fader);
        ch.sends.set(id, send);
    });
  }

  createChannel(name: string) {
    if (!this.ctx) return null;
    const id = Math.random().toString(36).substring(7);
    
    const inputSelectorNode = this.ctx.createGain();
    const eqLow = this.ctx.createBiquadFilter();
    eqLow.type = 'lowshelf'; eqLow.frequency.value = 320;
    
    const eqMid = this.ctx.createBiquadFilter();
    eqMid.type = 'peaking'; eqMid.frequency.value = 1000;
    
    const eqHigh = this.ctx.createBiquadFilter();
    eqHigh.type = 'highshelf'; eqHigh.frequency.value = 3200;

    const gainNode = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    const soloNode = this.ctx.createGain();
    const splitter = this.ctx.createGain(); 
    
    // Wire internal graph
    inputSelectorNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(soloNode);
    soloNode.connect(splitter);
    
    // Create Sends
    const sends = new Map<string, GainNode>();
    
    // Master send
    const masterSend = this.ctx.createGain();
    masterSend.gain.value = 1; // routed by default
    splitter.connect(masterSend);
    masterSend.connect(this.masterFader);
    sends.set('master', masterSend);

    const routedTo = new Set<string>();
    routedTo.add('master');

    // Bus sends
    this.buses.forEach((bus, busId) => {
        const send = this.ctx!.createGain();
        send.gain.value = 0; // inactive by default
        splitter.connect(send);
        send.connect(bus.fader);
        sends.set(busId, send);
    });

    const channel: AudioChannel = {
      id, name, inputSelectorNode, gainNode, soloNode, eqLow, eqMid, eqHigh, analyser,
      splitter, sends, muted: false, solo: false, mono: false, volume: 1.0, sourceId: 'none',
      eq: { low: 0, mid: 0, high: 0 }, routedTo
    };
    
    this.channels.set(id, channel);
    return id;
  }

  // Swap devices dynamically on a channel (Voicemeeter style)
  async setChannelSource(channelId: string, deviceId: string) {
    const ch = this.channels.get(channelId);
    if (!ch || !this.ctx) return;

    // Clean up old
    if (ch.sourceStream) {
        ch.sourceStream.getTracks().forEach(t => t.stop());
        ch.sourceNode?.disconnect();
    }

    ch.sourceId = deviceId;

    if (deviceId === 'none') {
        ch.sourceStream = undefined;
        ch.sourceNode = undefined;
        return;
    }

    try {
      let stream: MediaStream;
      if (deviceId === 'app') {
          stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
          stream.getVideoTracks().forEach(track => track.stop());
      } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      }

      ch.sourceStream = stream;
      ch.sourceNode = this.ctx.createMediaStreamSource(stream);
      ch.sourceNode.connect(ch.inputSelectorNode);
    } catch(err) {
      console.warn("Failed to set channel source", err);
      ch.sourceId = 'none'; // reset on fail
    }
  }

  setVolume(id: string, vol: number) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.volume = vol;
    if (!ch.muted) ch.gainNode.gain.setValueAtTime(vol, this.ctx!.currentTime);
  }

  setBusVolume(id: string, vol: number) {
    if (id === 'master') {
       this.masterFader.gain.setValueAtTime(vol, this.ctx!.currentTime);
       return;
    }
    const bus = this.buses.get(id);
    if (bus) {
       bus.volume = vol;
       bus.fader.gain.setValueAtTime(vol, this.ctx!.currentTime);
    }
  }

  setMute(id: string, muted: boolean) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.muted = muted;
    ch.gainNode.gain.setValueAtTime(muted ? 0 : ch.volume, this.ctx!.currentTime);
  }

  setEQ(id: string, band: 'low'|'mid'|'high', val: number) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.eq[band] = val;
    if (band === 'low') ch.eqLow.gain.setValueAtTime(val, this.ctx!.currentTime);
    if (band === 'mid') ch.eqMid.gain.setValueAtTime(val, this.ctx!.currentTime);
    if (band === 'high') ch.eqHigh.gain.setValueAtTime(val, this.ctx!.currentTime);
  }

  setRouting(id: string, busId: string, active: boolean) {
    const ch = this.channels.get(id);
    if (!ch) return;
    
    if (active) ch.routedTo.add(busId);
    else ch.routedTo.delete(busId);
    
    const send = ch.sends.get(busId);
    if (send) {
        send.gain.setValueAtTime(active ? 1 : 0, this.ctx!.currentTime);
    }
  }

  toggleSolo(id: string, isBus: boolean) {
    if (!this.ctx) return;
    if (isBus) {
      if (id === 'master') return;
      const target = this.buses.get(id);
      if (!target) return;
      target.solo = !target.solo;
      const anySolo = Array.from(this.buses.values()).some(b => b.solo);
      this.buses.forEach(b => {
          b.soloNode.gain.setValueAtTime((!anySolo || b.solo) ? 1 : 0, this.ctx!.currentTime);
      });
    } else {
      const target = this.channels.get(id);
      if (!target) return;
      target.solo = !target.solo;
      const anySolo = Array.from(this.channels.values()).some(c => c.solo);
      this.channels.forEach(c => {
          c.soloNode.gain.setValueAtTime((!anySolo || c.solo) ? 1 : 0, this.ctx!.currentTime);
      });
    }
  }

  toggleMono(id: string, isBus: boolean) {
    if (isBus) {
      if (id === 'master') {
        this.masterMono = !this.masterMono;
        this.masterFader.channelCount = this.masterMono ? 1 : 2;
        this.masterFader.channelCountMode = this.masterMono ? 'explicit' : 'max';
        return;
      }
      const target = this.buses.get(id);
      if(!target) return;
      target.mono = !target.mono;
      target.fader.channelCount = target.mono ? 1 : 2;
      target.fader.channelCountMode = target.mono ? 'explicit' : 'max';
    } else {
      const target = this.channels.get(id);
      if(!target) return;
      target.mono = !target.mono;
      target.gainNode.channelCount = target.mono ? 1 : 2;
      target.gainNode.channelCountMode = target.mono ? 'explicit' : 'max';
    }
  }

  removeChannel(id: string) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.sourceStream?.getTracks().forEach(t => t.stop());
    ch.sourceNode?.disconnect();
    this.channels.delete(id);
  }

  removeBus(id: string) {
    const bus = this.buses.get(id);
    if (!bus) return;

    // Disconnect sends from all channels to this bus
    this.channels.forEach(ch => {
      const send = ch.sends.get(id);
      if (send) {
        try { send.disconnect(); } catch (e) {}
        ch.sends.delete(id);
      }
      ch.routedTo.delete(id);
    });

    try { bus.fader.disconnect(); } catch(e) {}
    try { bus.analyser.disconnect(); } catch(e) {}
    
    this.buses.delete(id);
  }

  startRecording() {
    if (!this.masterDest) return false;
    this.recordedChunks = [];
    try {
        this.recorder = new MediaRecorder(this.masterDest.stream, { mimeType: 'audio/webm;codecs=opus' });
    } catch(e) {
        this.recorder = new MediaRecorder(this.masterDest.stream);
    }
    
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.recorder.start();
    return true;
  }

  stopRecording(format: 'webm' | 'wav' | 'aiff' | 'mp3'): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
        if (!this.recorder || this.recorder.state !== 'recording') return resolve(null);
        
        this.recorder.onstop = async () => {
            try {
                const baseBlob = new Blob(this.recordedChunks, { type: this.recorder!.mimeType });
                
                if (format === 'webm') {
                   return resolve(baseBlob);
                }

                // Decode audio data securely
                const arrayBuffer = await baseBlob.arrayBuffer();
                let audioBuf: AudioBuffer;
                
                // Polyfill for decoding since webkit offline context isn't always reliable
                try {
                    audioBuf = await this.ctx!.decodeAudioData(arrayBuffer);
                } catch(e) {
                    const tempCtx = new AudioContext(); // throwaway
                    audioBuf = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
                    tempCtx.close();
                }

                let finalBlob: Blob;
                if (format === 'wav') finalBlob = encodeWAV(audioBuf);
                else if (format === 'aiff') finalBlob = encodeAIFF(audioBuf);
                else if (format === 'mp3') finalBlob = encodeMP3(audioBuf);
                else finalBlob = baseBlob;
                
                resolve(finalBlob);
            } catch (err) {
                console.error("Audio Encoding Failed", err);
                reject(err);
            }
        };
        
        this.recorder.stop();
        this.recorder = null;
    });
  }

  close() {
    this.channels.forEach(ch => this.removeChannel(ch.id));
    if (this.ctx) this.ctx.close();
  }
}

export const globalEngine = new AudioEngine();
