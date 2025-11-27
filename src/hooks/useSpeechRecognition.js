// src/hooks/useSpeechRecognition.js
import { useEffect, useRef } from 'react';

/**
 * Custom hook to manage browser-based Speech-to-Text (STT).
 * @param {string} sourceLang - The language for speech recognition.
 * @param {boolean} isListening - The state of whether listening should be active.
 * @param {function} setIsListening - Function to update the listening state.
 * @param {function} setStatusText - Function to update the microphone status text.
 * @param {function} setFloatingText - Function to update the main display text.
 * @param {function} addLog - Function to add an entry to the conversation log.
 * @param {function} onFinalTranscript - Callback function for final transcripts (sends to translation). Now receives (text, seq).
 * @returns {{ toggleListening: function }}
 */
const useSpeechRecognition = (
    sourceLang,
    isListening,
    setIsListening,
    setStatusText,
    setFloatingText,
    addLog,
    onFinalTranscript
) => {
    const recognitionRef = useRef(null);
    const isListeningRef = useRef(isListening);

    // Buffering and chunking
    const bufferRef = useRef(''); // accumulated text chunk
    const chunkTimerRef = useRef(null);
    const CHUNK_DELAY_MS = 5000; // 5 seconds chunk flush
    const seqRef = useRef(0); // sequence id for ordering

    const clearChunkTimer = () => {
        if (chunkTimerRef.current) {
            clearTimeout(chunkTimerRef.current);
            chunkTimerRef.current = null;
        }
    };

    const flushBuffer = () => {
        clearChunkTimer();
        const text = bufferRef.current.trim();
        if (!text) {
            bufferRef.current = '';
            return;
        }
        seqRef.current += 1;
        const seq = seqRef.current;
        addLog('input', text, `Spoken in ${sourceLang}`);
        onFinalTranscript(text, seq);
        bufferRef.current = '';
        setFloatingText("Thinking...");
    };

    // Sync isListening state with a ref for use inside event handlers
    useEffect(() => {
        isListeningRef.current = isListening;
        if (recognitionRef.current) {
            recognitionRef.current.lang = sourceLang;
        }
    }, [isListening, sourceLang]);


    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setStatusText("Error: Speech recognition not supported in this browser. Use Chrome/Edge.");
            return;
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true; // enable interim results to chunk during long speech
        recognition.lang = sourceLang;

        recognition.onstart = () => {
            setIsListening(true);
            setStatusText(`Listening in ${sourceLang}... Speak now.`);
            setFloatingText("Listening...");
        };

        recognition.onend = () => {
            // Only restart if the state is still set to listening (to maintain continuous listening)
            if (isListeningRef.current) {
                // restart recognition to keep continuous listening
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Recognition restart failed:", e);
                }
            } else {
                setStatusText("Listening stopped. Click to start.");
                // flush any leftover buffer when stopped
                flushBuffer();
                setFloatingText("Ready for the next sentence...");
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
            // flush buffer if we have anything
            flushBuffer();
            if (event.error !== 'no-speech') {
                try {
                    recognition.stop();
                } catch (e) {
                    // ignore
                }
                setIsListening(false);
                addLog('error', `Microphone Error: ${event.error}. Please check permissions.`);
                setStatusText("Error occurred. Click to retry.");
                setFloatingText("Error during speech input.");
            }
        };

        recognition.onresult = (event) => {
            // We'll collect interim and final text into a buffer, and flush based on final or timed interval
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript + ' ';
                }
            }

            if (interimTranscript.trim().length > 0) {
                // set floating text for interim
                setFloatingText(interimTranscript.trim());
                // Store the interim in buffer if none exists; otherwise append
                bufferRef.current = (bufferRef.current + ' ' + interimTranscript).trim();

                // Restart the timer for CHUNK_DELAY_MS to flush after last interim
                clearChunkTimer();
                chunkTimerRef.current = setTimeout(() => {
                    flushBuffer();
                }, CHUNK_DELAY_MS);
            }

            if (finalTranscript.trim().length > 0) {
                // Attach final segment to buffer and flush immediately
                bufferRef.current = (bufferRef.current + ' ' + finalTranscript).trim();
                flushBuffer();
            } else {
                // if no final and no interim (silence), keep "Thinking..." or stay with last interim
                if (!interimTranscript) {
                    setFloatingText("Thinking...");
                }
            }
        };

        recognitionRef.current = recognition;

        return () => {
            // cleanup: stop recognition and clear timers
            try {
                recognition.stop();
            } catch (e) {
                // ignore
            }
            clearChunkTimer();
        };
    }, [addLog, sourceLang, setIsListening, setStatusText, setFloatingText, onFinalTranscript]);


    const toggleListening = () => {
        const recognition = recognitionRef.current;

        if (!recognition) {
            addLog('error', 'Mic unavailable: recognition object not created.');
            return;
        }

        if (isListeningRef.current) {
            // Stop listening
            setIsListening(false);
            // flush any buffered chunk before stopping
            flushBuffer();
            try {
                recognition.stop(); // .onend will handle the cleanup/status
            } catch (e) {
                console.warn('Stop recognition failed:', e);
            }
        } else {
            // Start listening
            try {
                // Must explicitly set isListening to true BEFORE starting recognition
                // to avoid the onend handler immediately restarting
                setIsListening(true);
                recognition.start();
            } catch (e) {
                // Ignore the error if recognition is already running (InvalidStateError)
                if (e.name !== "InvalidStateError") {
                    console.error("Start recognition error:", e);
                }
            }
        }
    };

    return { toggleListening };
};

export default useSpeechRecognition;