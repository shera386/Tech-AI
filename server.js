// server.js — Tech-AI Backend (Chat + Intent + Vision + Kulanz + Settings-Control)
// ERWEITERT, aber abwärtskompatibel

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MODEL_CHAT = process.env.MODEL_CHAT || "gpt-4o-mini";
const MODEL_VISION = process.env.MODEL_VISION || "gpt-4o-mini";

/* ===================== OPENAI (LAZY INIT) ===================== */
let OpenAI;
let openaiClient = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt");
  }
  if (!openaiClient) {
    OpenAI = require("openai");
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/* ===================== IN-MEMORY SESSION ===================== */
// ⚠️ bewusst RAM-only (keine DB, kein Tracking)
const sessions = {};

const FREE_LIMIT = 25;
const HARD_WARNINGS = 3;
const KULANZ_EXTRA = 9999; // Problem wird immer zu Ende gelöst

function getOrCreateSession(sessionId = "default") {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      topicId: "topic-" + Date.now(),
      topicTitle: "",
      answerCount: 0,
      warnings: 0,
      blockedNewTopics: false,
      solved: false
    };
  }
  return sessions[sessionId];
}

/* ===================== TECH TIPS ===================== */
function loadTechTips() {
  try {
    const file = path.join(__dirname, "tech-tips.txt");
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf-8").trim();
  } catch {
    return "";
  }
}

/* ===================== APP SHORTCUTS ===================== */
function buildAppLinkCatalog() {
  return [
    { key: "bluetooth", label: "Bluetooth öffnen", url: "ms-settings:bluetooth" },
    { key: "wifi", label: "WLAN öffnen", url: "ms-settings:network-wifi" },
    { key: "sound", label: "Sound öffnen", url: "ms-settings:sound" },
    { key: "gmail", label: "Gmail", url: "https://mail.google.com/" },
    { key: "google", label: "Google", url: "https://www.google.com/" },
    { key: "youtube", label: "YouTube", url: "https://www.youtube.com/" },
    { key: "discord", label: "Discord", url: "https://discord.com/app" },
    { key: "instagram", label: "Instagram", url: "https://www.instagram.com/" },
    { key: "geizhals", label: "Preisvergleich", url: "https://geizhals.de/" }
  ];
}

/* ===================== SYSTEM PROMPT ===================== */
function shortStyleGuide(mode) {
  return mode === "erfahren"
    ? "Antworte klar, technisch korrekt, ohne unnötige Erklärungen."
    : "Antworte sehr einfach, ruhig, Schritt für Schritt, ohne Fachbegriffe.";
}

function buildSystemPrompt({ mode, devicesText, techTips, platformHint }) {
  return `
Du bist Tech-AI, ein ruhiger Technik-Helfer.
Plattform: ${platformHint || "unbekannt"}
Geräte: ${devicesText || "keine"}

TECH-TIPS:
${techTips || "(keine)"}

WICHTIG:
- UI-Änderungen, Sprache, Hintergrund, Einstellungen zählen NICHT als Chat-Antwort.
- Sicherheitsfragen sind KEIN Login, sondern nur Wiederherstellung.
- Antworte IMMER als JSON:

{
  "reply": "Text",
  "suggestions": [],
  "appShortcuts": []
}

${shortStyleGuide(mode)}
`;
}

/* ===================== INTENT ===================== */
async function detectIntent(message) {
  try {
    const client = getOpenAI();
    const r = await client.responses.create({
      model: MODEL_CHAT,
      input: [
        { role: "system", content: 'Antworte NUR {"intent":"VISUAL_HELP|NEW_TOPIC|NORMAL|SETTINGS"}' },
        { role: "user", content: message }
      ],
      temperature: 0
    });
    return JSON.parse(r.output_text).intent || "NORMAL";
  } catch {
    return "NORMAL";
  }
}

/* ===================== CHAT ===================== */
async function askTechAI_JSON({ mode, message, devicesText, platformHint }) {
  const client = getOpenAI();
  const sysPrompt = buildSystemPrompt({
    mode,
    devicesText,
    techTips: loadTechTips(),
    platformHint
  });

  const r = await client.responses.create({
    model: MODEL_CHAT,
    input: [
      { role: "system", content: sysPrompt },
      { role: "user", content: message }
    ],
    temperature: 0.4
  });

  try {
    return JSON.parse(r.output_text);
  } catch {
    return { reply: r.output_text, suggestions: [], appShortcuts: [] };
  }
}

/* ===================== VISION ===================== */
async function askTechAI_Vision_JSON({
  mode,
  message,
  imageDataUrl,
  devicesText,
  platformHint
}) {
  const client = getOpenAI();
  const sysPrompt = buildSystemPrompt({
    mode,
    devicesText,
    techTips: loadTechTips(),
    platformHint
  });

  const r = await client.responses.create({
    model: MODEL_VISION,
    input: [
      { role: "system", content: sysPrompt },
      {
        role: "user",
        content: [
          { type: "input_text", text: message },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ],
    temperature: 0.3
  });

  try {
    return JSON.parse(r.output_text);
  } catch {
    return { reply: r.output_text, suggestions: [], appShortcuts: [] };
  }
}

/* ===================== PAYWALL ===================== */
function paywallReply() {
  return {
    reply:
      "Die kostenlose Sitzung ist abgeschlossen.\n\n" +
      "Du kannst dein aktuelles Problem mit einem Abo fortsetzen:\n" +
      "• Flex-Abo: 0,24 € / Tag\n" +
      "• Spar-Abo: 2,99 € / 2 Monate",
    appShortcuts: [
      { label: "Flex-Abo", url: "https://example.com/flex" },
      { label: "Spar-Abo", url: "https://example.com/spar" }
    ],
    suggestions: []
  };
}

/* ===================== API ===================== */

// Intent (zählt NICHT als Antwort)
app.post("/api/intent", async (req, res) => {
  res.json({ intent: await detectIntent(req.body.message || "") });
});

// Normaler Chat
app.post("/api/chat", async (req, res) => {
  try {
    const session = getOrCreateSession(req.body.sessionId);
    if (session.blockedNewTopics) {
      return res.json(paywallReply());
    }

    const out = await askTechAI_JSON(req.body);

    session.answerCount++;

    if (session.answerCount >= FREE_LIMIT && !session.solved) {
      session.warnings++;
      if (session.warnings >= HARD_WARNINGS) {
        session.blockedNewTopics = true;
      }
    }

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "KI nicht verfügbar" });
  }
});

// Vision (Bildanalyse)
app.post("/api/vision", async (req, res) => {
  try {
    const out = await askTechAI_Vision_JSON(req.body);
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Vision KI Fehler" });
  }
});

// Thema als gelöst markieren → Kulanz greift
app.post("/api/mark-solved", (req, res) => {
  const session = getOrCreateSession(req.body.sessionId);
  session.solved = true;
  session.answerCount += KULANZ_EXTRA;
  res.json({ ok: true });
});

// Settings / UI-Befehle → zählen NICHT
app.post("/api/settings", (req, res) => {
  res.json({ ok: true });
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`Tech-AI läuft auf Port ${PORT}`);
});
