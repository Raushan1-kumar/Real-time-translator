// src/hooks/useSpeechAndTranslation.js
import { useCallback, useRef } from 'react';
import { TEXT_API_URL, TTS_API_URL, SAMPLE_RATE } from '../config/api';
import { base64ToArrayBuffer, pcmToWav } from '../utils/audioUtils';

/**
 * Custom hook to handle translation (MT) and text-to-speech (TTS) via Gemini APIs.
 * @param {string} targetLang - The target language for translation.
 * @param {function} addLog - Function to add an entry to the conversation log.
 * @param {function} setFloatingText - Function to update the main display text.
 * @param {boolean} isListening - Current listening state from the App component.
 * @returns {function} translateAndSpeak - The function to call with the source text and sequence.
 */
const useTranslationAndSpeech = (targetLang, addLog, setFloatingText, isListening) => {
    const fetchWithRetry = useCallback(async (url, payload, retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`API Request failed with status ${response.status}: ${errorBody}`);
                }
                return await response.json();
            } catch (error) {
                if (i === retries - 1) {
                    addLog('error', `API Call failed after ${retries} attempts. ${error.message}`);
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, delay * (2 ** i)));
            }
        }
    }, [addLog]);

    // Playback queue ensures audio plays in sequence order and avoids overlapping playback
    const playbackQueueRef = useRef([]); // each item: { seq, translatedText, audioUrl }
    const isPlayingRef = useRef(false);

    const playNext = useCallback(() => {
        if (isPlayingRef.current || playbackQueueRef.current.length === 0) return;
        // ensure we play in order by seq
        playbackQueueRef.current.sort((a, b) => a.seq - b.seq);
        const next = playbackQueueRef.current.shift();
        if (!next) {
            isPlayingRef.current = false;
            return;
        }

        isPlayingRef.current = true;
        const audio = new Audio(next.audioUrl);

        audio.oncanplay = () => {
            audio.play().catch(err => {
                console.error("Playback play() rejected:", err);
                addLog('error', `Playback error for seq ${next.seq}`);
            });
        };

        audio.onerror = (e) => {
            console.error("Audio Playback Error:", e);
            addLog('error', `Failed to play audio seq ${next.seq}`);
            isPlayingRef.current = false;
            // continue queue
            setTimeout(() => playNext(), 200);
        };

        audio.onended = () => {
            isPlayingRef.current = false;
            addLog('translation-audio', `Finished playing seq ${next.seq}`, `Played audio for ${targetLang}`);
            // after finishing audio, update floating text
            setFloatingText(`Translated: "${next.translatedText}"`);
            setTimeout(() => {
                if (isListening) {
                    setFloatingText("Listening...");
                } else {
                    setFloatingText("Ready for the next sentence...");
                }
            }, 1500);
            // continue with queued audio
            setTimeout(() => playNext(), 100);
        };
    }, [addLog, setFloatingText, isListening, targetLang]);

    const translateAndSpeak = useCallback(async (sourceText, seq = 0) => {
        try {
            // Avoid sending very small chunks
            if (!sourceText || sourceText.trim().length < 2) {
                addLog('info', 'Skipped tiny or empty chunk.');
                return;
            }

            // 1. Text Translation (MT)
            setFloatingText("Translating...");

            const translationPrompt = `Translate the following text into ${targetLang}. Only provide the translated text and nothing else. TEXT: "${sourceText}"`;
            const textPayload = {
                contents: [{ parts: [{ text: translationPrompt }] }],
                systemInstruction: { parts: [{ text: "You are a specialized, real-time translator. Your only job is to provide the requested translation and nothing else." }] }
            };

            let translatedText = '';
            const textResult = await fetchWithRetry(TEXT_API_URL, textPayload);

            translatedText = textResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Translation Failed.';
            
            // Update UI immediately
            setFloatingText(translatedText);
            addLog('translation-text', translatedText, `Translated to ${targetLang} (seq ${seq})`);


            // // 2. Text-to-Speech (TTS)
            // const ttsConfig = {
            //     voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } // Professional voice
            // };

            // const ttsPayload = {
            //     contents: [{ parts: [{ text: translatedText }] }],
            //     generationConfig: {
            //         responseModalities: ["AUDIO"],
            //         speechConfig: ttsConfig,
            //     },
            //     model: "gemini-2.5-flash-preview-tts"
            // };

            // const ttsResult = await fetchWithRetry(TTS_API_URL, ttsPayload);

            // const audioPart = ttsResult?.candidates?.[0]?.content?.parts?.[0];
            // const base64Audio = audioPart?.inlineData?.data;

            // if (!base64Audio) {
            //     addLog('error', `TTS API Error: No audio data received for seq ${seq}.`);
            //     return;
            // }

            // 3. Audio Preparation and enqueue for sequential playback
            // const pcmDataBuffer = base64ToArrayBuffer(base64Audio);
            // const pcm16 = new Int16Array(pcmDataBuffer);
            // const wavBlob = pcmToWav(pcm16, SAMPLE_RATE);
            // const audioUrl = URL.createObjectURL(wavBlob);
            
            // // push into queue and start playback if idle
            // playbackQueueRef.current.push({ seq, translatedText, audioUrl });
            // addLog('translation-audio', `Queued translation audio seq ${seq}`, `Queue length: ${playbackQueueRef.current.length}`);
            // playNext();
            
        } catch (error) {
            console.error("Translation/TTS Process Error:", error);
            setFloatingText("API Process Error. Check log.");
            addLog('error', `Translation/TTS error (seq ${seq}): ${error.message}`);
        }
    }, [addLog, fetchWithRetry, targetLang, setFloatingText, isListening]);

    return translateAndSpeak;
};

export default useTranslationAndSpeech;