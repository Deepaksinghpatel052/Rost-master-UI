# Roast Master UI

A JARVIS-style voice assistant interface for the Roast Master API. Push-to-talk voice input, an animated cartoon-eyed robot face, and spoken replies, all in the browser.

## Features

- Push-to-talk microphone button (tap to start, tap again to stop)
- Speech-to-text using the browser's built-in Web Speech API
- Text-to-speech for the AI's reply, also via the browser
- Animated robot face with 4 states: idle, listening, thinking, speaking
- Toggle button to switch the backend between local (Ollama) and cloud (Claude)
- Scrolling text transcript of the conversation

## Prerequisites

- Node.js 18+ installed
- The Roast Master FastAPI backend running at `http://127.0.0.1:8000` (see the backend project's own README for setup)
- Google Chrome or Microsoft Edge (best Web Speech API support; Firefox/Safari support is limited or partial)

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the dev server:
   ```
   npm run dev
   ```

3. Open the printed local URL (usually `http://localhost:5173`) in Chrome or Edge.

Make sure the backend is already running (`uvicorn main:app --reload`) and, if you're using local mode, that Ollama is running in the background too.

## Configuration

The backend URL is set in `src/RoastMasterAssistant.jsx`:

```js
const API_BASE_URL = "http://127.0.0.1:8000";
```

Change this if your backend runs on a different host/port.

## Browser permissions

The first time you tap the mic button, the browser will ask for microphone permission — allow it, otherwise voice input won't work.

## Building for production

```
npm run build
```

Output goes into the `dist/` folder, which you can serve with any static file host.

## Notes

- Voice recognition language is currently set to `en-IN` in the code (`recognition.lang`) — change this in `RoastMasterAssistant.jsx` if you want a different default recognition locale.
- Text-to-speech voice quality depends on your OS/browser. English voices are generally much better supported than Hindi voices.
- If the cloud (Claude) provider is enabled but the backend doesn't have `ANTHROPIC_API_KEY` set, the app will show the error message returned by the backend.
