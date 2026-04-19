import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, Sparkles, X, MessageSquare, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import drKishoreImg from './assets/dr_kishore.png';
import customBg from './assets/custom_bg.jpg';

const backgroundImages = [customBg];

function App() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // for parallax

  const websocket = useRef(null);
  const mediaRecorder = useRef(null);
  const canvasRef = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);
  const animationRef = useRef(null);
  const recordingTimer = useRef(null);
  const [showTranscript, setShowTranscript] = useState(true);

  // Parallax Handler
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      setMousePos({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Audio Queue Management
  const audioQueue = useRef([]);
  const isPlayingRef = useRef(false);

  const processAudioQueue = () => {
    if (isPlayingRef.current || audioQueue.current.length === 0) return;

    isPlayingRef.current = true;
    setIsPlaying(true);
    setStatus('speaking');

    const nextAudioUrl = audioQueue.current.shift();
    const audio = new Audio(nextAudioUrl);

    audio.onended = () => {
      isPlayingRef.current = false;
      if (audioQueue.current.length === 0) {
        setIsPlaying(false);
        setStatus('idle');
      } else {
        processAudioQueue();
      }
    };

    audio.play().catch(err => {
      console.error("Playback error:", err);
      isPlayingRef.current = false;
      processAudioQueue();
    });
  };

  // Slideshow Effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundImages.length);
    }, 5000); // Change every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const connectWebSocket = () => {
    if (websocket.current && (websocket.current.readyState === WebSocket.OPEN || websocket.current.readyState === WebSocket.CONNECTING)) return;

    console.log('Attempting to connect to WebSocket...');
    websocket.current = new WebSocket('ws://localhost:8000/ws/audio');

    websocket.current.onopen = () => {
      console.log('WebSocket Connected Successfully');
      setStatus('idle');
    };

    websocket.current.onclose = () => {
      console.log("WebSocket Disconnected. Reconnecting in 3s...");
      setTimeout(connectWebSocket, 3000);
    };

    websocket.current.onerror = (err) => {
      console.error("WebSocket Error:", err);
    };

    websocket.current.onmessage = (event) => {
      try {
        if (event.data instanceof Blob) {
          console.log("Received audio blob", event.data.size);
          const audioUrl = URL.createObjectURL(event.data);
          audioQueue.current.push(audioUrl);
          processAudioQueue();
          return;
        }

        const message = JSON.parse(event.data);
        if (message.status) setStatus(message.status);
        if (message.text) {
          setTranscript(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.sender === 'ai' && message.sender === 'ai') {
              const updatedLast = { ...lastMsg, text: lastMsg.text + message.text };
              return [...prev.slice(0, -1), updatedLast];
            } else {
              return [...prev, { sender: message.sender || 'ai', text: message.text }];
            }
          });
        }
      } catch (e) {
        console.log("Non-JSON message received", event.data);
      }
    };
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (websocket.current && (websocket.current.readyState === WebSocket.OPEN || websocket.current.readyState === WebSocket.CONNECTING)) {
        websocket.current.close();
      }
    };
  }, []);

  const sendMessage = (data) => {
    if (websocket.current?.readyState === WebSocket.OPEN) {
      websocket.current.send(data);
    } else {
      console.warn("WebSocket not connected. Attempting to reconnect...");
      connectWebSocket();
    }
  };

  const visualize = () => {
    if (!analyser.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyser.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.current?.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = 90;

      // Liquid Blob Visualizer
      ctx.beginPath();

      // Create a smooth closed curve
      // We'll use few control points to keep it "blobby"
      const totalPoints = 80;

      for (let i = 0; i <= totalPoints; i++) {
        const index = i % totalPoints; // Wrap around
        // Map index to frequency bin (using lower freqs mainly)
        const freqIndex = Math.floor((index / totalPoints) * (bufferLength * 0.5));
        const value = dataArray[freqIndex] || 0;
        const percent = value / 255;

        // Smooth the noise
        const noise = percent * 40;

        const angle = (index / totalPoints) * Math.PI * 2;
        const r = radius + noise;

        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();

      // Liquid Gradient Fill
      const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius * 1.5);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.stroke();
    };

    draw();
  };

  const startListening = async () => {
    if (websocket.current?.readyState !== WebSocket.OPEN) {
      console.warn("Cannot start listening: WebSocket disconnected.");
      connectWebSocket();
      // Give it a moment or alert user
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 256;
      const source = audioContext.current.createMediaStreamSource(stream);
      source.connect(analyser.current);

      visualize();

      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          sendMessage(event.data);
        }
      };

      mediaRecorder.current.start(100);
      setIsListening(true);
      setStatus('listening');
      sendMessage(JSON.stringify({ text: "Start" }));

      recordingTimer.current = setTimeout(() => {
        stopListening();
      }, 6000);

    } catch (err) { console.error("Mic Error:", err); }
  };

  const stopListening = () => {
    if (mediaRecorder.current && isListening) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      setIsListening(false);
      setStatus('processing');
      sendMessage(JSON.stringify({ text: "EndOfSpeech" }));
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden text-gray-800 bg-white">

      {/* 1. Custom Background */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-black">
        <motion.img
          src={customBg}
          initial={{ scale: 1.1 }}
          animate={{
            x: mousePos.x * -0.5, // Parallax opposite to foreground
            y: mousePos.y * -0.5,
            rotate: [0, 1, -1, 0], // Subtle rotation
            scale: [1.1, 1.15, 1.1] // Breathing scale
          }}
          transition={{
            x: { type: "spring", stiffness: 20, damping: 15 },
            y: { type: "spring", stiffness: 20, damping: 15 },
            rotate: { duration: 20, repeat: Infinity, ease: "easeInOut" },
            scale: { duration: 15, repeat: Infinity, ease: "easeInOut" }
          }}
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          alt="Background"
        />

        {/* Overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60 mix-blend-multiply" />
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
      </div>

      {/* 2. Header */}
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg group hover:bg-white/20 transition-all cursor-pointer">
            <Sparkles className="w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-colors" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight drop-shadow-sm">
              Dr. Kishore
            </h1>
            <p className="text-[10px] font-medium text-blue-200/80 tracking-[0.2em] uppercase">Private AI Consultant</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 shadow-lg">
            <Activity className={`w-3.5 h-3.5 ${status === 'listening' ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`} />
            <span className="text-xs font-medium text-gray-200 capitalize tracking-wide">{status}</span>
          </div>
        </div>
      </header>


      {/* 3. Main Stage */}
      <main className="relative z-10 w-full h-full flex flex-col items-center justify-center -mt-8">

        {/* Central Orb Area */}
        <div className="relative flex items-center justify-center mb-16">

          {/* Visualizer Canvas - Layered behind */}
          {isListening && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
            >
              <canvas
                ref={canvasRef}
                width="600"
                height="600"
                className="w-[600px] h-[600px] opacity-80"
              />
            </motion.div>
          )}

          {/* Idle/Speaking Breathing/Pulsing Effect - When NOT listening */}
          <AnimatePresence>
            {!isListening && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{
                  scale: [1, 1.05, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className={`absolute inset-0 rounded-full blur-3xl z-0
                        ${status === 'speaking' ? 'bg-blue-400/40' : 'bg-gray-400/20'}
                    `}
              />
            )}
          </AnimatePresence>

          {/* The Avatar Orb with Parallax */}
          <motion.div
            animate={{
              x: mousePos.x,
              y: mousePos.y,
              scale: isListening ? 1.05 : 1,
            }}
            transition={{
              x: { type: "spring", stiffness: 50, damping: 20 },
              y: { type: "spring", stiffness: 50, damping: 20 },
              scale: { duration: 0.4 }
            }}
            className="relative z-20 w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center group"
          >
            {/* Holographic Glows */}
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 opacity-20 blur-xl group-hover:opacity-40 transition-opacity duration-500" />

            {/* Glassy Frame */}
            <div className="relative w-full h-full rounded-full border border-white/10 bg-white/5 backdrop-blur-sm shadow-2xl overflow-hidden p-[2px]">
              <div className="w-full h-full rounded-full overflow-hidden relative grayscale-[20%] group-hover:grayscale-0 transition-all duration-700">
                <img
                  src={drKishoreImg}
                  alt="Dr. Kishore"
                  className="w-full h-full object-cover object-top scale-110 group-hover:scale-100 transition-transform duration-700"
                />
                {/* Glossy Overlay */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-black/40 pointer-events-none mix-blend-overlay"></div>
              </div>
            </div>

            {/* Status Icon Orb */}
            <AnimatePresence mode="wait">
              {(isPlaying || isListening) && (
                <motion.div
                  key="icon-overlay"
                  initial={{ opacity: 0, scale: 0, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0, rotate: 45 }}
                  className="absolute -bottom-2 -right-2 p-4 bg-gray-900/90 backdrop-blur-xl rounded-full shadow-2xl border border-white/10"
                >
                  {isPlaying ? (
                    <Volume2 className="w-6 h-6 text-cyan-400" strokeWidth={2} />
                  ) : (
                    <Mic className="w-6 h-6 text-rose-500 animate-pulse" strokeWidth={2} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        </div>

        {/* Dynamic Status Text */}
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6 }}
          className="text-center z-10 mb-12 h-16"
        >
          <h2 className="text-4xl md:text-5xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
            {status === 'idle' && "How can I help you?"}
            {status === 'listening' && "Listening..."}
            {status === 'processing' && "Thinking..."}
            {status === 'speaking' && "Speaking..."}
          </h2>
        </motion.div>

        {/* Controls */}
        <div className="relative z-30">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={isListening ? stopListening : startListening}
            className="group relative"
          >
            {/* Button Glow Background */}
            <div className={`absolute -inset-1 rounded-full opacity-60 blur-lg transition-all duration-500
                 ${isListening ? 'bg-red-500/40' : 'bg-gradient-to-r from-cyan-500/40 to-purple-500/40 group-hover:opacity-100'}
            `}></div>

            <div className={`
                relative px-8 py-4 rounded-full flex items-center gap-4
                bg-black/40 backdrop-blur-2xl border border-white/10
                transition-all duration-300
              `}>

              {/* Icon Box */}
              <div className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-500
                   ${isListening
                  ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                  : 'bg-white/10 group-hover:bg-white/20'}
                `}>
                {isListening ? (
                  <div className="w-3 h-3 bg-white rounded-sm" />
                ) : (
                  <Mic className="w-5 h-5 text-white" />
                )}
              </div>

              <span className="text-lg font-light text-white/90 pr-2">
                {isListening ? 'Stop Recording' : 'Start Conversation'}
              </span>
            </div>
          </motion.button>
        </div>

      </main>

      {/* 4. Transcript Overlay (Floating Panel) */}
      <AnimatePresence>
        {(transcript.length > 0 && showTranscript) && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="absolute bottom-8 right-8 z-40 w-[400px] max-h-[60vh] flex flex-col"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/90 backdrop-blur-xl border border-white/50 rounded-t-3xl shadow-lg">
              <div className="flex items-center gap-2 text-gray-600">
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-semibold">Transcript</span>
              </div>
              <button onClick={() => setShowTranscript(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white/80 backdrop-blur-xl border-x border-b border-white/50 rounded-b-3xl shadow-xl space-y-4 custom-scrollbar">
              {transcript.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                    {msg.sender === 'user' ? 'You' : 'Dr. Kishore'}
                  </span>
                  <div className={`
                                max-w-[90%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
                                ${msg.sender === 'user'
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-none'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                    }
                            `}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
              <div id="transcript-end" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button to reopen transcript if closed */}
      {!showTranscript && transcript.length > 0 && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setShowTranscript(true)}
          className="absolute bottom-8 right-8 z-40 p-4 bg-white/80 backdrop-blur-xl rounded-full shadow-lg border border-white/50 text-gray-600 hover:scale-110 transition-transform"
        >
          <MessageSquare className="w-6 h-6" />
        </motion.button>
      )}

    </div>
  );
}

export default App;
