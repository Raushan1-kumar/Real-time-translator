import React, { useState, useRef, useEffect, useCallback } from "react";
import Peer from "peerjs";
import { Phone, Video, Copy, X, Users, Plus, LogIn } from "lucide-react";
import io from "socket.io-client";

// --- Configuration ---
const SOCKET_SERVER_URL = "https://cortez-dineric-superurgently.ngrok-free.dev";
const peerConfig = {
  host: "0.peerjs.com",
  port: 443,
  secure: true,
  path: "/",
  debug: 0,
  config: { 
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ] 
  },
};

const CallStatus = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  READY: "READY",
  IN_ROOM: "IN_ROOM",
};

const WebRTCGroup = () => {
  const [roomId, setRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");
  const [myPeerId, setMyPeerId] = useState("");
  const [mySocketId, setMySocketId] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [callStatus, setCallStatus] = useState(CallStatus.DISCONNECTED);
  const [errorMsg, setErrorMsg] = useState("");
  const [remoteStreams, setRemoteStreams] = useState({});
  const [shareLink, setShareLink] = useState("");

  const activeCallsRef = useRef({});
  const peerRef = useRef(null);
  const socketRef = useRef(null);

  // --- End all calls ---
  const endAllCalls = useCallback(() => {
    Object.values(activeCallsRef.current).forEach(call => call.close());
    activeCallsRef.current = {};
    setRemoteStreams({});
    setShareLink("");

    if (socketRef.current && roomId) {
        socketRef.current.emit("leave-room", roomId, myPeerId);
    }

    setRoomId("");
    if (callStatus !== CallStatus.DISCONNECTED) {
        setCallStatus(CallStatus.READY);
    }
  }, [roomId, myPeerId, callStatus]);

  // --- Handle incoming streams ---
  const handlePeerStream = useCallback((call, stream) => {
    setRemoteStreams(prev => ({ ...prev, [call.peer]: stream }));
    activeCallsRef.current[call.peer] = call;

    call.on("close", () => {
        setRemoteStreams(prev => {
            const newStreams = { ...prev };
            delete newStreams[call.peer];
            return newStreams;
        });
        delete activeCallsRef.current[call.peer];
    });

    call.on("error", (err) => {
        console.error("Call error with:", call.peer, err);
        setErrorMsg(`Connection error with ${call.peer}`);
    });
  }, []);

  // --- Create call to a peer ---
  const createCall = useCallback((targetPeerId, stream) => {
    if (!peerRef.current || !stream) return;
    const call = peerRef.current.call(targetPeerId, stream);
    call.on("stream", (remoteStream) => {
      handlePeerStream(call, remoteStream);
    });
  }, [handlePeerStream]);

  // --- Join a room ---
  const joinRoom = (id) => {
    if (!peerRef.current || !localStream || !id) return;
    setRoomId(id);
    setCallStatus(CallStatus.IN_ROOM);
    setErrorMsg("");
    setShareLink(`${window.location.origin}?room=${id}`);
    console.log("Joining room:", id);
    socketRef.current.emit("join-room", { roomId: id, peerId: myPeerId });
  };

  const handleCreateRoom = () => {
    if (!socketRef.current || !myPeerId) return;
    console.log("Creating room for peer:", myPeerId);
    socketRef.current.emit("create-room", myPeerId);
  };

  const handleJoinRoom = () => {
    if (callStatus !== CallStatus.READY || !inputRoomId.trim()) return;
    joinRoom(inputRoomId.trim());
  };

  // --- Initialization ---
  const initialize = useCallback(async () => {
    if (peerRef.current) return;

    setCallStatus(CallStatus.CONNECTING);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      const peer = new Peer(undefined, peerConfig);
      peerRef.current = peer;

      peer.on("open", (id) => {
        console.log("PeerJS ID:", id);
        setMyPeerId(id);
        setCallStatus(CallStatus.READY);

        // Check for URL room
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        if (urlRoomId) joinRoom(urlRoomId);
      });

      peer.on("call", (call) => {
        call.answer(stream);
        handlePeerStream(call, stream);
      });

      peer.on("error", (err) => {
        console.error("PeerJS error:", err);
        setErrorMsg(err.message);
        setCallStatus(CallStatus.DISCONNECTED);
      });

      const socket = io(SOCKET_SERVER_URL, { transports: ["websocket"] });
      socketRef.current = socket;

      // --- Receive socketId ---
      socket.on("connect", () => {
        setMySocketId(socket.id);
      });

      socket.on("room-created", (newRoomId) => {
        console.log("Received room-created:", newRoomId);
        joinRoom(newRoomId);
      });

      socket.on("room-users", (peersInRoom) => {
        peersInRoom.forEach(peerId => createCall(peerId, stream));
      });

      socket.on("user-joined", (newPeerId) => {
        createCall(newPeerId, stream);
      });

      socket.on("user-left", (leavingPeerId) => {
        activeCallsRef.current[leavingPeerId]?.close();
      });

    } catch (err) {
      console.error("Media error:", err);
      setErrorMsg("Camera/Microphone access blocked.");
      setCallStatus(CallStatus.DISCONNECTED);
    }
  }, [handlePeerStream, createCall]);

  useEffect(() => {
    initialize();
    return () => {
      endAllCalls();
      if (peerRef.current) peerRef.current.destroy();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      socketRef.current?.disconnect();
    };
  }, [initialize, endAllCalls]);

  // --- Rendering ---
  const totalParticipants = Object.keys(remoteStreams).length + (roomId ? 1 : 0);
  const isReady = callStatus === CallStatus.READY && myPeerId;
  const isInRoom = callStatus === CallStatus.IN_ROOM;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 flex items-center">
        <Users className="mr-3 text-blue-600"/> PeerJS Group Video Chat
      </h1>

      {/* Peer ID + Socket ID */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center space-x-2">
          <p className="text-gray-700 font-medium">Your Peer ID:</p>
          <p className="font-mono text-sm text-blue-600">{myPeerId || "Generating..."}</p>
          {myPeerId && (
            <button onClick={() => navigator.clipboard.writeText(myPeerId)} className="text-blue-500 hover:text-blue-700">
              <Copy size={16} />
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <p className="text-gray-700 font-medium">Your Socket ID:</p>
          <p className="font-mono text-sm text-green-600">{mySocketId || "Connecting..."}</p>
          {mySocketId && (
            <button onClick={() => navigator.clipboard.writeText(mySocketId)} className="text-green-500 hover:text-green-700">
              <Copy size={16} />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-100 p-3 rounded text-red-700 mb-3">{errorMsg}</div>
      )}

      <div className="mb-6 p-6 border rounded-lg shadow-md bg-white">
        {!isInRoom ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Start or Join a Call</h2>
            <div className="flex space-x-3">
              <button
                onClick={handleCreateRoom}
                className="bg-purple-600 text-white px-4 py-3 rounded flex-grow flex justify-center items-center disabled:opacity-50 transition"
                disabled={!isReady}
              >
                <Plus className="mr-2" size={20} /> Create New Room
              </button>
            </div>

            <div className="flex space-x-3 border-t pt-4">
              <input
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                className="flex-grow border p-3 rounded focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter Room ID to Join"
                disabled={!isReady}
              />
              <button
                onClick={handleJoinRoom}
                className="bg-green-600 text-white px-4 py-3 rounded flex justify-center items-center disabled:opacity-50 transition"
                disabled={!isReady || !inputRoomId.trim()}
              >
                <LogIn className="mr-2" size={20} /> Join Room
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-blue-600">Active Room: {roomId}</h2>
            <div className="flex items-center space-x-2 bg-blue-50 p-3 rounded">
              <p className="text-sm font-medium">Share Link:</p>
              <input readOnly value={shareLink} className="flex-grow bg-white border p-1 rounded font-mono text-xs" />
              <button 
                onClick={() => navigator.clipboard.writeText(shareLink)} 
                className="text-blue-500 hover:text-blue-700">
                <Copy size={16} />
              </button>
            </div>
            <button
              onClick={endAllCalls}
              className="bg-red-500 text-white px-4 py-2 rounded flex items-center w-full justify-center"
            >
              <X className="mr-2" size={20} /> Leave Room
            </button>
          </div>
        )}
      </div>

      {isInRoom && (
        <>
          <h2 className="text-2xl font-bold mb-4">Participants ({totalParticipants})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Local Video */}
            <div className="rounded-lg shadow-lg overflow-hidden border-4 border-blue-500 relative aspect-video">
              <h3 className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-10">You</h3>
              {localStream ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(el) => el && (el.srcObject = localStream)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-200">
                  <p>Camera Loading...</p>
                </div>
              )}
            </div>

            {/* Remote Videos */}
            {Object.entries(remoteStreams).map(([peerId, stream]) => (
              <div key={peerId} className="rounded-lg shadow-lg overflow-hidden border relative aspect-video">
                <h3 className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-10">
                  Peer: {peerId.substring(0, 8)}...
                </h3>
                <video
                  autoPlay
                  playsInline
                  ref={(el) => el && (el.srcObject = stream)}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default WebRTCGroup;
