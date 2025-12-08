const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let waitingSocket = null;          // jis user ko partner nahi mila abhi tak
const partners = new Map();        // socket.id -> partner.id

function pairSockets(s1, s2) {
  partners.set(s1.id, s2.id);
  partners.set(s2.id, s1.id);

  s1.emit("partner-found", { initiator: true });
  s2.emit("partner-found", { initiator: false });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // START / pehli baar search
  socket.on("find-partner", () => {
    if (waitingSocket && waitingSocket.id !== socket.id) {
      pairSockets(waitingSocket, socket);
      waitingSocket = null;
    } else {
      waitingSocket = socket;
      socket.emit("waiting");
    }
  });

  // NEXT : current partner tod ke naya partner dhundo
  socket.on("next", () => {
    const partnerId = partners.get(socket.id);

    // pehle purana pair tod do
    if (partnerId) {
      partners.delete(socket.id);
      partners.delete(partnerId);
      io.to(partnerId).emit("partner-disconnected");
    }

    // ab is socket ke liye naya partner dhundo
    if (waitingSocket && waitingSocket.id !== socket.id) {
      pairSockets(waitingSocket, socket);
      waitingSocket = null;
    } else {
      waitingSocket = socket;
      socket.emit("waiting");
    }
  });

  // WebRTC signaling data (offer/answer/candidates)
  socket.on("signal", (data) => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("signal", data);
    }
  });

  // TEXT CHAT: message apne + partner dono ko bhejo
  socket.on("chat-message", (msg) => {
    const partnerId = partners.get(socket.id);
    if (!partnerId) return; // koi partner hi nahi, ignore

    // sender ko bhi echo, partner ko bhi
    io.to(socket.id).emit("chat-message", {
      from: socket.id,
      text: msg,
    });
    io.to(partnerId).emit("chat-message", {
      from: socket.id,
      text: msg,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // agar ye wait list me tha
    if (waitingSocket && waitingSocket.id === socket.id) {
      waitingSocket = null;
    }

    // agar iske partner tha to usko inform karo
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      partners.delete(socket.id);
      partners.delete(partnerId);
      io.to(partnerId).emit("partner-disconnected");
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
