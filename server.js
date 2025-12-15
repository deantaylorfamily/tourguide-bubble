const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Track sockets
const listeners = new Set();
let guide = null;

function safeSend(ws, data) {
  try { ws.send(data); } catch {}
}
function broadcastToListeners(data, isBinary=false) {
  for (const ws of listeners) {
    if (ws.readyState === WebSocket.OPEN) safeSend(ws, data, isBinary);
  }
}

wss.on("connection", (ws) => {
  ws.role = "unknown";

  ws.on("message", (data, isBinary) => {
    // If it's binary, this is audio from the guide
    if (isBinary) {
      if (ws === guide) {
        // forward raw audio frames to all listeners
        for (const l of listeners) {
          if (l.readyState === WebSocket.OPEN) {
            try { l.send(data, { binary: true }); } catch {}
          }
        }
      }
      return;
    }

    // Otherwise treat as JSON control messages
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === "role") {
      if (msg.role === "listener") {
        ws.role = "listener";
        listeners.add(ws);
        console.log("📱 Listener connected");
        safeSend(ws, JSON.stringify({ type: "status", msg: "Connected to guide bubble." }));
        if (guide && guide.readyState === WebSocket.OPEN) {
          safeSend(guide, JSON.stringify({ type: "status", msg: `Listeners: ${listeners.size}` }));
        }
      }

      if (msg.role === "guide") {
        ws.role = "guide";
        guide = ws;
        console.log("🎙️ Guide connected");
        safeSend(ws, JSON.stringify({ type: "status", msg: `Guide connected. Listeners: ${listeners.size}` }));
      }
      return;
    }

    // Text broadcast (from guide buttons)
    if (msg.type === "text") {
      // send to listeners as JSON (phones show it)
      for (const l of listeners) {
        if (l.readyState === WebSocket.OPEN) {
          safeSend(l, JSON.stringify({ type: "text", text: msg.text || "" }));
        }
      }
      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "listener") {
      listeners.delete(ws);
      console.log("❌ Listener disconnected");
      if (guide && guide.readyState === WebSocket.OPEN) {
        safeSend(guide, JSON.stringify({ type: "status", msg: `Listeners: ${listeners.size}` }));
      }
    }
    if (ws.role === "guide" && ws === guide) {
      guide = null;
      console.log("❌ Guide disconnected");
    }
  });
});

// Bind to Wi-Fi
server.listen(PORT, "0.0.0.0", () => {
  console.log(`TourGuide Bubble running on http://localhost:${PORT}`);
});
