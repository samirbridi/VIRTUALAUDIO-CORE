// @ts-ignore
import * as lamejs from 'lamejs';

function interleave(buffer: AudioBuffer) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const result = new Float32Array(length * numChannels);
    
    if (numChannels === 1) {
        result.set(buffer.getChannelData(0));
    } else {
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < length; i++) {
            result[i * 2] = left[i];
            result[i * 2 + 1] = right[i];
        }
    }
    return result;
}

function floatTo16BitInt(samples: Float32Array, bigEndian: boolean = false) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(i * 2, int16, !bigEndian);
    }
    return buffer;
}

export function encodeWAV(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const interleaved = interleave(buffer);
    const pcm16 = floatTo16BitInt(interleaved, false);
    const dataSize = pcm16.byteLength;
    
    const arrayBuffer = new ArrayBuffer(44);
    const view = new DataView(arrayBuffer);
    
    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    return new Blob([arrayBuffer, pcm16], { type: 'audio/wav' });
}

export function encodeAIFF(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const interleaved = interleave(buffer);
    const pcm16 = floatTo16BitInt(interleaved, true); // Big endian for AIFF
    const dataSize = pcm16.byteLength;
    const numSampleFrames = interleaved.length / numChannels;

    const arrayBuffer = new ArrayBuffer(54);
    const view = new DataView(arrayBuffer);
    
    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'FORM');
    view.setUint32(4, 46 + dataSize, false);
    writeString(view, 8, 'AIFF');

    writeString(view, 12, 'COMM');
    view.setUint32(16, 18, false); // Length
    view.setUint16(20, numChannels, false);
    view.setUint32(22, numSampleFrames, false);
    view.setUint16(26, 16, false); // bits per sample

    // AIFF 80-bit Extended Float for Sample Rate
    let exp = Math.floor(Math.log2(sampleRate));
    let mathExp = exp + 16383;
    view.setUint16(28, mathExp, false);
    let m = sampleRate * Math.pow(2, 63 - exp);
    let mHi = Math.floor(m / 0x100000000);
    let mLo = m >>> 0;
    view.setUint32(30, mHi, false);
    view.setUint32(34, mLo, false);

    writeString(view, 38, 'SSND');
    view.setUint32(42, 8 + dataSize, false);
    view.setUint32(46, 0, false);
    view.setUint32(50, 0, false);

    return new Blob([arrayBuffer, pcm16], { type: 'audio/aiff' });
}

export function encodeMP3(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const kbps = 192; 
    
    const interleaved = interleave(buffer);
    const pcm16Buffer = floatTo16BitInt(interleaved, false);
    const pcm16 = new Int16Array(pcm16Buffer);

    // lamejs expects raw instances, mapping to the default export structure if necessary
    const Mp3Encoder = lamejs.Mp3Encoder || (lamejs as any).default?.Mp3Encoder;
    if (!Mp3Encoder) throw new Error("MP3 Encoder not found");

    const mp3encoder = new Mp3Encoder(numChannels, sampleRate, kbps);
    const mp3Data: Int8Array[] = [];

    const sampleBlockSize = 1152; // Needs to be multiple of 576
    let left: Int16Array;
    let right: Int16Array;

    if (numChannels === 1) {
        left = pcm16;
        right = new Int16Array(0);
    } else {
        left = new Int16Array(pcm16.length / 2);
        right = new Int16Array(pcm16.length / 2);
        for (let i = 0; i < pcm16.length; i += 2) {
            left[i / 2] = pcm16[i];
            right[i / 2] = pcm16[i + 1];
        }
    }

    for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize);
        const rightChunk = right.length > 0 ? right.subarray(i, i + sampleBlockSize) : undefined;
        const mp3buf = rightChunk ? mp3encoder.encodeBuffer(leftChunk, rightChunk) : mp3encoder.encodeBuffer(leftChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
}
