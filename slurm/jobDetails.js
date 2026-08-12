const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(exec);

async function getJobDetails(jobId) {
  try {
    // 1. Get raw job details from scontrol
    const { stdout: scontrolOut } = await execAsync(`scontrol show job ${jobId}`);
    
    const details = {};
    const pairs = scontrolOut.split(/[\s\n]+/);
    pairs.forEach(pair => {
      if (pair.includes('=')) {
        const [key, ...vals] = pair.split('=');
        details[key] = vals.join('=');
      }
    });

    // 2. Try to get efficiency metrics using seff
    let efficiency = null;
    try {
      const { stdout: seffOut } = await execAsync(`seff ${jobId}`);
      efficiency = parseSeffOutput(seffOut);
    } catch (err) {
      console.error(`seff failed for ${jobId}: ${err.message}`);
      // Fallback: efficiency remains null
    }

    return {
      id: jobId,
      name: details['JobName'],
      state: details['JobState'],
      partition: details['Partition'],
      nodeList: details['NodeList'],
      numCPUs: details['NumCPUs'],
      minMemoryNode: details['MinMemoryNode'],
      timeLimit: details['TimeLimit'],
      runTime: details['RunTime'],
      workDir: details['WorkDir'],
      stdOut: resolvePath(details['StdOut'], jobId, details['JobName'], details['WorkDir']),
      stdErr: resolvePath(details['StdErr'], jobId, details['JobName'], details['WorkDir']),
      efficiency: efficiency
    };
  } catch (err) {
    throw new Error(`Failed to fetch details for job ${jobId}: ${err.message}`);
  }
}

function parseSeffOutput(output) {
  const eff = {
    cpuPercent: null,
    cpuUtilized: null,
    cpuCoreWalltime: null,
    memPercent: null,
    memUtilized: null,
    memLimit: null,
    wallClockTime: null
  };

  const lines = output.split('\n');
  lines.forEach(line => {
    if (line.includes('CPU Efficiency:')) {
      // e.g. CPU Efficiency: 25.50% of 22-18:17:12 core-walltime
      const match = line.match(/CPU Efficiency:\s*([\d.]+)%\s*of\s*(\S+)/);
      if (match) {
        eff.cpuPercent = match[1];
        eff.cpuCoreWalltime = match[2];
      }
    } else if (line.includes('CPU Utilized:')) {
      eff.cpuUtilized = line.split('CPU Utilized:')[1].trim();
    } else if (line.includes('Job Wall-clock time:')) {
      eff.wallClockTime = line.split('Job Wall-clock time:')[1].trim();
    } else if (line.includes('Memory Utilized:')) {
      eff.memUtilized = line.split('Memory Utilized:')[1].trim();
    } else if (line.includes('Memory Efficiency:')) {
      // e.g. Memory Efficiency: 12.50% of 16.00 GB
      const match = line.match(/Memory Efficiency:\s*([\d.]+)%\s*of\s*(.+)/);
      if (match) {
        eff.memPercent = match[1];
        eff.memLimit = match[2];
      }
    }
  });

  return eff;
}

function resolvePath(filePath, jobId, jobName, workDir) {
  if (!filePath) return null;
  // Slurm sometimes returns unresolved paths like /path/%j.out or relative paths
  let resolved = filePath.replace(/%j/g, jobId).replace(/%x/g, jobName || '');
  if (!resolved.startsWith('/') && workDir) {
    const path = require('path');
    resolved = path.join(workDir, resolved);
  }
  return resolved;
}

async function getJobLog(filePath, lines = 1000) {
  if (!filePath || filePath === 'N/A') return 'No log file path available.';
  
  try {
    // Check if file exists first
    await fs.promises.access(filePath, fs.constants.F_OK);
    
    const { stdout } = await execAsync(`tail -n ${lines} ${filePath}`);
    return stdout || '(Log file is empty)';
  } catch (err) {
    if (err.code === 'ENOENT') {
      return `File not found: ${filePath}\nThe job might not have produced any output yet.`;
    }
    throw new Error(`Error reading log file: ${err.message}`);
  }
}

module.exports = {
  getJobDetails,
  getJobLog
};
