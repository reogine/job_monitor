const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command failed: ${command}\n${stderr}`);
        resolve({ success: false, error, stdout, stderr });
      } else {
        resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

async function checkForUpdatesAndPull() {
  console.log('Checking for updates from Git...');
  
  // Fetch latest from origin
  const fetchRes = await execPromise('git fetch origin main');
  if (!fetchRes.success) {
    console.error('Failed to fetch from git origin.');
    return { updated: false, error: 'Git fetch failed' };
  }

  // Compare local main with origin/main
  const localRev = await execPromise('git rev-parse HEAD');
  const remoteRev = await execPromise('git rev-parse origin/main');

  if (!localRev.success || !remoteRev.success) {
    console.error('Failed to get git revisions.');
    return { updated: false, error: 'Failed to read revisions' };
  }

  if (localRev.stdout === remoteRev.stdout) {
    console.log('App is up to date.');
    return { updated: false };
  }

  console.log(`Update found! Local: ${localRev.stdout}, Remote: ${remoteRev.stdout}`);
  console.log('Applying update with git reset --hard...');

  // Pull updates forcefully
  const resetRes = await execPromise('git reset --hard origin/main');
  if (!resetRes.success) {
    console.error('Failed to reset to origin/main.');
    return { updated: false, error: 'Git reset failed' };
  }

  console.log('Installing potential new dependencies...');
  await execPromise('npm install --production');

  console.log('Triggering Passenger restart...');
  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
  fs.writeFileSync(path.join(tmpDir, 'restart.txt'), new Date().toISOString());

  return { updated: true };
}

function startAutoUpdater() {
  console.log('Starting Auto-Updater service (runs every 5 minutes).');
  // Run on startup
  checkForUpdatesAndPull();
  // Schedule periodic runs
  setInterval(checkForUpdatesAndPull, POLL_INTERVAL);
}

module.exports = { startAutoUpdater, checkForUpdatesAndPull };
