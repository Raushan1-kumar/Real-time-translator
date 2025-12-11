import React, { useCallback, useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import { TEXT_API_URL } from "./config/api";
/**
 * WebRTCWithTranslation.jsx
 *
 * Single-file component:
 * - PeerJS for audio/video + data channel
 * - Minimal Web Speech API (STT) built-in
 * - Sends translated text over data channel
 *
 * IMPORTANT: set TEXT_API_URL to your translation endpoint.
 */

// --- CONFIG ---
// const TEXT_API_URL = process.env.REACT_APP_TEXT_API_URL || ""; // provide your endpoint
const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];
const peerConfig = {
  host: "0.peerjs.com",
  port: 443,
  secure: true,
  path: "/",
  debug: 2,
  config: { iceServers },
};

const CallStatus = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  READY: "READY",
  CALLING: "CALLING",
  IN_CALL: "IN_CALL",
};

export default function WebRTCWithTranslation() {
  // Peer + streams
  const [myPeerId, setMyPeerId] = useState("");
  const [remotePeerId, setRemotePeerId] = useState("");
  const [callStatus, setCallStatus] = useState(CallStatus.DISCONNECTED);
  const [incomingCall, setIncomingCall] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // translation UI
  const [sourceLang, setSourceLang] = useState("en-US");
  const [targetLang, setTargetLang] = useState("hi"); // e.g., Hindi captions
  const [remoteFloatingText, setRemoteFloatingText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);

  // speech recognition
  const [isSpeechActive, setIsSpeechActive] = useState(false);

  // refs
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const dataConnRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const recognitionRef = useRef(null);

  // assign stream -> video element reliably
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);
  
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // -----------------------------------
  // Helper: log
  // -----------------------------------
  const addLog = useCallback((tag, ...rest) => {
    console.log(`[${tag}]`, ...rest);
  }, []);

  // -----------------------------------
  // Minimal Translation function
  // Replace with your robust API / auth as needed.
  // -----------------------------------
  const translateText = useCallback(
    async (text) => {
      if (!TEXT_API_URL) {
        // no API configured: just return the original for testing
        return text;
      }
      try {
        setIsTranslating(true);
        const prompt = `Translate this text to ${targetLang}: "${text}"`;
        const payload = {
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: "Return only the translated text." }] },
        };

        const res = await fetch(TEXT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Translation API returned error");
        const json = await res.json();
        // adapt to the response shape you get from your API
        const translated =
          json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
          json?.translatedText ||
          "";
        return translated || text;
      } catch (err) {
        console.error("translateText error:", err);
        return text; // fallback to original
      } finally {
        setIsTranslating(false);
      }
    },
    [targetLang]
  );

  // -----------------------------------
  // Initialize Peer + getUserMedia
  // -----------------------------------
  const initializePeer = useCallback(async () => {
    if (peerRef.current) return; // already inited
    setCallStatus(CallStatus.CONNECTING);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);

      const peer = new Peer(undefined, peerConfig);
      peerRef.current = peer;

      peer.on("open", (id) => {
        addLog("peer", "open", id);
        setMyPeerId(id);
        setCallStatus(CallStatus.READY);
      });

      // Handle incoming data-channel connections (remote connects to us)
      peer.on("connection", (conn) => {
        addLog("peer", "incoming data connection", conn.peer);
        setupDataConnection(conn);
      });

      // Handle incoming media calls
      peer.on("call", (call) => {
        addLog("peer", "incoming call from", call.peer);
        setIncomingCall(call);
      });

      peer.on("error", (err) => {
        console.error("peer error", err);
        setErrorMsg(err?.message || "Peer error");
        setCallStatus(CallStatus.DISCONNECTED);
      });

      peer.on("disconnected", () => {
        addLog("peer", "disconnected");
        setCallStatus(CallStatus.DISCONNECTED);
      });

      peer.on("close", () => {
        addLog("peer", "closed");
        setCallStatus(CallStatus.DISCONNECTED);
      });
    } catch (err) {
      console.error("init err", err);
      setErrorMsg("Camera/Microphone access blocked or unavailable");
      setCallStatus(CallStatus.DISCONNECTED);
    }
  }, [addLog]);

  useEffect(() => {
    initializePeer();

    return () => {
      // cleanup
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.stop?.();
        } catch {}
        recognitionRef.current = null;
      }

      if (callRef.current) {
        try {
          callRef.current.close();
        } catch {}
        callRef.current = null;
      }
      if (dataConnRef.current) {
        try {
          dataConnRef.current.close();
        } catch {}
        dataConnRef.current = null;
      }
      if (peerRef.current) {
        try {
          peerRef.current.destroy();
        } catch {}
        peerRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------
  // Data connection helper
  // -----------------------------------
  const setupDataConnection = useCallback(
    (conn) => {
      if (!conn) return;
      // close existing if different
      if (dataConnRef.current && dataConnRef.current.peer !== conn.peer) {
        try {
          dataConnRef.current.close();
        } catch {}
      }
      dataConnRef.current = conn;

      conn.on("open", () => {
        addLog("data", "open ->", conn.peer);
        // let remote know our caption preference
        try {
          conn.send(`TARGET_LANG:${targetLang}`);
        } catch (e) {
          addLog("data", "send TARGET_LANG failed", e.message);
        }
      });

      conn.on("data", (data) => {
        // control message?
        if (typeof data === "string" && data.startsWith("TARGET_LANG:")) {
          addLog("data", "remote target lang:", data.split(":")[1]);
          return;
        }
        // otherwise assume translated text
        if (typeof data === "string") {
          setRemoteFloatingText(data);
          addLog("data", "received:", data);
          // clear after 5s
          setTimeout(() => setRemoteFloatingText(""), 5000);
        }
      });

      conn.on("close", () => {
        addLog("data", "closed ->", conn.peer);
        if (dataConnRef.current && dataConnRef.current.peer === conn.peer) {
          dataConnRef.current = null;
        }
      });

      conn.on("error", (err) => {
        addLog("data", "error", err);
      });
    },
    [addLog, targetLang]
  );

  // -----------------------------------
  // Start Call (initiator)
  // -----------------------------------
  const startCall = useCallback(async () => {
    if (!peerRef.current) {
      setErrorMsg("Peer not ready yet.");
      return;
    }
    if (!localStream) {
      setErrorMsg("Local stream not ready.");
      return;
    }
    if (!remotePeerId) {
      setErrorMsg("Enter remote Peer ID.");
      return;
    }
    if (callStatus !== CallStatus.READY && callStatus !== CallStatus.DISCONNECTED) {
      addLog("call", "invalid status for starting a call", callStatus);
      // don't block, but return
      return;
    }

    setErrorMsg("");
    setCallStatus(CallStatus.CALLING);

    try {
      // --- Data Channel ---
      let conn;
      try {
        conn = peerRef.current.connect(remotePeerId, { reliable: true });
      } catch (err) {
        addLog("data", "connect threw", err);
        setErrorMsg("Failed to connect Data Channel");
        setCallStatus(CallStatus.READY);
        return;
      }

      setupDataConnection(conn);

      conn.on("open", () => {
        addLog("data", "initiator data channel open");
        // start speech recognition after data channel open
        startSpeechRecognition();
      });

      conn.on("error", (e) => {
        addLog("data", "conn error", e);
      });

      // --- Media Call ---
      const call = peerRef.current.call(remotePeerId, localStream);
      callRef.current = call;

      call.on("stream", (stream) => {
        addLog("call", "remote stream received");
        setRemoteStream(stream);
        setCallStatus(CallStatus.IN_CALL);
      });

      call.on("error", (err) => {
        addLog("call", "error", err);
        setErrorMsg("Call failed.");
        endCall();
      });

      call.on("close", () => {
        addLog("call", "remote closed");
        endCall();
      });
    } catch (err) {
      console.error("startCall error", err);
      setErrorMsg("Call setup failed.");
      setCallStatus(CallStatus.READY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, remotePeerId, callStatus, setupDataConnection, addLog]);

  // -----------------------------------
  // Answer incoming call
  // -----------------------------------
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    if (!localStream) return setErrorMsg("Local stream missing.");

    try {
      incomingCall.answer(localStream);
      callRef.current = incomingCall;

      incomingCall.on("stream", (stream) => {
        setRemoteStream(stream);
        setCallStatus(CallStatus.IN_CALL);
        // if data channel already established, start STT; else wait for conn.on('open')
        if (dataConnRef.current && dataConnRef.current.open) {
          startSpeechRecognition();
        }
      });

      incomingCall.on("close", () => endCall());
      incomingCall.on("error", (err) => {
        addLog("call", "answer call error", err);
        endCall();
      });

      setIncomingCall(null);
    } catch (err) {
      console.error("answerCall err", err);
      setErrorMsg("Failed to answer call.");
    }
  }, [incomingCall, localStream, addLog]);

  // -----------------------------------
  // End call
  // -----------------------------------
  const endCall = useCallback(() => {
    // stop media call
    if (callRef.current) {
      try {
        callRef.current.close();
      } catch {}
      callRef.current = null;
    }
    // close data channel
    if (dataConnRef.current) {
      try {
        dataConnRef.current.close();
      } catch {}
      dataConnRef.current = null;
    }

    // stop STT
    stopSpeechRecognition();

    setRemoteStream(null);
    setCallStatus(CallStatus.READY);
  }, []);

  // -----------------------------------
  // Speech Recognition (minimal)
  // -----------------------------------
  const startSpeechRecognition = useCallback(() => {
    if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      addLog("stt", "SpeechRecognition not supported in this browser.");
      setErrorMsg("SpeechRecognition not supported in this browser.");
      return;
    }
    if (recognitionRef.current) {
      // already running
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = sourceLang || "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = async (ev) => {
      try {
        const last = ev.results[ev.results.length - 1];
        const transcript = last?.[0]?.transcript?.trim();
        if (transcript && transcript.length > 0) {
          addLog("stt", "transcript:", transcript);
          // translate then send through data channel
          const translated = await translateText(transcript);
          if (dataConnRef.current && dataConnRef.current.open) {
            try {
              dataConnRef.current.send(translated);
              addLog("data-send", translated);
            } catch (err) {
              addLog("data-send", "failed", err);
            }
          } else {
            addLog("data-send", "data channel not open (skipped)");
          }
        }
      } catch (err) {
        console.error("onresult err", err);
      }
    };

    recognition.onerror = (err) => {
      addLog("stt", "error", err);
      // optionally restart on network error
    };

    recognition.onend = () => {
      addLog("stt", "ended");
      recognitionRef.current = null;
      setIsSpeechActive(false);
    };

    try {
      recognition.start();
      setIsSpeechActive(true);
      addLog("stt", "started");
    } catch (err) {
      addLog("stt", "start error", err);
    }
  }, [addLog, sourceLang, translateText]);

  const stopSpeechRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
    } catch {}
    recognitionRef.current = null;
    setIsSpeechActive(false);
    addLog("stt", "stopped");
  }, [addLog]);

  // toggle expose
  const toggleSpeech = useCallback(() => {
    if (isSpeechActive) stopSpeechRecognition();
    else startSpeechRecognition();
  }, [isSpeechActive, startSpeechRecognition, stopSpeechRecognition]);

  // -----------------------------------
  // UI
  // -----------------------------------
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">WebRTC + Translation (PeerJS)</h1>

      {errorMsg && (
        <div className="bg-red-100 p-3 rounded text-red-700 mb-3">{errorMsg}</div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-semibold mb-2">Local</h4>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full rounded shadow bg-black"
          />
        </div>

        <div className="relative">
          <h4 className="font-semibold mb-2">Remote</h4>

          {remoteFloatingText && (
            <div
              className="absolute left-1/2 transform -translate-x-1/2 bottom-4 px-3 py-2 rounded text-white text-sm"
              style={{ background: "rgba(0,0,0,0.7)", zIndex: 20 }}
            >
              {remoteFloatingText}
            </div>
          )}

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full rounded shadow bg-black"
          />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Your Peer ID</label>
          <input
            readOnly
            value={myPeerId}
            className="mt-1 block w-full rounded border p-2 bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Friend's Peer ID</label>
          <input
            value={remotePeerId}
            onChange={(e) => setRemotePeerId(e.target.value)}
            placeholder="Enter friend's Peer ID"
            className="mt-1 block w-full rounded border p-2"
          />
        </div>
      </div>

      <div className="mb-3 flex items-center space-x-3">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="px-3 py-2 border rounded"
        >
          <option value="en-US">English (US)</option>
          <option value="es-ES">Spanish (ES)</option>
          <option value="hi-IN">Hindi (India)</option>
        </select>

        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="px-3 py-2 border rounded"
        >
          <option value="hi">Hindi</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
        </select>

        <button
          onClick={toggleSpeech}
          className={`px-4 py-2 rounded ${
            isSpeechActive ? "bg-yellow-500" : "bg-blue-600 text-white"
          }`}
        >
          {isSpeechActive ? "Stop STT" : "Start STT"}
        </button>

        <div className="ml-auto">
          {callStatus === CallStatus.IN_CALL ? (
            <button
              onClick={endCall}
              className="bg-red-600 text-white px-4 py-2 rounded"
            >
              Hang Up
            </button>
          ) : (
            <button
              onClick={startCall}
              className="bg-green-600 text-white px-4 py-2 rounded"
              disabled={!remotePeerId || callStatus !== CallStatus.READY}
            >
              Call
            </button>
          )}
        </div>
      </div>

      {/* Incoming call modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow space-y-3">
            <h3 className="text-lg font-semibold">Incoming call</h3>
            <p>From: {incomingCall.peer}</p>
            <div className="flex space-x-2 justify-end">
              <button
                onClick={answerCall}
                className="bg-green-600 text-white px-3 py-1 rounded"
              >
                Answer
              </button>
              <button
                onClick={() => setIncomingCall(null)}
                className="bg-red-600 text-white px-3 py-1 rounded"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-600">
        <div>Call status: {callStatus}</div>
        <div>Translating: {isTranslating ? "Yes" : "No"}</div>
        <div>Data channel: {dataConnRef.current ? (dataConnRef.current.open ? "Open" : "Closed") : "None"}</div>
      </div>
    </div>
  );
}
