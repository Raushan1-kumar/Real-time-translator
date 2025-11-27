import React, { useState, useEffect, useCallback, useRef } from 'react';

// ****************************************************************************
// NOTE: When running on your personal laptop, replace the empty string below 
// with your actual Google AI or Google Cloud API Key.
// 
// For running inside this Canvas environment, we keep it empty.
// ****************************************************************************
const API_KEY = "AIzaSyALxHWewA-Pr7hj765fzjc66k1gDTvStXk"; 

const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;

// Constants for TTS Audio Processing
const SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;
const BIT_DEPTH = 16;

// Utility functions (defined outside the component to avoid re-creation on render)
const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcm16, sampleRate) => {
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

// Component for a single log entry
const LogEntry = ({ type, text, source, timestamp }) => {
    let colorClasses = '';
    let icon = '';

    switch (type) {
        case 'input':
            colorClasses = 'text-green-700 bg-green-100';
            icon = '🎤';
            break;
        case 'translation-text':
            colorClasses = 'text-blue-700 bg-blue-100';
            icon = '📝';
            break;
        case 'translation-audio':
            colorClasses = 'text-purple-700 bg-purple-100';
            icon = '🔊';
            break;
        case 'error':
            colorClasses = 'text-red-700 bg-red-100';
            icon = '❌';
            break;
        default:
            colorClasses = 'text-gray-600 bg-gray-50';
            icon = 'ℹ️';
    }

    return (
        <div className={`p-3 my-2 rounded-lg shadow-sm ${colorClasses}`}>
            <span className="font-bold mr-2 text-sm">{timestamp} {icon}</span>
            <span className="font-medium">{text}</span>
            {source && <span className="text-xs text-gray-500 italic ml-2">({source})</span>}
        </div>
    );
};


// Main Application Component
const App = () => {
    const [isListening, setIsListening] = useState(false);
    const [statusText, setStatusText] = useState('Click to Start Listening');
    // Initialize floating text without checking the hardcoded key placeholder
    const [floatingText, setFloatingText] = useState("Click the microphone to begin translation.");
    const [logHistory, setLogHistory] = useState([]);
    const [sourceLang, setSourceLang] = useState('en-US');
    const [targetLang, setTargetLang] = useState('Spanish');

    const recognitionRef = useRef(null);

    // --- LOGGING ---
    const addLog = useCallback((type, text, source) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogHistory(prev => [
            ...prev, 
            { type, text, source, timestamp, id: Date.now() + Math.random() }
        ]);
    }, []);


    // --- API & FETCH UTILITY ---
    const fetchWithRetry = useCallback(async (url, payload, retries = 3, delay = 1000) => {
        // We rely on the Canvas environment to provide the API key securely.
        // If running locally with an empty key, the API call will fail here naturally.
        
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    // Log potential API errors (e.g., 403 Forbidden if key is missing/invalid)
                    // addLog('error', `API Request failed with status ${response.status}. Check API key if running locally.`);
                    throw new Error(`API Request failed with status ${response.status}: ${errorBody}`);
                }
                return await response.json();
            } catch (error) {
                if (i === retries - 1) throw error;
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay * (2 ** i)));
            }
        }
    }, [addLog]);


    // --- TRANSLATION CORE ---
    const translateAndSpeak = useCallback(async (sourceText) => {
        
        // 1. Text Translation (MT)
        // addLog('status', `Translating from source language to ${targetLang}...`);
        setFloatingText("Translating...");

        const translationPrompt = `Translate the following text into ${targetLang}. Only provide the translated text and nothing else. TEXT: "${sourceText}"`;

        const textPayload = {
            contents: [{ parts: [{ text: translationPrompt }] }],
            systemInstruction: { parts: [{ text: "You are a specialized, real-time translator. Your only job is to provide the requested translation and nothing else." }] }
        };

        let translatedText = '';
        const textResult = await fetchWithRetry(TEXT_API_URL, textPayload);

        if (textResult && !textResult.error) {
            try {
                translatedText = textResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Translation Failed.';
                
                // KEY CHANGE: Update the floating display instantly
                setFloatingText(translatedText);
                addLog('translation-text', translatedText, `Translated to ${targetLang}`);
            } catch (error) {
                console.error("Gemini Translation Error:", error);
                addLog('error', `Translation API Error: Failed to parse response.`);
                setFloatingText("Translation Error.");
                return;
            }
        } else {
            setFloatingText("Translation Failed due to API error. Check the log.");
            return;
        }


        // 2. Text-to-Speech (TTS)
        // addLog('status', `Generating audio for translation...`);

        const ttsConfig = {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } // Professional voice
        };

        const ttsPayload = {
            contents: [{ parts: [{ text: translatedText }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: ttsConfig,
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        const ttsResult = await fetchWithRetry(TTS_API_URL, ttsPayload);

        if (ttsResult && !ttsResult.error) {
            try {
                const audioPart = ttsResult?.candidates?.[0]?.content?.parts?.[0];
                const base64Audio = audioPart?.inlineData?.data;

                if (!base64Audio) {
                    addLog('error', 'TTS API Error: Did not receive audio data.');
                    return;
                }

                // 3. Audio Playback
                const pcmDataBuffer = base64ToArrayBuffer(base64Audio);
                const pcm16 = new Int16Array(pcmDataBuffer);
                const wavBlob = pcmToWav(pcm16, SAMPLE_RATE);
                const audioUrl = URL.createObjectURL(wavBlob);
                
                const audio = new Audio(audioUrl);
                audio.oncanplay = () => {
                    audio.play();
                    addLog('translation-audio', `Playing back translation in ${targetLang}.`, 'Audio ready');
                };
                audio.onerror = (e) => {
                    console.error("Audio Playback Error:", e);
                    addLog('error', 'Failed to play audio translation.');
                };
                audio.onended = () => {
                    // Clear the floating text after the audio is done playing
                    setFloatingText(`Translated: "${translatedText}"`); 
                    setTimeout(() => {
                        if (isListening) {
                           setFloatingText("Listening..."); 
                        } else {
                           setFloatingText("Ready for the next sentence...");
                        }
                    }, 3000);
                }
            } catch (error) {
                console.error("Gemini TTS Error:", error);
                addLog('error', `TTS API Error: ${error.message}`);
            }
        }
    }, [addLog, fetchWithRetry, targetLang, isListening]);

    // --- SPEECH RECOGNITION SETUP (Browser STT) ---
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setStatusText("Error: Speech recognition not supported in this browser. Use Chrome/Edge.");
            return;
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true; 
        recognition.interimResults = false; 

        recognition.onstart = () => {
            setIsListening(true);
            setStatusText(`Listening in ${sourceLang}... Speak now.`);
            setFloatingText("Listening...");
        };

        recognition.onend = () => {
            if (recognitionRef.current.isListening) {
                 // Restart if stopped unexpectedly while state is still "listening"
                recognition.start();
            } else {
                setStatusText("Listening stopped. Click to start.");
                if (floatingText === "Listening...") {
                    setFloatingText("Ready for the next sentence...");
                }
            }
        };
        
        recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
            if (event.error !== 'no-speech') {
                recognition.stop();
                setIsListening(false);
                addLog('error', `Microphone Error: ${event.error}. Please check permissions.`);
                setStatusText("Error occurred. Click to retry.");
                setFloatingText("Error during speech input.");
            }
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript.trim().length > 0) {
                addLog('input', finalTranscript, `Spoken in ${sourceLang}`);
                translateAndSpeak(finalTranscript.trim());
            } else {
                 setFloatingText("Thinking...");
            }
        };

        recognitionRef.current = { recognition, isListening };

        return () => {
            recognition.stop();
        };
    }, [addLog, sourceLang, translateAndSpeak, floatingText]);


    // Sync the recognition state and language settings
    useEffect(() => {
        if (recognitionRef.current) {
            recognitionRef.current.isListening = isListening;
            recognitionRef.current.recognition.lang = sourceLang;
        }
    }, [isListening, sourceLang]);


    const toggleListening = () => {
        // No need for a key check here, relying on fetchWithRetry to handle any auth failure.

        if (isListening) {
            // Stop the listening flag, which triggers recognition.onend logic
            setIsListening(false);
            recognitionRef.current.recognition.stop();
        } else {
            // Start listening
            try {
                recognitionRef.current.recognition.start();
            } catch (e) {
                // Ignore the error if recognition is already running
                if (e.name !== "InvalidStateError") {
                    console.error("Start recognition error:", e);
                }
            }
        }
    };


    return (
        <div className="flex flex-col items-center min-h-screen p-4 bg-gray-50">
            <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-10 w-full lg:w-3/5">
                <h1 className="text-3xl font-extrabold text-gray-800 mb-6 text-center">
                    React Real-Time Interpreter
                </h1>
                <p className="text-center text-sm text-gray-500 mb-8">
                    Uses browser Speech-to-Text, Gemini for Translation, and Gemini TTS for Audio.
                </p>

                {/* Configuration */}
                <div className="flex flex-wrap gap-4 justify-center mb-8">
                    <div className="flex flex-col">
                        <label htmlFor="sourceLang" className="text-sm font-medium text-gray-700 mb-1">Your Speaking Language</label>
                        <select 
                            id="sourceLang" 
                            value={sourceLang} 
                            onChange={(e) => setSourceLang(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            disabled={isListening}
                        >
                            <option value="en-US">English (US)</option>
                            <option value="es-ES">Spanish (Spain)</option>
                            <option value="fr-FR">French (France)</option>
                            <option value="de-DE">German (Germany)</option>
                            <option value="ja-JP">Japanese (Japan)</option>
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="targetLang" className="text-sm font-medium text-gray-700 mb-1">Target Translation Language</label>
                        <select 
                            id="targetLang" 
                            value={targetLang} 
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="English">English</option>
                            <option value="Spanish">Spanish</option>
                            <option value="French">French</option>
                            <option value="German">German</option>
                            <option value="Japanese">Japanese</option>
                        </select>
                    </div>
                </div>

                {/* Floating Translation Output Area */}
                <div 
                    id="floatingTranslation" 
                    className="mb-8 min-h-[100px] flex items-center justify-center text-center border-2 border-blue-500 bg-blue-50 font-bold text-blue-800 rounded-xl p-4 transition-all duration-300 shadow-md"
                    style={{ fontSize: '1.5rem' }}
                >
                    {floatingText}
                </div>

                {/* Microphone Button */}
                <div className="flex flex-col items-center space-y-4">
                    <button 
                        id="micButton" 
                        onClick={toggleListening}
                        className={`mic-button p-6 rounded-full shadow-xl focus:outline-none focus:ring-4 transition-all duration-200 
                            ${isListening 
                                ? 'bg-red-500 hover:bg-red-600 focus:ring-red-300 animate-pulse-red' 
                                : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-300'}`
                        }
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5v3m6-3h1.5m-7.5 0H7.5M12 21.75V3m0 0a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-3 0V4.5A1.5 1.5 0 0 1 12 3Z" />
                        </svg>
                    </button>
                    <p id="statusText" className={`text-lg font-semibold ${isListening ? 'text-red-600' : 'text-gray-600'}`}>
                        {statusText}
                    </p>
                </div>

                {/* Log Area */}
                <div className="mt-10">
                    <h2 className="text-xl font-bold text-gray-800 mb-3">Conversation Log (History)</h2>
                    <div className="log-box bg-gray-100 p-4 border border-gray-200">
                        {logHistory.map(entry => (
                            <LogEntry key={entry.id} {...entry} />
                        ))}
                        {logHistory.length === 0 && (
                            <p className="text-gray-500 italic text-sm">No history yet. Start speaking!</p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default App;