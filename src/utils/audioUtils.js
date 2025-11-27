// src/utils/audioUtils.js
import { SAMPLE_RATE, NUM_CHANNELS, BIT_DEPTH } from '../config/api';

/**
 * Converts a Base64 encoded string to an ArrayBuffer.
 * @param {string} base64 - Base64 encoded string.
 * @returns {ArrayBuffer}
 */
export const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

/**
 * Converts 16-bit PCM audio data to a WAV Blob.
 * @param {Int16Array} pcm16 - 16-bit PCM audio data.
 * @param {number} sampleRate - The sample rate of the audio.
 * @returns {Blob} The WAV audio Blob.
 */
export const pcmToWav = (pcm16, sampleRate) => {
    const numSamples = pcm16.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    let offset = 0;

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // RIFF chunk descriptor
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + numSamples * 2, true); offset += 4; // ChunkSize
    writeString(view, offset, 'WAVE'); offset += 4;

    // fmt sub-chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size (16 for PCM)
    view.setUint16(offset, 1, true); offset += 2; // AudioFormat (1 for PCM)
    view.setUint16(offset, NUM_CHANNELS, true); offset += 2; // NumChannels
    view.setUint32(offset, sampleRate, true); offset += 4; // SampleRate
    view.setUint32(offset, sampleRate * NUM_CHANNELS * (BIT_DEPTH / 8), true); offset += 4; // ByteRate
    view.setUint16(offset, NUM_CHANNELS * (BIT_DEPTH / 8), true); offset += 2; // BlockAlign
    view.setUint16(offset, BIT_DEPTH, true); offset += 2; // BitsPerSample

    // data sub-chunk
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, numSamples * 2, true); offset += 4; // Subchunk2Size

    // Write PCM data
    for (let i = 0; i < numSamples; i++) {
        view.setInt16(offset, pcm16[i], true); offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
};