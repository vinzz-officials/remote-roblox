import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const commandStore = {}; // Simpan per-user
const availableCmds = ["/kick", "/alert", "/srvhop", "/info", "/playerlist", "/start"];

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

  if (!text.startsWith("/")) return res.send("ok");

  const parts = text.split(" ");
  const cmd = parts[0].toLowerCase();
  const target = parts[1];
  const extra = parts.slice(2).join(" ") || "";

  // /start => list all commands
  if (cmd === "/start") {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: `✅ Available commands:\n${availableCmds.join("\n")}`
    });
    return res.send("ok");
  }

  if (!target && !["/start", "/playerlist"].includes(cmd)) {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: `Format salah. Contoh:\n${cmd} username`
    });
    return res.send("ok");
  }

  // Simpan command
  switch (cmd) {
    case "/kick":
      commandStore[target] = { action: "kick", reason: extra, ts: Date.now() };
      break;
    case "/alert":
      commandStore[target] = { action: "alert", message: extra || "No message", ts: Date.now() };
      break;
    case "/srvhop":
      commandStore[target] = { action: "srvhop", ts: Date.now() };
      break;
    case "/info":
      commandStore[target] = { action: "info", ts: Date.now() };
      break;
    case "/playerlist":
      commandStore[target] = { action: "playerlist", ts: Date.now() };
      break;
    default:
      await axios.post(`${TAPI}/sendMessage`, {
        chat_id: chatId,
        text: `Command '${cmd}' tidak dikenali`
      });
      return res.send("ok");
  }

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text: `Command '${cmd}' stored for user: ${target || "all"}`
  });

  res.send("ok");
});

app.get("/roblox/info", async (req, res) => {
  const { user, map, players, max } = req.query;

  const msg = `ℹ️ Info dari ${user}:\nMap: ${map}\nPlayers: ${players}/${max}`;

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: CHAT_ID,
    text: msg
  });

  res.send("ok");
});

/* ===========================================================
   GET CMD UNTUK ROBLOX CLIENT
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
  res.send("🔥 Roblox Command Relay Active");
});

export default app;
