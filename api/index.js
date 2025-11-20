import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const commandStore = {}; 
const chatStore = {}; 

const availableCmds = [
  "/kick <user> <reason>",
  "/alert <user> <msg>",
  "/srvhop <user>",
  "/info <user>",
  "/playerlist",
  "/start"
];

/* ===========================================================
   WEBHOOK TELEGRAM
=========================================================== */
app.post("/webhook/:token", async (req, res) => {
  const TOKEN = req.params.token;
  const TAPI = `https://api.telegram.org/bot${TOKEN}`;
  const msg = req.body.message;

  if (!msg || !msg.text) return res.send("ok");

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  chatStore[TOKEN] = chatId;

  if (!text.startsWith("/")) return res.send("ok");

  const parts = text.split(" ");
  const cmd = parts[0].toLowerCase();
  const target = parts[1];
  const extra = parts.slice(2).join(" ") || "";

  // START → no target
  if (cmd === "/start") {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: "Commands:\n" + availableCmds.join("\n")
    });
    return res.send("ok");
  }

  // PLAYERLIST → no target
  if (cmd === "/playerlist") {
    commandStore["_playerlist"] = { action: "playerlist", ts: Date.now() };
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: `Playerlist requested`
    });
    return res.send("ok");
  }

  // semua selain dua di atas wajib target
  if (!target) {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: `Format salah!\nBenar: ${cmd} <username>`
    });
    return res.send("ok");
  }

  // SIMPAN COMMAND PER TARGET
  switch (cmd) {
    case "/kick":
      commandStore[target] = { action: "kick", reason: extra, ts: Date.now() };
      break;

    case "/alert":
      commandStore[target] = { action: "alert", message: extra, ts: Date.now() };
      break;

    case "/srvhop":
      commandStore[target] = { action: "srvhop", ts: Date.now() };
      break;

    case "/info":
      commandStore[target] = { action: "info", ts: Date.now() };
      break;

    default:
      await axios.post(`${TAPI}/sendMessage`, {
        chat_id: chatId,
        text: `Command '${cmd}' tidak dikenal`
      });
      return res.send("ok");
  }

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text: `Command '${cmd}' stored for user: ${target}`
  });

  res.send("ok");
});

/* ===========================================================
   ROBLOX → BERI INFO
=========================================================== */
app.get("/roblox/info", async (req, res) => {
  const { user, map, players, max, token } = req.query;

  const TAPI = `https://api.telegram.org/bot${token}`;
  const chatId = chatStore[token];

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text: `ℹ️ INFO dari ${user}\nMap: ${map}\nPlayers: ${players}/${max}`
  });

  res.send("ok");
});

/* ===========================================================
   ROBLOX → PLAYERLIST
=========================================================== */
app.get("/roblox/playerlist", async (req, res) => {
  const { user, list, token } = req.query;

  const TAPI = `https://api.telegram.org/bot${token}`;
  const chatId = chatStore[token];

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text: `📜 Playerlist dari ${user}\n${list}`
  });

  res.send("ok");
});

/* ===========================================================
   GET COMMAND UNTUK ROBLOX CLIENT
=========================================================== */
app.get("/getcmd/:username", (req, res) => {
  const user = req.params.username;

  if (commandStore[user]) {
    const cmd = commandStore[user];
    delete commandStore[user];
    return res.send(cmd);
  }

  if (commandStore["_playerlist"]) {
    const cmd = commandStore["_playerlist"];
    delete commandStore["_playerlist"];
    return res.send(cmd);
  }

  res.send({ action: "none" });
});

/* ===========================================================
   DEFAULT
=========================================================== */
app.get("/", (req, res) => {
  res.send("🔥 Command Relay Online");
});

export default app;
