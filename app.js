const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { startPolling, stopPolling } = require('./slurm/jobPoller');
const { startAutoUpdater, checkForUpdatesAndPull } = require('./slurm/autoUpdater');

const fs = require('fs');
const cors = require('cors');

const app = express();
// Enable CORS for API routes since Android WebView may load from file://
app.use(cors({ origin: true, credentials: true }));

const server = http.createServer(app);

// OOD Passenger provides this env var (e.g., /pun/sys/job_monitor)
const BASE_URI = process.env.PASSENGER_BASE_URI || '/';

// Socket.IO must use the same base path so OOD's NGINX proxies it correctly
const io = new Server(server, {
  path: BASE_URI.replace(/\/$/, '') + '/socket.io',
  cors: {
    origin: true,
    credentials: true
  }
});

// Create a router mounted at the base URI
const router = express.Router();

// Serve built React PWA from public/, but disable automatic index.html serving
router.use(express.static(path.join(__dirname, 'public'), { index: false }));

// API endpoint: return the base URI so the frontend can configure Socket.IO
router.get('/api/config', (req, res) => {
  const username = req.headers['x-forwarded-user'] 
    || process.env.REMOTE_USER 
    || process.env.USER 
    || 'unknown';
  res.json({ baseUri: BASE_URI, username });
});

// API endpoint: trigger auto update manually
router.post('/api/update', async (req, res) => {
  try {
    const result = await checkForUpdatesAndPull();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback — serve index.html directly since the build is single-file
router.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Mount the router at the base URI
app.use(BASE_URI, router);

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Get username from the handshake headers (OOD sets these)
  const username = socket.handshake.headers['x-forwarded-user']
    || process.env.REMOTE_USER
    || process.env.USER
    || 'unknown';

  console.log(`User connected: ${username} (socket: ${socket.id})`);

  // Tell the frontend who they are
  socket.emit('authenticated', { username });

  // Start polling squeue for this user
  startPolling(username, socket);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${username} (socket: ${socket.id})`);
    stopPolling(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HPC Job Monitor listening on port ${PORT}`);
  console.log(`Base URI: ${BASE_URI}`);
  startAutoUpdater();
});
