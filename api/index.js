import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const commandStore = {}; 
const chatStore = {};

app.post("/webhook/:token", async (req, res) => {
  const TOKEN = req.params.token;
  const TAPI = `https://api.telegram.org/bot${TOKEN}`;
  const msg = req.body.message;

  if (!msg || !msg.text) return res.send("ok");

  chatStore[TOKEN] = msg.chat.id;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (!text.startsWith("/")) return res.send("ok");

  const parts = text.split(" ");
  const cmd = parts[0].toLowerCase();
  const target = parts[1];
  const extra = parts.slice(2).join(" ") || "";

  if (cmd === "/start") {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: "Commands:\n/info <user>\n/kick <user> <reason>\n/alert <user> <msg>\n/srvhop <user>"
    });
    return res.send("ok");
  }

  if (!target) {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: `Format benar: ${cmd} <username>`
    });
    return res.send("ok");
  }

  switch (cmd) {
    case "/info":
      commandStore[target] = { action: "info", ts: Date.now() };
      break;

    case "/kick":
      commandStore[target] = { action: "kick", reason: extra, ts: Date.now() };
      break;

    case "/alert":
      commandStore[target] = { action: "alert", message: extra, ts: Date.now() };
      break;

    case "/srvhop":
      commandStore[target] = { action: "srvhop", ts: Date.now() };
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

app.get("/roblox/info", async (req, res) => {
  const TAPI = `https://api.telegram.org/bot${req.query.token}`;
  const chatId = chatStore[req.query.token];

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text:
      `ℹ️ INFO PLAYER: ${req.query.user}\n\n` +
      `🗺 Map: ${req.query.map}\n` +
      `🏷 PlaceId: ${req.query.placeId}\n` +
      `🌀 JobId: ${req.query.jobId}\n` +
      `🔗 Join: ${req.query.link}\n\n` +
      `👥 Players: ${req.query.players}/${req.query.max}\n` +
      `📡 Ping: ${req.query.ping}ms\n` +
      `💻 FPS: ${req.query.fps}\n` +
      `⚙ Executor: ${req.query.exec}`
  });

  res.send("ok");
});

app.get("/getcmd/:username", (req, res) => {
  const user = req.params.username;

  if (commandStore[user]) {
    const cmd = commandStore[user];
    delete commandStore[user];
    return res.send(cmd);
  }

  res.send({ action: "none" });
});

app.get("/", (req, res) => {
  res.send("🔥 Command Relay Online");
});

export default app;
