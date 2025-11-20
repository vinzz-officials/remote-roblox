import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const commandStore = {}; // Simpan per-user

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
  const reason = parts.slice(2).join(" ") || "No reason";

  if (!target) {
    await axios.post(`${TAPI}/sendMessage`, {
      chat_id: chatId,
      text: "Format salah. Contoh:\n/kick username alasan"
    });
    return res.send("ok");
  }

  // simpan command
  if (cmd === "/kick") {
    commandStore[target] = { action: "kick", reason, ts: Date.now() };
  }

  if (cmd === "/alert") {
    commandStore[target] = { action: "alert", message: reason, ts: Date.now() };
  }

  if (cmd === "/srvhop") {
    commandStore[target] = { action: "srvhop", ts: Date.now() };
  }

  if (cmd === "/info") {
    commandStore[target] = { action: "info", ts: Date.now() };
  }

  await axios.post(`${TAPI}/sendMessage`, {
    chat_id: chatId,
    text: `Command '${cmd}' stored for user: ${target}`
  });

  res.send("ok");
});

/* ===========================================================
   MANUAL TEST INPUT CMD
   =========================================================== */
app.post("/upcmd/:token", (req, res) => {
  const { username, cmd } = req.body;
  if (!username || !cmd) return res.send({ error: "Invalid" });

  commandStore[username] = cmd;
  res.send({ stored: true });
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
