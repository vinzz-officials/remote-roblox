import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

/* STORE */
const commandStore = {};   // per-user commands
const chatStore = {};      // token -> chatId
const availableCmds = [
  "/kick <user> <reason>",
  "/alert <user> <msg>",
  "/srvhop <user>",
  "/info <user>",
  "/playerlist",
  "/start"
];

/* BROADCAST CONTROL (playerlist) */
let playerlistBroadcast = null; // { action, ts, expiresAt, claimed: Set }
const PLAYERLIST_TTL_MS = 6000; // broadcast alive for 6s

/* ===========================
   UTIL: sendMessageSafe
   =========================== */
async function sendMessageSafe(token, chatId, text) {
  if (!token || !chatId) return false;
  const TAPI = `https://api.telegram.org/bot${token}`;
  try {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text
    });
    return true;
  } catch (e) {
    // silent fail - log to console for debug
    console.error("sendMessage failed:", e.message || e);
    return false;
  }
}

/* ===========================
   WEBHOOK TELEGRAM
   Endpoint: POST /webhook/:token
   token diambil dari URL (multi-bot supported)
   =========================== */
app.post("/webhook/:token", async (req, res) => {
  const TOKEN = req.params.token;
  const TAPI = `https://api.telegram.org/bot${TOKEN}`;
  const msg = req.body.message;
  if (!msg || !msg.text) return res.send("ok");

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Simpan chatId per token agar endpoint roblox bisa gunakan token untuk kirim balik
  chatStore[TOKEN] = chatId;

  if (!text.startsWith("/")) return res.send("ok");

  const parts = text.split(" ").filter(Boolean);
  const cmd = (parts[0] || "").toLowerCase();
  const target = parts[1] || null;
  const extra = parts.slice(2).join(" ") || "";

  // /start => help
  if (cmd === "/start") {
    await sendMessageSafe(TOKEN, chatId, "Commands:\n" + availableCmds.join("\n"));
    return res.send("ok");
  }

  // /playerlist => broadcast to all clients (no target)
  if (cmd === "/playerlist") {
    // create broadcast object
    playerlistBroadcast = {
      action: "playerlist",
      ts: Date.now(),
      expiresAt: Date.now() + PLAYERLIST_TTL_MS,
      claimed: new Set()
    };
    await sendMessageSafe(TOKEN, chatId, "Playerlist requested — waiting for active clients...");
    return res.send("ok");
  }

  // ALL OTHER COMMANDS MUST HAVE TARGET (kick, alert, srvhop, info)
  const needTarget = ["/kick", "/alert", "/srvhop", "/info"];
  if (needTarget.includes(cmd) && !target) {
    await sendMessageSafe(TOKEN, chatId, `Format salah!\nBenar: ${cmd} <username>`);
    return res.send("ok");
  }

  // store per-target command
  switch (cmd) {
    case "/kick":
      commandStore[target] = { action: "kick", reason: extra || "No reason", ts: Date.now(), token: TOKEN, chatId };
      break;

    case "/alert":
      commandStore[target] = { action: "alert", message: extra || "No message", ts: Date.now(), token: TOKEN, chatId };
      break;

    case "/srvhop":
      commandStore[target] = { action: "srvhop", ts: Date.now(), token: TOKEN, chatId };
      break;

    case "/info":
      commandStore[target] = { action: "info", ts: Date.now(), token: TOKEN, chatId };
      break;

    default:
      await sendMessageSafe(TOKEN, chatId, `Command '${cmd}' tidak dikenal`);
      return res.send("ok");
  }

  await sendMessageSafe(TOKEN, chatId, `Command '${cmd}' stored for user: ${target}`);
  return res.send("ok");
});

/* ===========================
   ROBLOX -> SEND INFO (from client)
   Required query: user, map, players, max, token
   token must be included by client so server knows which chat to send to
   =========================== */
app.get("/roblox/info", async (req, res) => {
  const { user, map, players, max, token } = req.query;
  if (!token) return res.send("missing_token");
  const chatId = chatStore[token];
  if (!chatId) return res.send("no_chat_for_token");

  const text = `ℹ️ INFO dari ${user}\nMap: ${map}\nPlayers: ${players}/${max}`;
  await sendMessageSafe(token, chatId, text);
  return res.send("ok");
});

/* ===========================
   ROBLOX -> PLAYERLIST
   Required query: user, list (csv), token
   =========================== */
app.get("/roblox/playerlist", async (req, res) => {
  const { user, list, token } = req.query;
  if (!token) return res.send("missing_token");
  const chatId = chatStore[token];
  if (!chatId) return res.send("no_chat_for_token");

  const formatted = (list || "").split(",").filter(Boolean).join("\n");
  const text = `📜 Playerlist dari ${user}\n${formatted}`;
  await sendMessageSafe(token, chatId, text);
  return res.send("ok");
});

/* ===========================
   GET COMMAND FOR ROBLOX CLIENT
   Flow:
    - If per-user command exists -> return it & delete it (one-time)
    - Else if playerlist broadcast exists AND user hasn't claimed -> return it and mark claimed (one-time per user)
    - Else return {action: "none"}
   Broadcast auto-expires after TTL.
   =========================== */
app.get("/getcmd/:username", (req, res) => {
  const user = req.params.username;

  // expire broadcast if past TTL
  if (playerlistBroadcast && Date.now() > playerlistBroadcast.expiresAt) {
    playerlistBroadcast = null;
  }

  // per-user command first (one-time)
  if (commandStore[user]) {
    const cmd = commandStore[user];
    delete commandStore[user];
    return res.json(cmd);
  }

  // broadcast (playerlist) handling
  if (playerlistBroadcast) {
    // if user already claimed, return none
    if (!playerlistBroadcast.claimed.has(user)) {
      playerlistBroadcast.claimed.add(user);
      return res.json({
        action: playerlistBroadcast.action,
        ts: playerlistBroadcast.ts
      });
    } else {
      return res.json({ action: "none" });
    }
  }

  return res.json({ action: "none" });
});

/* ===========================
   OPTIONAL: clean stale per-user commands older than X (safety)
   This runs in background to avoid stale commands piling up.
   =========================== */
setInterval(() => {
  const now = Date.now();
  for (const k of Object.keys(commandStore)) {
    if (commandStore[k] && now - commandStore[k].ts > 1000 * 60 * 10) { // 10 min
      delete commandStore[k];
    }
  }
  // also clear broadcast if expired (safety)
  if (playerlistBroadcast && now > playerlistBroadcast.expiresAt) {
    playerlistBroadcast = null;
  }
}, 60 * 1000); // every 1 min

/* ===========================
   ROOT
   =========================== */
app.get("/", (req, res) => {
  res.send("🔥 Command Relay Online - Fixed for Roblox SC");
});

export default app;
