import React, { useState } from 'react';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import useTranslationAndSpeech from './hooks/useSpeechAndTranslation';
import LogEntry from './components/LogEntry';



// For display defaults
const DEFAULT_SOURCE_LANG = 'en-US';
const DEFAULT_TARGET_LANG = 'es'; // for example, Spanish

const App = () => {
    const [isListening, setIsListening] = useState(false);
    const [statusText, setStatusText] = useState('Click the microphone to start listening');
    const [floatingText, setFloatingText] = useState('Click the microphone to begin translation.');
    const [logHistory, setLogHistory] = useState([]);
    const [sourceLang, setSourceLang] = useState(DEFAULT_SOURCE_LANG);
    const [targetLang, setTargetLang] = useState(DEFAULT_TARGET_LANG);

    const addLog = (type, text, source = '') => {
        const entry = {
            type,
            text,
            source,
            timestamp: new Date().toLocaleTimeString(),
        };
        setLogHistory(prev => [entry, ...prev].slice(0, 200)); // keep a limit
    };

    // hook that handles translation + TTS + playback queue
    const translateAndSpeak = useTranslationAndSpeech(targetLang, addLog, setFloatingText, isListening);

    // hook that handles STT chunking and callback on flush
    const { toggleListening } = useSpeechRecognition(
        sourceLang,
        isListening,
        setIsListening,
        setStatusText,
        setFloatingText,
        addLog,
        translateAndSpeak // onFinalTranscript(text, seq)
    );

    return (
        <div className="min-h-screen p-6 bg-gray-50">
            <div className="max-w-3xl mx-auto">
                <header className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Real-time Translator</h1>
                    <div className="flex items-center gap-3">
                        <select
                            value={sourceLang}
                            onChange={(e) => setSourceLang(e.target.value)}
                            className="px-3 py-2 border rounded"
                        >
                            <option value="en-US">English (US)</option>
                            <option value="en-GB">English (UK)</option>
                            <option value="es-ES">Spanish</option>
                            <option value="fr-FR">French</option>
                        </select>

                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="px-3 py-2 border rounded"
                        >
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                            <option value="hi">Hindi</option>
                        </select>

                        <button
                            onClick={toggleListening}
                            className={`px-4 py-2 rounded ${isListening ? 'bg-red-500 text-white' : 'bg-green-600 text-white'}`}
                        >
                            {isListening ? 'Stop' : 'Start'}
                        </button>
                    </div>
                </header>

                <div className="mb-4">
                    <div className="p-4 border rounded bg-white">
                        <p className="text-sm text-gray-600">{statusText}</p>
                        <h2 className="mt-2 text-lg font-semibold">{floatingText}</h2>
                    </div>
                </div>

                <section className="mb-6">
                    <h3 className="font-semibold mb-2">Activity Log</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {logHistory.length === 0 && <div className="text-sm text-gray-500">No logs yet.</div>}
                        {logHistory.map((entry, idx) => (
                            <LogEntry
                                key={`${entry.timestamp}-${idx}`}
                                type={entry.type}
                                text={entry.text}
                                source={entry.source}
                                timestamp={entry.timestamp}
                            />
                        ))}
                    </div>
                </section>

                <footer className="text-xs text-gray-500">
                    Tip: Make sure you are using Chrome or Edge with microphone permissions enabled.
                </footer>
            </div>
        </div>
    );
};

export default App;