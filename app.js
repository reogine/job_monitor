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

// Enforce trailing slash on BASE_URI so relative paths work (e.g., logo.png, favicon.svg)
app.use((req, res, next) => {
  if (req.originalUrl === BASE_URI.replace(/\/$/, '')) {
    return res.redirect(301, req.originalUrl + '/');
  }
  next();
});

// Serve built React PWA from public/, but disable automatic index.html serving
router.use(express.static(path.join(__dirname, 'public'), { index: false }));

// API endpoint: return the base URI so the frontend can configure Socket.IO
router.get('/api/config', (req, res) => {
  const defaultUser = req.headers['x-forwarded-user'] 
    || process.env.REMOTE_USER 
    || process.env.USER 
    || 'unknown';
  const username = req.query.user || defaultUser;
  res.json({ baseUri: BASE_URI, username });
});

// API endpoint: fetch user stats (balance, storage)
router.get('/api/user-stats', async (req, res) => {
  const username = req.query.user || req.headers['x-forwarded-user'] || process.env.REMOTE_USER || process.env.USER || 'unknown';
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    let balance = 'N/A';
    try {
      // Inject the exact directory where mybalance and sbank live into the PATH
      const { stdout } = await execAsync(`export PATH=$PATH:/srv/software/slurm-aux/bin:/opt/slurm/bin && /srv/software/slurm-aux/bin/mybalance`, { timeout: 5000 });
      
      let cpuTotal = 0;
      let gpuTotal = 0;
      let parsedAny = false;
      
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const upper = line.toUpperCase();
        if (!upper.includes('CPU') && !upper.includes('GPU')) continue;
        
        const parts = line.trim().split(/\s+/);
        const lastCol = parts[parts.length - 1].replace(/,/g, '');
        const val = parseInt(lastCol, 10);
        
        if (!isNaN(val)) {
          parsedAny = true;
          if (upper.includes('CPU')) cpuTotal += val;
          if (upper.includes('GPU')) gpuTotal += val;
        }
      }
      
      if (parsedAny) {
        balance = `CPU: ${cpuTotal.toLocaleString()}h | GPU: ${gpuTotal.toLocaleString()}h`;
      } else if (stdout.trim()) {
        balance = "Unknown format";
      } else {
        balance = "Empty Output";
      }
    } catch (e) {
      console.error('mybalance error:', e.message);
      // Show the actual stderr in the UI so we can debug it!
      const errStr = (e.stderr || e.message).replace('Command failed: bash -ic "export PATH=$PATH:/opt/slurm/bin:/usr/local/bin:/usr/bin:/bin \bash -ic "/srv/software/slurm-aux/bin/mybalance"\bash -ic "/srv/software/slurm-aux/bin/mybalance" /srv/software/slurm-aux/bin/mybalance"', '').trim();
      balance = "Err: " + errStr.substring(0, 200);
    }

    let storage = 'N/A';
    try {
      // Assuming typical df output: Filesystem Size Used Avail Use% Mounted on
      const { stdout } = await execAsync(`df -h ~ | awk 'NR==2 {print $3 " / " $2 " ("$5")"}'`);
      storage = stdout.trim();
    } catch (e) {
      console.error('storage error:', e.message);
    }
    
    res.json({ balance, storage });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
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

// API endpoint: fetch advanced job details via scontrol and seff
const { getJobDetails, getJobLog } = require('./slurm/jobDetails');

router.get('/api/jobs/:id', async (req, res) => {
  try {
    const details = await getJobDetails(req.params.id);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint: fetch standard output or error logs for a job
router.get('/api/jobs/:id/logs', async (req, res) => {
  try {
    const type = req.query.type; // 'out' or 'err'
    const details = await getJobDetails(req.params.id);
    
    let logPath;
    if (type === 'err') {
      logPath = details.stdErr;
    } else {
      logPath = details.stdOut;
    }

    if (!logPath || logPath === 'N/A') {
      return res.json({ content: 'No log file path available.' });
    }

    const content = await getJobLog(logPath);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint: securely clear all cookies (including HttpOnly) via browser header
router.post('/api/logout', (req, res) => {
  res.setHeader('Clear-Site-Data', '"cookies", "storage"');
  res.json({ success: true });
});

// SPA fallback — serve index.html directly since the build is single-file
router.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Mount the router at the base URI
app.use(BASE_URI, router);

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Get username from query or handshake headers
  const username = socket.handshake.query.user
    || socket.handshake.headers['x-forwarded-user']
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
