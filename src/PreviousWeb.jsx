import React, { useState, useRef, useEffect, useCallback } from "react";
import Peer from "peerjs";
import { Phone, Video, Copy, X } from "lucide-react";

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

const WebRTC = () => {
  const [myPeerId, setMyPeerId] = useState("");
  const [remotePeerId, setRemotePeerId] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState(CallStatus.DISCONNECTED);
  const [incomingCall, setIncomingCall] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const peerRef = useRef(null);
  const callRef = useRef(null);

  // -----------------------------
  // Initialize Peer + Camera/Mic
  // -----------------------------
  const initializePeer = useCallback(async () => {
    if (peerRef.current) return; // prevent double init

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
        console.log("Peer connected:", id);
        setMyPeerId(id);
        setCallStatus(CallStatus.READY);
      });

      peer.on("call", (call) => {
        console.log("Incoming call from:", call.peer);
        setIncomingCall(call);
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        setErrorMsg(err.message);
        setCallStatus(CallStatus.DISCONNECTED);
      });
    } catch (err) {
      setErrorMsg("Camera/Microphone access blocked");
      setCallStatus(CallStatus.DISCONNECTED);
    }
  }, []);

  // Run once
  useEffect(() => {
    initializePeer();
    return () => {
      if (callRef.current) callRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // -----------------------------
  // Start a Call
  // -----------------------------
  const startCall = () => {
    if (!peerRef.current || !localStream || !remotePeerId) return;

    setCallStatus(CallStatus.CALLING);

    const call = peerRef.current.call(remotePeerId, localStream);
    callRef.current = call;

    call.on("stream", (stream) => {
      setRemoteStream(stream);
      setCallStatus(CallStatus.IN_CALL);
    });

    call.on("error", (err) => {
      console.error("Call error:", err);
      setErrorMsg("Call failed.");
      endCall();
    });

    call.on("close", endCall);
  };

  // -----------------------------
  // Answer Call
  // -----------------------------
  const answerCall = () => {
    if (!incomingCall || !localStream) return;

    const call = incomingCall;
    call.answer(localStream);
    callRef.current = call;

    call.on("stream", (stream) => {
      setRemoteStream(stream);
      setCallStatus(CallStatus.IN_CALL);
    });

    setIncomingCall(null);

    call.on("close", endCall);
  };

  // -----------------------------
  // End Call
  // -----------------------------
  const endCall = () => {
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }

    setRemoteStream(null);
    setCallStatus(CallStatus.READY);
  };

  // -----------------------------
  // UI
  // -----------------------------

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">WebRTC Video Chat</h1>

      {errorMsg && (
        <div className="bg-red-100 p-3 rounded text-red-700 mb-3">
          {errorMsg}
        </div>
      )}

      {/* Local Video */}
      <div className="mb-3">
        <h3 className="font-semibold mb-1">Your Video</h3>
        {localStream ? (
          <video
            autoPlay
            muted
            playsInline
            ref={(el) => el && (el.srcObject = localStream)}
            className="w-64 rounded shadow"
          />
        ) : (
          <p>Loading camera...</p>
        )}
      </div>

      {/* Remote Video */}
      {remoteStream && (
        <div className="mb-3">
          <h3 className="font-semibold mb-1">Remote Video</h3>
          <video
            autoPlay
            playsInline
            ref={(el) => el && (el.srcObject = remoteStream)}
            className="w-64 rounded shadow"
          />
        </div>
      )}

      {/* My ID */}
      <div className="mb-3">
        <label>Your ID</label>
        <input
          readOnly
          value={myPeerId}
          className="w-full border p-2 rounded bg-gray-100"
        />
      </div>

      {/* Enter friend's ID */}
      <div className="mb-3">
        <label>Friend's ID</label>
        <input
          value={remotePeerId}
          onChange={(e) => setRemotePeerId(e.target.value)}
          className="w-full border p-2 rounded"
          placeholder="Enter ID"
        />
      </div>

      {/* Buttons */}
      <div className="flex space-x-3">
        {callStatus === CallStatus.IN_CALL ? (
          <button
            onClick={endCall}
            className="bg-red-500 text-white px-4 py-2 rounded"
          >
            Hang Up
          </button>
        ) : (
          <button
            onClick={startCall}
            className="bg-green-600 text-white px-4 py-2 rounded"
            disabled={!remotePeerId}
          >
            Call
          </button>
        )}
      </div>

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow text-center space-y-3">
            <h2 className="text-xl font-bold">Incoming Call</h2>
            <p>From: {incomingCall.peer}</p>

            <div className="flex justify-center space-x-4">
              <button
                onClick={answerCall}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                Accept
              </button>
              <button
                onClick={() => setIncomingCall(null)}
                className="bg-red-600 text-white px-4 py-2 rounded"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebRTC;
