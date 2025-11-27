import { useEffect, useRef } from 'react';

/**
 * Custom hook to manage browser-based Speech-to-Text (STT).
 * Uses a committed buffer (final parts) + single pending interim string.
 * Implements two flushing mechanisms:
 * 1. Pause Detection (CHUNK_DELAY_MS): Flushes when silence/pause is detected.
 * 2. Streaming Interval (STREAMING_INTERVAL_MS): Flushes every N seconds while active.
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

    // Committed final text + current interim text
    const committedRef = useRef(''); // final segments only
    const pendingInterimRef = useRef(''); // current interim only
    
    // Timer Refs and Constants (set to 7 seconds as requested)
    const CHUNK_DELAY_MS = 7000; // 7s pause after last interim to flush
    const STREAMING_INTERVAL_MS = 7000; // 7s fixed interval for continuous flush
    
    const chunkTimerRef = useRef(null);
    const streamingIntervalRef = useRef(null); // NEW: Fixed-interval streaming timer

    const seqRef = useRef(0); // seq number for ordering
    const lastSentRef = useRef(''); // last sent text to avoid duplicates

    // --- Timer Management Functions ---
    
    const clearChunkTimer = () => {
        if (chunkTimerRef.current) {
            clearTimeout(chunkTimerRef.current);
            chunkTimerRef.current = null;
        }
    };
    
    const clearStreamingInterval = () => {
        if (streamingIntervalRef.current) {
            clearInterval(streamingIntervalRef.current);
            streamingIntervalRef.current = null;
        }
    };

    const startStreamingInterval = () => {
        clearStreamingInterval();
        streamingIntervalRef.current = setInterval(() => {
            // This forces a flush every STREAMING_INTERVAL_MS (7s)
            // even if the user is speaking continuously.
            flushBuffer();
        }, STREAMING_INTERVAL_MS);
    };

    // --- Core Buffer Management (Flush) ---

    const flushBuffer = () => {
        // Stop any pending timers before flushing
        clearChunkTimer();
        
        const text = ((committedRef.current + ' ' + pendingInterimRef.current).trim());
        
        if (!text) {
            // Nothing to send, reset buffers and exit
            committedRef.current = '';
            pendingInterimRef.current = '';
            return;
        }

        // Avoid resending identical text, especially if triggered by the interval timer
        if (lastSentRef.current && lastSentRef.current === text) {
            // Clear buffers but don't re-send duplicates
            committedRef.current = '';
            pendingInterimRef.current = '';
            lastSentRef.current = text;
            setFloatingText("Thinking...");
            return;
        }

        seqRef.current += 1;
        const seq = seqRef.current;

        // Send with the current composed text
        addLog('input', text, `Spoken in ${sourceLang}`);
        onFinalTranscript(text, seq);

        // Mark as sent and reset state
        lastSentRef.current = text;
        committedRef.current = '';
        pendingInterimRef.current = '';
        setFloatingText("Thinking...");
    };

    // keep ref in sync
    useEffect(() => {
        isListeningRef.current = isListening;
        if (recognitionRef.current) {
            recognitionRef.current.lang = sourceLang;
        }
    }, [isListening, sourceLang]);

    // --- Main Speech Recognition Hook Logic ---
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setStatusText("Error: Speech recognition not supported in this browser. Use Chrome/Edge.");
            return;
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = sourceLang;

        recognition.onstart = () => {
            setIsListening(true);
            setStatusText(`Listening in ${sourceLang}... Speak now.`);
            setFloatingText("Listening...");
            // Start the fixed-interval streaming timer
            startStreamingInterval(); 
        };

        recognition.onend = () => {
            if (isListeningRef.current) {
                // Auto-restart if we are supposed to be listening
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Recognition restart failed:", e);
                }
            } else {
                setStatusText("Listening stopped. Click to start.");
                flushBuffer(); // flush leftover buffers
                clearStreamingInterval(); // Stop the fixed-interval timer
                setFloatingText("Ready for the next sentence...");
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
            flushBuffer();
            clearStreamingInterval(); // Stop the fixed-interval timer on error
            
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
            let interimTranscript = '';
            let finalTranscript = '';

            // Build transcripts from event results
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript + ' ';
                }
            }

            // FINAL: add to committed buffer and flush immediately (high priority)
            if (finalTranscript.trim().length > 0) {
                committedRef.current = (committedRef.current + ' ' + finalTranscript).trim();
                pendingInterimRef.current = ''; // clear interim
                flushBuffer();
                return;
            }

            // INTERIM: set the pending interim (replace, not append) and restart pause timer
            if (interimTranscript.trim().length > 0) {
                pendingInterimRef.current = interimTranscript.trim();
                
                // Display the combined committed + interim text to the user
                setFloatingText(
                    (committedRef.current ? committedRef.current + ' ' : '') + 
                    pendingInterimRef.current
                );

                // Restart pause timer so we flush CHUNK_DELAY_MS (7s) after the last interim
                clearChunkTimer();
                chunkTimerRef.current = setTimeout(() => {
                    flushBuffer(); // Flushes upon pause detection
                }, CHUNK_DELAY_MS);
            } else {
                // Silence - we keep "Thinking..." if nothing new is being recognized
                setFloatingText("Thinking...");
            }
        };

        recognitionRef.current = recognition;

        // Cleanup function for useEffect
        return () => {
            try {
                recognition.stop();
            } catch (e) {
                // ignore
            }
            clearChunkTimer();
            clearStreamingInterval(); // Important: clear the interval on unmount
        };
    }, [addLog, sourceLang, setIsListening, setStatusText, setFloatingText, onFinalTranscript]);

    const toggleListening = () => {
        const recognition = recognitionRef.current;

        if (!recognition) {
            addLog('error', 'Mic unavailable: recognition object not created.');
            return;
        }

        if (isListeningRef.current) {
            // Stopping
            setIsListening(false);
            flushBuffer(); // flush any buffered chunk before stopping
            clearStreamingInterval(); // Stop the fixed-interval timer
            try {
                recognition.stop();
            } catch (e) {
                console.warn('Stop recognition failed:', e);
            }
        } else {
            // Starting
            try {
                setIsListening(true);
                // The recognition.start() call will trigger onstart, which starts the interval
                recognition.start();
            } catch (e) {
                if (e.name !== "InvalidStateError") {
                    console.error("Start recognition error:", e);
                }
            }
        }
    };

    return { toggleListening };
};

export default useSpeechRecognition;