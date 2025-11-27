// Utility helpers for audio handling used by the TTS flow.

export const base64ToArrayBuffer = (base64) => {
    // Accept and decode base64 (no data: prefix)
    const cleaned = base64.replace(/\s/g, '');
    const binary = typeof atob !== 'undefined' ? atob(cleaned) : Buffer.from(cleaned, 'base64').toString('binary');
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

/**
 * Convert PCM 16-bit (Int16Array) to a WAV Blob.
 * @param {Int16Array} pcm16Data - PCM 16-bit samples
 * @param {number} sampleRate - audio sample rate, e.g. 16000
 * @returns {Blob} - WAV audio blob (audio/wav)
 */
export const pcmToWav = (pcm16Data, sampleRate = 16000) => {
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const dataSize = pcm16Data.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let offset = 0;

    // RIFF identifier
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataSize, true); offset += 4; // file length - 8
    writeString(view, offset, 'WAVE'); offset += 4;

    // fmt chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
    view.setUint16(offset, 1, true); offset += 2; // audio format = PCM
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bytesPerSample * 8, true); offset += 2;

    // data chunk
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4;

    // write PCM samples (little endian)
    for (let i = 0; i < pcm16Data.length; i++, offset += 2) {
        view.setInt16(offset, pcm16Data[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
};

const writeString = (view, offset, str) => {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
};