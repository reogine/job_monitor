const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Active polling intervals: socketId -> intervalId
const activePollers = new Map();
// Previous job state per socket: socketId -> { jobId: jobObject }
const previousJobs = new Map();

const POLL_INTERVAL = 10000; // 10 seconds

function parseSqueueOutput(output) {
  const lines = output.trim().split('\n');
  const jobs = {};

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [id, name, user, state, time, timeLimit, partition, nodeList, startTime] = line.split('|');
    jobs[id] = { id, name, user, state, time, timeLimit, partition, nodeList, startTime };
  }

  return jobs;
}

function pollOnce(username, socket) {
  if (!/^[a-zA-Z0-9_\-\.\@]+$/.test(username)) {
    console.error(`Invalid username format: ${username}`);
    return;
  }
  
  const cmd = `squeue -u ${username} -o "%i|%j|%u|%T|%M|%l|%P|%R|%S"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`squeue error for ${username}:`, error.message);
      return;
    }

    const currentJobs = parseSqueueOutput(stdout);
    const prevJobs = previousJobs.get(socket.id) || {};

    // Detect state changes
    for (const jobId in currentJobs) {
      const curr = currentJobs[jobId];
      const prev = prevJobs[jobId];

      if (prev && prev.state !== curr.state && curr.state === 'RUNNING') {
        socket.emit('job_started', {
          jobId: curr.id,
          job: curr
        });
      }
    }

    // Detect finished/disappeared jobs
    for (const jobId in prevJobs) {
      if (!currentJobs[jobId]) {
        // Job dropped from squeue. Find out its real state using sacct
        const prevJob = prevJobs[jobId];
        exec(`sacct -j ${jobId} -o State -P -n | head -n 1`, (err, sacctOut) => {
          let finalState = 'COMPLETED'; // default fallback
          if (!err && sacctOut.trim()) {
            finalState = sacctOut.trim();
          }
          prevJob.state = finalState;
          socket.emit('job_finished', {
            jobId: jobId,
            job: prevJob
          });
        });
      }
    }

    // Update state and broadcast
    previousJobs.set(socket.id, currentJobs);
    socket.emit('jobs_update', Object.values(currentJobs));
  });
}

function fetchRecentHistory(username, socket) {
  if (!/^[a-zA-Z0-9_\-\.\@]+$/.test(username)) return;
  
  // Fetch jobs from the last 7 days that are no longer in squeue
  const cmd = `sacct -u ${username} -S now-7days -X -P -n --format="JobID,JobName,User,State,Elapsed,Timelimit,Partition,NodeList,Start"`;
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`sacct error for ${username}:`, error.message);
      return;
    }
    
    const lines = stdout.trim().split('\n');
    const historyJobs = [];
    
    lines.forEach(line => {
      const parts = line.trim().split('|');
      if (parts.length < 9) return;
      
      const [id, name, user, state, time, timeLimit, partition, nodeList, startTime] = parts;
      historyJobs.push({ id, name, user, state, time, timeLimit, partition, nodeList, startTime });
    });
    
    if (historyJobs.length > 0) {
      socket.emit('jobs_history', historyJobs);
    }
  });
}

function startPolling(username, socket) {
  console.log(`Starting poller for ${username} (socket: ${socket.id})`);

  // Fetch recent history to catch jobs that finished while app was closed
  fetchRecentHistory(username, socket);

  // Immediate first poll
  pollOnce(username, socket);

  // Then poll on interval
  const intervalId = setInterval(() => {
    pollOnce(username, socket);
  }, POLL_INTERVAL);

  activePollers.set(socket.id, intervalId);
}

function stopPolling(socketId) {
  const intervalId = activePollers.get(socketId);
  if (intervalId) {
    clearInterval(intervalId);
    activePollers.delete(socketId);
    previousJobs.delete(socketId);
    console.log(`Stopped poller for socket: ${socketId}`);
  }
}

module.exports = { startPolling, stopPolling };
