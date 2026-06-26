import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const API_BASE_URL = "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// GEMINI-STYLE MORPHING BLOB — animated gradient blob with 4 states:
// idle, listening, thinking, speaking
// ---------------------------------------------------------------------------
const BLOB_THEME = {
  idle: { colors: ["#7F77DD", "#D4537E", "#378ADD"], animation: "morphSlow", duration: "4.5s" },
  listening: { colors: ["#D4537E", "#7F77DD", "#85B7EB"], animation: "morphFast", duration: "1.1s" },
  thinking: { colors: ["#534AB7", "#993556", "#185FA5"], animation: "morphThink", duration: "4.2s" },
  speaking: { colors: ["#ED93B1", "#AFA9EC", "#378ADD"], animation: "morphSpeak", duration: "0.9s" },
  error: { colors: ["#E24B4A", "#A32D2D", "#791F1F"], animation: "morphFast", duration: "1.4s" },
};

function GeminiBlob({ state }) {
  const theme = BLOB_THEME[state] || BLOB_THEME.idle;

  return (
    <div style={styles.blobWrap}>
      <div
        style={{
          width: 180,
          height: 180,
          background: `linear-gradient(135deg, ${theme.colors.join(", ")})`,
          animation: `${theme.animation} ${theme.duration} ease-in-out infinite`,
          filter: "saturate(1.3)",
        }}
      />
      <style>{`
        @keyframes morphSlow {
          0%, 100% { border-radius: 42% 58% 65% 35% / 45% 40% 60% 55%; transform: rotate(0deg) scale(1); }
          33% { border-radius: 60% 40% 38% 62% / 55% 65% 35% 45%; transform: rotate(8deg) scale(1.03); }
          66% { border-radius: 48% 52% 58% 42% / 38% 50% 50% 62%; transform: rotate(-6deg) scale(0.98); }
        }
        @keyframes morphFast {
          0%, 100% { border-radius: 45% 55% 60% 40% / 50% 45% 55% 50%; transform: rotate(0deg) scale(1); }
          50% { border-radius: 58% 42% 40% 60% / 42% 58% 42% 58%; transform: rotate(15deg) scale(1.14); }
        }
        @keyframes morphThink {
          0%, 100% { border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%; transform: rotate(0deg) scale(1); }
          25% { border-radius: 65% 35% 45% 55% / 40% 60% 40% 60%; }
          50% { border-radius: 35% 65% 55% 45% / 60% 40% 60% 40%; transform: rotate(180deg) scale(1.05); }
          75% { border-radius: 55% 45% 35% 65% / 45% 55% 45% 55%; }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes morphSpeak {
          0%, 100% { border-radius: 48% 52% 55% 45% / 52% 48% 52% 48%; transform: scale(1); }
          20% { border-radius: 62% 38% 42% 58% / 40% 60% 38% 62%; transform: scale(1.15); }
          40% { border-radius: 40% 60% 60% 40% / 60% 42% 58% 40%; transform: scale(0.95); }
          60% { border-radius: 58% 42% 38% 62% / 45% 58% 42% 55%; transform: scale(1.1); }
          80% { border-radius: 42% 58% 58% 42% / 58% 42% 60% 40%; transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
export default function RoastMasterAssistant() {
  const [assistantState, setAssistantState] = useState("idle"); // idle | listening | thinking | speaking | error
  const [messages, setMessages] = useState([]);
  const [errorText, setErrorText] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);

  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  // Guards against duplicate onresult firing (e.g. React StrictMode double-invoke,
  // or the browser firing a result event more than once for the same utterance)
  const resultHandledRef = useRef(false);
  const transcriptEndRef = useRef(null);
  // Tracks how many times we've auto-retried after a transient "network" error,
  // so we retry once and then give up instead of looping forever
  const networkRetryCountRef = useRef(0);

  // Check browser support once
  const speechSupported =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Fetch current provider status on load
  useEffect(() => {
    fetch(`${API_BASE_URL}/llm-status`)
      .then((res) => res.json())
      .then((data) => {
        setCloudEnabled(Boolean(data.cloud_enabled));
        setStatusLoaded(true);
      })
      .catch(() => setStatusLoaded(true));
  }, []);

  // Auto-scroll to the latest message whenever the conversation updates
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window)) {
      setAssistantState("idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 0.95;
    utterance.onend = () => setAssistantState("idle");
    utterance.onerror = () => setAssistantState("idle");
    setAssistantState("speaking");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendToBackend = useCallback(
    async (userText) => {
      setAssistantState("thinking");
      setErrorText("");
      setMessages((prev) => [...prev, { role: "user", text: userText }]);

      try {
        const res = await fetch(`${API_BASE_URL}/roast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || `Request failed (${res.status})`);
        }

        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply, provider: data.provider },
        ]);
        speak(data.reply);
      } catch (err) {
        const reason = err.message || "Something went wrong while getting a response.";
        setErrorText(`${reason} Tap the mic and try again.`);
        setAssistantState("error");
        // No auto-clear — stays visible until the user retries.
      }
    },
    [speak]
  );

  const startListening = useCallback(() => {
    if (!speechSupported) {
      setErrorText("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // continuous=false is default, but being explicit: a single utterance per session
    recognition.continuous = false;

    resultHandledRef.current = false;

    recognition.onstart = () => {
      console.log("[speech] recognition started, mic is now listening");
    };

    recognition.onaudiostart = () => {
      console.log("[speech] audio capture started — mic stream is open");
    };

    recognition.onspeechstart = () => {
      console.log("[speech] speech detected");
    };

    recognition.onresult = (event) => {
      // Only handle the first result event for this session — prevents the
      // same transcript being sent twice if the browser fires onresult again.
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      networkRetryCountRef.current = 0; // success — reset the retry counter

      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      console.log("[speech] result:", transcript, "| confidence:", confidence);

      if (!transcript || !transcript.trim()) {
        setErrorText("Heard something, but couldn't make out any words. Try again.");
        setAssistantState("idle");
        return;
      }
      sendToBackend(transcript);
    };

    recognition.onerror = (event) => {
      // event.error tells us exactly why it failed instead of guessing.
      // Common values: "no-speech", "audio-capture", "not-allowed", "network", "aborted"
      console.error("[speech] error:", event.error);

      // "network" errors from the Web Speech API are often transient (a brief
      // hiccup talking to the browser's speech recognition service), so retry
      // once automatically before bothering the user with an error message.
      if (event.error === "network" && networkRetryCountRef.current < 1) {
        networkRetryCountRef.current += 1;
        console.log("[speech] network error — retrying once automatically");
        isListeningRef.current = false;
        setTimeout(() => startListening(), 400);
        return;
      }
      networkRetryCountRef.current = 0;

      const errorMessages = {
        "no-speech": "Didn't catch any speech. Tap the mic and try again.",
        "audio-capture": "No microphone found. Check your mic connection, then try again.",
        "not-allowed": "Microphone permission was denied. Allow mic access in your browser settings, then try again.",
        "network": "Couldn't reach the speech service. Check your connection and tap the mic to try again.",
        "aborted": null, // user-initiated stop, not a real error — don't show a message
      };

      const message = errorMessages[event.error] ?? `Speech recognition error: ${event.error}. Tap the mic to try again.`;
      if (message) {
        setErrorText(message);
        setAssistantState("error");
        // No auto-clear here — the error stays visible until the user taps
        // the mic again, so they don't miss why it failed.
      } else {
        setAssistantState("idle");
      }
      isListeningRef.current = false;
    };

    recognition.onend = () => {
      console.log(
        "[speech] recognition ended | result captured:",
        resultHandledRef.current
      );
      isListeningRef.current = false;
      // Only fall back to idle if we're still showing "listening" and got nothing —
      // if a result already triggered "thinking"/"speaking", don't override that.
      setAssistantState((current) => (current === "listening" ? "idle" : current));
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setErrorText("");
    setAssistantState("listening");
    recognition.start();
  }, [sendToBackend, speechSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }
    isListeningRef.current = false;
    setAssistantState("idle");
  }, []);

  const handleMicClick = () => {
    if (assistantState === "listening") {
      stopListening();
    } else if (assistantState === "idle" || assistantState === "error") {
      startListening();
    }
  };

  const handleToggleCloud = async () => {
    const nextValue = !cloudEnabled;
    try {
      const res = await fetch(`${API_BASE_URL}/llm-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextValue }),
      });
      const data = await res.json();
      setCloudEnabled(Boolean(data.cloud_enabled));
    } catch {
      setErrorText("Couldn't update the LLM provider setting.");
    }
  };

  const handleDownloadChat = () => {
    if (messages.length === 0) return;

    const lines = messages.map((m) => {
      const speaker = m.role === "user" ? "You" : "Roast Master";
      return `${speaker}: ${m.text}`;
    });
    const content = lines.join("\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `roast-master-chat-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const statusLabelMap = {
    idle: "Tap the mic and say something",
    listening: "Listening...",
    thinking: "Thinking of a comeback...",
    speaking: "Speaking...",
    error: errorText || "Something went wrong",
  };

  return (
    <div style={styles.page}>
      {/* LEFT PANEL — animation, status, mic, provider toggle */}
      <div style={styles.leftPanel}>
        <div style={styles.topBar}>
          <span style={styles.title}>Roast master</span>
        </div>

        <GeminiBlob state={assistantState} />

        <p
          style={{
            ...styles.statusText,
            color: assistantState === "error" ? "#E24B4A" : styles.statusText.color,
          }}
        >
          {statusLabelMap[assistantState]}
        </p>

        <button
          onClick={handleMicClick}
          style={{
            ...styles.micBtn,
            borderColor: assistantState === "listening" ? "#3ED6E8" : "rgba(255,255,255,0.18)",
            background: assistantState === "listening" ? "rgba(62,214,232,0.12)" : "transparent",
          }}
          aria-label={assistantState === "listening" ? "Stop listening" : "Start listening"}
        >
          <MicIcon active={assistantState === "listening"} />
        </button>
      </div>

      {/* RIGHT PANEL — chat transcript */}
      <div style={styles.rightPanel}>
        <div style={styles.chatHeader}>
          <span style={styles.chatHeaderTitle}>Conversation</span>
          <button
            onClick={handleDownloadChat}
            disabled={messages.length === 0}
            style={{
              ...styles.downloadBtn,
              opacity: messages.length === 0 ? 0.4 : 1,
              cursor: messages.length === 0 ? "default" : "pointer",
            }}
            aria-label="Download chat as text file"
            title="Download chat"
          >
            <DownloadIcon />
            <span>Download</span>
          </button>
        </div>

        <div style={styles.transcript}>
          {messages.length === 0 && (
            <p style={styles.emptyHint}>Your conversation will show up here.</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                ...styles.bubble,
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "rgba(62,214,232,0.12)" : "rgba(255,255,255,0.06)",
                borderColor: m.role === "user" ? "rgba(62,214,232,0.35)" : "rgba(255,255,255,0.12)",
              }}
            >
              {m.text}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
}

function MicIcon({ active }) {
  const color = active ? "#3ED6E8" : "#C7CCD1";
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke={color} strokeWidth="1.6" />
      <path d="M5 11a7 7 0 0014 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const styles = {
  page: {
    height: "100vh",
    width: "100%",
    background: "#0B0E13",
    color: "#E6E9ED",
    display: "flex",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  leftPanel: {
    width: "45%",
    minWidth: 320,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 20px",
    boxSizing: "border-box",
    borderRight: "1px solid rgba(255,255,255,0.08)",
  },
  rightPanel: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    minWidth: 0,
  },
  topBar: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    position: "absolute",
    top: 24,
    left: 0,
    right: 0,
    padding: "0 20px",
  },
  title: {
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: 0.3,
    color: "#C7CCD1",
  },
  toggleBtn: {
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 20,
    border: "1px solid",
    background: "transparent",
    cursor: "pointer",
  },
  blobWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    margin: "8px 0 4px",
  },
  statusText: {
    fontSize: 14,
    color: "#8A9099",
    margin: "12px 0 22px",
    minHeight: 18,
    textAlign: "center",
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    border: "1.5px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.2s, border-color 0.2s",
    flexShrink: 0,
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  chatHeaderTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: "#C7CCD1",
  },
  downloadBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: "#8A9099",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 20,
    padding: "6px 12px",
  },
  transcript: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "20px 24px",
  },
  bubble: {
    maxWidth: "78%",
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid",
    fontSize: 14,
    lineHeight: 1.5,
  },
  emptyHint: {
    textAlign: "center",
    fontSize: 13,
    color: "#5A6068",
    marginTop: 8,
  },
};
