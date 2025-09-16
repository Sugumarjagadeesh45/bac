// // server.js (or index.js)
// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");

// const app = express();
// app.use(cors({
//   origin: "*", // or ["http://localhost:19006", "http://10.0.2.2:5001"]
//   methods: ["GET", "POST"]
// }));

// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: "*",  // allow all for now
//     methods: ["GET", "POST"]
//   }
// });

// io.on("connection", (socket) => {
//   console.log("🟢 New socket connected:", socket.id);

//   // Send a welcome event to client
//   socket.emit("welcome", { msg: "Hello from server!" });

//   // Listen for client event
//   socket.on("pingServer", (data) => {
//     console.log("📩 Ping from client:", data);
//     socket.emit("pongClient", { msg: "Pong back!", time: new Date() });
//   });

//   socket.on("disconnect", () => {
//     console.log("🔴 Socket disconnected:", socket.id);
//   });
// });


// const PORT = process.env.PORT || 5001;
// server.listen(PORT, () => {
//   console.log(`✅ Server running on port ${PORT}`);
// });

































































const mongoose = require("mongoose");
const dotenv = require("dotenv");
const app = require("./app");
const http = require("http");
const socket = require("./socket");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ DB connection error:", err.message);
  });

const server = http.createServer(app);

// Initialize socket.io
socket.init(server);

// Set io instance in app for controllers to access
app.set('io', socket.getIO());

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads available at http://localhost:${PORT}/uploads/`);
});