import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

/* ============================================
   STORE
=============================================== */
const commandStore = {};      // per-user commands
const chatIdStore = {};       // per-bot chat id storage
const availableCmds = [
  "/kick <user> <reason>",
  "/alert <user> <msg>",
  "/srvhop <user>",
  "/info <user>",
  "/playerlist <user>",
  "/start"
];

/* ===========================================================
   TELEGRAM WEBHOOK  
   Token taken from URL → /webhook/:token
=========================================================== */
app.post("/webhook/:token", async (req, res) => {
  const BOT_TOKEN = req.params.token;
  const TAPI = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const msg = req.body.message;
  if (!msg || !msg.text) return res.send("ok");

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // simpan chatId berdasarkan token
  chatIdStore[BOT_TOKEN] = chatId;

  if (!text.startsWith("/")) return res.send("ok");

  const parts = text.split(" ");
  const cmd = parts[0].toLowerCase();
  const target = parts[1] || null;
  const extra = parts.slice(2).join(" ") || "";

  // /start → list command
  if (cmd === "/start") {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: "Commands:\n" + availableCmds.join("\n")
    });
    return res.send("ok");
  }

  // other commands need target
  if (!target) {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: "Format salah.\nContoh:\n/kick username reason"
    });
    return res.send("ok");
  }

  // simpan command
  switch (cmd) {
    case "/kick":
      commandStore[target] = { action: "kick", reason: extra, ts: Date.now(), token: BOT_TOKEN };
      break;

    case "/alert":
      commandStore[target] = { action: "alert", message: extra, ts: Date.now(), token: BOT_TOKEN };
      break;

    case "/srvhop":
      commandStore[target] = { action: "srvhop", ts: Date.now(), token: BOT_TOKEN };
      break;

    case "/info":
      commandStore[target] = { action: "info", ts: Date.now(), token: BOT_TOKEN };
      break;

    case "/playerlist":
      commandStore[target] = { action: "playerlist", ts: Date.now(), token: BOT_TOKEN };
      break;

    default:
      await axios.post(`${TAPI}/sendMessage`, {
        chat_id: chatId,
        text: `Command '${cmd}' tidak dikenal.`
      });
      return res.send("ok");
  }

  // feedback
  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text: `Command '${cmd}' stored for: ${target}`
  });

  res.send("ok");
});


/* ===========================================================
   CLIENT SEND INFO → TELEGRAM
=========================================================== */
app.get("/roblox/info", async (req, res) => {
  const { user, map, players, max, token } = req.query;

  const TAPI = `https://api.telegram.org/bot${token}`;
  const CHAT_ID = chatIdStore[token];

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: CHAT_ID,
    text: `ℹ️ INFO DARI ${user}\n🗺 Map: ${map}\n👥 Players: ${players}/${max}`
  });

  res.send("ok");
});


/* ===========================================================
   CLIENT SEND PLAYERLIST → TELEGRAM
=========================================================== */
app.get("/roblox/playerlist", async (req, res) => {
  const { user, list, token } = req.query;

  const TAPI = `https://api.telegram.org/bot${token}`;
  const CHAT_ID = chatIdStore[token];

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: CHAT_ID,
    text: `📜 PLAYER LIST DARI ${user}\n${list}`
  });

  res.send("ok");
});


/* ===========================================================
   CLIENT FETCH COMMAND
=========================================================== */
app.get("/getcmd/:username", (req, res) => {
  const username = req.params.username;

  if (!commandStore[username]) {
    return res.send({ action: "none" });
  }

  const cmd = commandStore[username];
  delete commandStore[username];

  res.send(cmd);
});


/* ===========================================================
   DEFAULT ROUTE
=========================================================== */
app.get("/", (req, res) => {
  res.send("🔥 Command Relay Active (Token from URL Enabled)");
});

export default app;
