import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic, MicOff, Video, VideoOff,
  SkipForward, Send, MessageSquare,
  Loader2, Wifi, WifiOff,
} from "lucide-react";

const SOCKET_URL = "http://localhost:8080";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const EMOJIS = ["😂", "❤️", "👍", "😭", "🔥", "😮"];
const now = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Call() {
  const socketRef      = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const roomRef        = useRef(null);
  const chatEndRef     = useRef(null);
  const inputRef       = useRef(null);

  const [status, setStatus]                 = useState("idle");
  const [isMuted, setIsMuted]               = useState(false);
  const [isVideoOff, setIsVideoOff]         = useState(false);
  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState("");
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [strangerTyping, setStrangerTyping] = useState(false);

  // ── KEY FIX: whenever localVideoRef mounts or stream changes, re-attach ──
  useEffect(() => {
    const video = localVideoRef.current;
    const stream = localStreamRef.current;
    if (video && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => {});
    }
  });

  /* ── Socket setup ────────────────────────────────────────────── */
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("waiting", () => setStatus("waiting"));

    socket.on("match-found", async ({ roomId, initiator }) => {
      roomRef.current = roomId;
      setStatus("connected");
      setMessages([]);
      await buildPeerConnection(initiator);
    });

    socket.on("offer", async (offer) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", answer, roomRef.current);
    });

    socket.on("answer", async (answer) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", (candidate) => {
      pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    });

    socket.on("partner-left", () => {
      teardownPeer();
      setStatus("disconnected");
      addSys("Stranger disconnected.");
    });

    socket.on("chat-message", ({ text, emoji }) => {
      if (emoji) spawnEmoji(emoji);
      else setMessages((p) => [...p, { from: "stranger", text, time: now() }]);
    });

    socket.on("stranger-typing", () => {
      setStrangerTyping(true);
      setTimeout(() => setStrangerTyping(false), 2000);
    });

    return () => {
      socket.disconnect();
      teardownAll();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, strangerTyping]);

  /* ── Get camera/mic ──────────────────────────────────────────── */
  const acquireLocalStream = async () => {
    if (localStreamRef.current) {
      // stream already exists — just re-attach to video element
      const video = localVideoRef.current;
      if (video) {
        video.srcObject = localStreamRef.current;
        video.play().catch(() => {});
      }
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    localStreamRef.current = stream;

    // attach to local <video>
    const video = localVideoRef.current;
    if (video) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }

    return stream;
  };

  /* ── Build RTCPeerConnection ─────────────────────────────────── */
  const buildPeerConnection = async (initiator) => {
    const stream = await acquireLocalStream();

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = ({ track, streams }) => {
      const video = remoteVideoRef.current;
      if (!video) return;

      if (streams && streams[0]) {
        video.srcObject = streams[0];
      } else {
        let rs = video.srcObject;
        if (!rs || !(rs instanceof MediaStream)) {
          rs = new MediaStream();
          video.srcObject = rs;
        }
        rs.addTrack(track);
      }
      video.play().catch(() => {});
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        socketRef.current.emit("ice-candidate", candidate, roomRef.current);
    };

    pc.onconnectionstatechange = () => {
      console.log("PeerConnection state:", pc.connectionState);
    };

    if (initiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socketRef.current.emit("offer", offer, roomRef.current);
    }
  };

  const teardownPeer = () => {
    pcRef.current?.close();
    pcRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const teardownAll = () => {
    teardownPeer();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  };

  /* ── UI actions ──────────────────────────────────────────────── */
  const handleStart = async () => {
    await acquireLocalStream();
    socketRef.current.emit("find-match");
    setStatus("waiting");
  };

  const handleNext = () => {
    if (!roomRef.current) return;
    socketRef.current.emit("next", roomRef.current);
    teardownPeer();
    setStatus("waiting");
    setMessages([]);
    roomRef.current = null;
  };

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsMuted((p) => !p);
  };

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsVideoOff((p) => !p);
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || status !== "connected") return;
    socketRef.current.emit("chat-message", { text, room: roomRef.current });
    setMessages((p) => [...p, { from: "me", text, time: now() }]);
    setInput("");
    inputRef.current?.focus();
  };

  const sendEmoji = (emoji) => {
    if (status !== "connected") return;
    socketRef.current.emit("chat-message", { emoji, room: roomRef.current });
    spawnEmoji(emoji);
  };

  const spawnEmoji = (emoji) => {
    const id = Date.now() + Math.random();
    setFloatingEmojis((p) => [...p, { emoji, id }]);
    setTimeout(() => setFloatingEmojis((p) => p.filter((e) => e.id !== id)), 2000);
  };

  const addSys = (text) =>
    setMessages((p) => [...p, { from: "system", text, time: now() }]);

  const handleTyping = (e) => {
    setInput(e.target.value);
    if (status === "connected")
      socketRef.current.emit("stranger-typing", roomRef.current);
  };

  const isIdle         = status === "idle";
  const isWaiting      = status === "waiting";
  const isConnected    = status === "connected";
  const isDisconnected = status === "disconnected";

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col bg-[#080808] text-gray-200 overflow-hidden" style={{ height: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400&display=swap');
        * { font-family: 'Syne', sans-serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      {/* ── HEADER ── */}
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl z-20"
        style={{ flexShrink: 0 }}
      >
        <h1 className="text-xl font-black tracking-tight select-none">
          <span className="text-yellow-400">ran</span>dom
          <span className="text-yellow-400">.</span>
        </h1>

        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px]"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {isConnected    && <><Wifi     size={12} className="text-green-400" /><span className="text-green-400">live</span></>}
            {isWaiting      && <><Loader2  size={12} className="text-yellow-400 animate-spin" /><span className="text-yellow-400">searching…</span></>}
            {(isIdle || isDisconnected) && <><WifiOff size={12} className="text-gray-600" /><span className="text-gray-600">offline</span></>}
          </motion.div>
        </AnimatePresence>
      </motion.header>

      {/* ── MAIN ── */}
      <main className="flex overflow-hidden" style={{ flex: 1 }}>

        {/* VIDEO PANE */}
        <section className="flex flex-col relative border-r border-white/[0.06] bg-black" style={{ flex: 1 }}>

          {/* Stranger video — top half */}
          <div
            className="relative overflow-hidden border-b border-white/[0.06]"
            style={{ flex: 1, minHeight: 0 }}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onClick={() => remoteVideoRef.current?.play().catch(() => {})}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />

            <AnimatePresence>
              {!isConnected && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm"
                >
                  {isWaiting && (
                    <motion.div
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 220 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="w-14 h-14 rounded-full border-2 border-yellow-400/20 border-t-yellow-400 animate-spin" />
                      <p className="text-[11px] text-gray-500 tracking-[0.2em] uppercase" style={{ fontFamily: "'DM Mono',monospace" }}>
                        Finding Stranger
                      </p>
                    </motion.div>
                  )}
                  {isIdle && (
                    <p className="text-[11px] text-gray-600 tracking-[0.2em] uppercase" style={{ fontFamily: "'DM Mono',monospace" }}>
                      Hit Start to Begin
                    </p>
                  )}
                  {isDisconnected && (
                    <motion.p
                      initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      className="text-[11px] text-gray-600 tracking-[0.2em] uppercase" style={{ fontFamily: "'DM Mono',monospace" }}
                    >
                      Stranger Left
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <span className="absolute bottom-3 left-3 text-[10px] text-gray-500 bg-black/50 px-2 py-1 rounded backdrop-blur-sm" style={{ fontFamily: "'DM Mono',monospace" }}>
              Stranger
            </span>
          </div>

          {/* Your video — bottom half */}
          <div
            className="relative overflow-hidden"
            style={{ flex: 1, minHeight: 0 }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <AnimatePresence>
              {isVideoOff && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/80"
                >
                  <VideoOff size={28} className="text-gray-700" />
                </motion.div>
              )}
            </AnimatePresence>
            <span className="absolute bottom-3 left-3 text-[10px] text-gray-500 bg-black/50 px-2 py-1 rounded backdrop-blur-sm" style={{ fontFamily: "'DM Mono',monospace" }}>
              You
            </span>
          </div>

          {/* Floating emojis */}
          <AnimatePresence>
            {floatingEmojis.map(({ emoji, id }) => (
              <motion.div
                key={id}
                initial={{ y: 0, opacity: 1, scale: 1 }}
                animate={{ y: -150, opacity: 0, scale: 2.5 }}
                transition={{ duration: 1.8, ease: "easeOut" }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 text-5xl pointer-events-none z-30 select-none"
              >
                {emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </section>

        {/* CHAT PANE */}
        <motion.section
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
          className="flex flex-col bg-[#0d0d0d]"
          style={{ width: "320px", flexShrink: 0 }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <MessageSquare size={13} className="text-gray-600" />
            <span className="text-[10px] text-gray-600 tracking-[0.12em] uppercase" style={{ fontFamily: "'DM Mono',monospace" }}>
              Chat
            </span>
          </div>

          <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2" style={{ flex: 1 }}>
            {messages.length === 0 && (
              <p className="text-[11px] text-white/10 text-center my-auto" style={{ fontFamily: "'DM Mono',monospace" }}>
                {isConnected ? "Say hello 👋" : "Connect to start chatting"}
              </p>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`flex ${
                    m.from === "me" ? "justify-end"
                    : m.from === "system" ? "justify-center"
                    : "justify-start"
                  }`}
                >
                  {m.from === "system" ? (
                    <span className="text-[10px] text-gray-600 bg-white/[0.04] px-3 py-1 rounded-full" style={{ fontFamily: "'DM Mono',monospace" }}>
                      {m.text}
                    </span>
                  ) : (
                    <div className={`max-w-[195px] px-3 py-2 rounded-2xl ${
                      m.from === "me"
                        ? "bg-yellow-400 text-black rounded-br-sm"
                        : "bg-white/[0.07] text-gray-200 rounded-bl-sm"
                    }`}>
                      <p className="text-[13px] leading-relaxed break-words">{m.text}</p>
                      <span className="text-[10px] opacity-40 block mt-0.5" style={{ fontFamily: "'DM Mono',monospace" }}>{m.time}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {strangerTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  className="flex gap-1.5 items-center px-3 py-3 bg-white/[0.07] rounded-2xl rounded-bl-sm w-fit"
                >
                  {[0, 0.22, 0.44].map((delay, i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{ duration: 1.4, repeat: Infinity, delay }}
                      className="w-1.5 h-1.5 rounded-full bg-gray-500 block"
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2 px-3 py-3 border-t border-white/[0.06]">
            <input
              ref={inputRef}
              value={input}
              onChange={handleTyping}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={isConnected ? "Type a message…" : "Connect first…"}
              disabled={!isConnected}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] text-gray-200 placeholder-gray-700 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-yellow-400/40 transition-colors disabled:opacity-30"
              style={{ fontFamily: "'DM Mono',monospace" }}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={sendMessage}
              disabled={!isConnected}
              className="bg-yellow-400 hover:bg-yellow-300 text-black rounded-lg px-3 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={15} />
            </motion.button>
          </div>
        </motion.section>
      </main>

      {/* ── FOOTER ── */}
      <motion.footer
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
        className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-[#080808] z-20"
        style={{ flexShrink: 0 }}
      >
        <div className="flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.88 }} onClick={toggleMic}
            className={`p-2.5 rounded-xl border transition-all ${isMuted ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-white/[0.04] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-200"}`}
          >
            {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
          </motion.button>

          <motion.button whileTap={{ scale: 0.88 }} onClick={toggleVideo}
            className={`p-2.5 rounded-xl border transition-all ${isVideoOff ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-white/[0.04] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-200"}`}
          >
            {isVideoOff ? <VideoOff size={17} /> : <Video size={17} />}
          </motion.button>

          <div className="w-px h-6 bg-white/[0.08] mx-1" />

          {EMOJIS.map((e) => (
            <motion.button
              key={e}
              whileHover={{ scale: 1.25 }}
              whileTap={{ scale: 1.5 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              onClick={() => sendEmoji(e)}
              className="text-[19px] p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              {e}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {(isIdle || isDisconnected) && (
            <motion.button key="start"
              initial={{ opacity: 0, scale: 0.8, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStart}
              className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm px-8 py-2.5 rounded-xl transition-colors"
            >
              {isDisconnected ? "Find Next" : "Start"}
            </motion.button>
          )}

          {isWaiting && (
            <motion.button key="cancel"
              initial={{ opacity: 0, scale: 0.8, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { socketRef.current.emit("cancel"); setStatus("idle"); }}
              className="bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 font-semibold text-sm px-6 py-2.5 rounded-xl border border-white/[0.08] hover:border-white/20 transition-all"
            >
              Cancel
            </motion.button>
          )}

          {isConnected && (
            <motion.button key="next"
              initial={{ opacity: 0, scale: 0.8, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleNext}
              className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 font-semibold text-sm px-6 py-2.5 rounded-xl border border-white/[0.08] hover:border-white/20 transition-all"
            >
              <SkipForward size={15} />
              Next
            </motion.button>
          )}
        </AnimatePresence>
      </motion.footer>
    </div>
  );
}