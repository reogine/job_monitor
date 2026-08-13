import { useState, useEffect, useRef } from 'react'
import { Menu, Server, LogOut, RotateCw, ChevronRight, ChevronLeft, Layers, Monitor, Clock, Battery, Cpu, DownloadCloud, User, HardDrive, CreditCard, Trash2, Moon, Sun, CircuitBoard, Calendar, Zap, Terminal, Coins, Microchip } from 'lucide-react'
import { io } from 'socket.io-client'
import './App.css'

function App() {
  const [view, setView] = useState('connect') // 'connect', 'list', 'detail'
  const [selectedJob, setSelectedJob] = useState(null)
  const [jobs, setJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('hpc_saved_jobs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }); // persistent state
  const [socket, setSocket] = useState(null)
  const [status, setStatus] = useState('')
  const [username, setUsername] = useState('')
  
  const [jobDetails, setJobDetails] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  
  const [userStats, setUserStats] = useState({ balance: 'Loading...', storage: 'Loading...' })
  
  // Theme state
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const [showSettings, setShowSettings] = useState(false)

  const parseStorage = (str) => {
    if (!str || typeof str !== 'string') return { text: 'N/A', percent: 0 };
    const match = str.match(/(.*)\((.*)%\)/);
    if (match) {
      return { text: match[1].trim(), percent: parseInt(match[2], 10) || 0 };
    }
    return { text: str, percent: 0 };
  }

  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-mode' : ''
    localStorage.setItem('theme', theme)
  }, [theme])

  // Fetch job details
  const fetchJobDetails = () => {
    if (view === 'detail' && selectedJob) {
      setDetailLoading(true)
      const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      fetch(`${basePath}api/jobs/${selectedJob.id}`)
        .then(res => res.json())
        .then(data => {
          setJobDetails(data)
          setDetailLoading(false)
        })
        .catch(err => {
          console.error(err)
          setDetailLoading(false)
        })
    }
  }

  useEffect(() => {
    fetchJobDetails()
  }, [view, selectedJob])

  // Save jobs to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('hpc_saved_jobs', JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect()
    }
  }, [socket])

  const fetchUserStats = (user) => {
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
    fetch(`${basePath}api/user-stats?user=${encodeURIComponent(user)}`)
      .then(res => res.json())
      .then(data => {
        setUserStats({ balance: data.balance || 'N/A', storage: data.storage || 'N/A' })
      })
      .catch(() => {
        setUserStats({ balance: 'Error', storage: 'Error' })
      })
  }

  const initSocket = (baseUri, user) => {
    setStatus('Connecting to WebSocket...')
    setUsername(user)
    
    // reset jobs on user switch
    setJobs([])
    
    // fetch stats once
    
    if (socket) {
      socket.disconnect()
    }

    const newSocket = io(window.location.origin, {
      path: baseUri.replace(/\/$/, '') + '/socket.io',
      withCredentials: true,
      query: { user }
    })

    newSocket.on('connect', () => {
      setStatus('Connected')
      setView('list')
    })

    newSocket.on('jobs_update', (jobsData) => {
      setJobs(prevJobs => {
        const newMap = new Map()
        // keep old jobs
        prevJobs.forEach(j => newMap.set(j.id, j))
        // update with active jobs from squeue
        jobsData.forEach(j => newMap.set(j.id, { ...j, status: j.state }))
        return Array.from(newMap.values()).sort((a,b) => b.id.localeCompare(a.id))
      })
      
      setSelectedJob(prev => {
        if (!prev) return null;
        const mapped = jobsData.find(j => j.id === prev.id)
        return mapped ? { ...mapped, status: mapped.state } : prev;
      });
    })
    
    newSocket.on('job_finished', ({ jobId, job }) => {
       setJobs(prevJobs => {
         return prevJobs.map(j => {
           if (j.id === jobId) return { ...j, status: job.state || 'COMPLETED' }
           return j
         })
       })
       
       setSelectedJob(prev => {
         if (prev && prev.id === jobId) return { ...prev, status: job.state || 'COMPLETED' }
         return prev
       })
    })

    newSocket.on('jobs_history', (historyData) => {
      setJobs(prevJobs => {
        const newMap = new Map()
        // keep old jobs
        prevJobs.forEach(j => newMap.set(j.id, j))
        
        // merge history
        historyData.forEach(j => {
          if (!newMap.has(j.id)) {
            newMap.set(j.id, { ...j, status: j.state })
          } else {
             // If we already have it, but history shows it finished, update it
             const existing = newMap.get(j.id)
             if ((existing.status === 'RUNNING' || existing.status === 'PENDING') && 
                 (j.state !== 'RUNNING' && j.state !== 'PENDING')) {
                newMap.set(j.id, { ...existing, ...j, status: j.state })
             }
          }
        })
        return Array.from(newMap.values()).sort((a,b) => b.id.localeCompare(a.id))
      })
    })

    newSocket.on('disconnect', () => {
      setStatus('Disconnected')
    })

    setSocket(newSocket)
  }

  const handleConnect = async (overrideUser = null) => {
    setStatus('Connecting...')
    try {
      const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/'; 
      const url = overrideUser ? `${basePath}api/config?user=${encodeURIComponent(overrideUser)}` : `${basePath}api/config`;
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.baseUri) {
        initSocket(data.baseUri, data.username)
        
        setStatus('Fetching account balance...')
        try {
          const statsUrl = overrideUser ? `${basePath}api/user-stats?user=${encodeURIComponent(overrideUser)}` : `${basePath}api/user-stats`;
          const statsRes = await fetch(statsUrl)
          if (statsRes.ok) {
            const statsData = await statsRes.json()
            setUserStats(statsData)
          }
        } catch (e) {
          console.error("Failed to fetch stats during connect", e)
        }
        
        setView('list')
      }
    } catch (err) {
      setStatus(`Connection failed: ${err.message}. Retrying...`)
      setTimeout(() => handleConnect(), 3000)
    }
  }

  const handleLogout = async () => {
    try {
      const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      await fetch(`${basePath}api/logout`, { method: 'POST' });
    } catch (e) {
      console.error('Logout API failed', e);
    }
    // Fallback manual clear for non-HttpOnly cookies just in case
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/");
    });
    localStorage.clear();
    window.location.href = '/pun/sys/dashboard/logout';
  }

  const handleAppUpdate = async () => {
    try {
      const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/'; 
      await fetch(basePath + 'api/update', { method: 'POST' });
      alert("Update triggered! The server will restart shortly. Please refresh the page in a few moments.");
    } catch (err) {
      alert("Update failed: " + err.message);
    }
  }

  const handleSwipeDelete = (jobId) => {
    setJobs(prev => prev.filter(j => j.id !== jobId))
  }

  const JobCard = ({ job, onClick, onDelete }) => {
    const [offsetX, setOffsetX] = useState(0)
    const [isSwiping, setIsSwiping] = useState(false)
    const startX = useRef(0)
    const isFinished = !['RUNNING', 'PENDING'].includes(job.status)

    const handleTouchStart = (e) => {
      if (!isFinished) return
      startX.current = e.touches[0].clientX
      setIsSwiping(true)
    }

    const handleTouchMove = (e) => {
      if (!isSwiping || !isFinished) return
      const currentX = e.touches[0].clientX
      const diff = currentX - startX.current
      if (diff < 0) {
        setOffsetX(diff)
      }
    }

    const handleTouchEnd = () => {
      if (!isSwiping || !isFinished) return
      setIsSwiping(false)
      if (offsetX < -100) {
        onDelete(job.id)
      } else {
        setOffsetX(0)
      }
    }

    return (
      <div className="job-item-wrapper" style={{ position: 'relative', overflow: 'hidden' }}>
        {isFinished && (
          <div className="delete-bg" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: '12px', backgroundColor: '#ff3b30', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '20px', zIndex: 0, color: 'white', borderRadius: '16px' }}>
            <Trash2 size={24} />
          </div>
        )}
        <div 
          className="job-item" 
          onClick={onClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: `translateX(${offsetX}px)`,
            transition: isSwiping ? 'none' : 'transform 0.3s ease',
            position: 'relative',
            zIndex: 1,
            backgroundColor: 'var(--card-bg)'
          }}
        >
          <div className={`status-dot status-${job.status?.toLowerCase() || 'pending'}`}></div>
          <div className="job-details">
            <div className="job-title">{job.name}</div>
            <div className="job-meta">
              <span className="meta-item">#{job.id}</span>
              {job.status === 'PENDING' && job.startTime && job.startTime !== 'N/A' && job.startTime !== 'None' ? (
                <span className="meta-item"><Clock size={12} /> Starts: {job.startTime.replace('T', ' ').replace(/:\d\d$/, '')}</span>
              ) : (
                <span className="meta-item"><Clock size={12} /> {job.time}</span>
              )}
              <span className="meta-item"><Layers size={12} /> {job.partition}</span>
            </div>
          </div>
          <div className="job-status">
            <span className="status-text">{job.status}</span>
            <span className="status-partition">{job.partition}</span>
          </div>
          <ChevronRight size={16} className="chevron" />
        </div>
      </div>
    )
  }

  const renderConnect = () => (
    <>
      <div className="header">
        <h1>SlurmWatch</h1>
        <button className="icon-btn" onClick={() => setShowSettings(true)}><Menu size={20} /></button>
      </div>
      <div className="connect-screen">
        <div className="connect-content">
          <div className="connect-icon-wrapper">
            <Server size={64} strokeWidth={1.5} />
          </div>
          <h2>SLURM Job Monitor</h2>
          <p>Monitor your cluster jobs in real-time</p>
        </div>
        
        <div className="connect-actions">
          <button className="connect-btn btn-primary" onClick={() => handleConnect()}>
            Connect
          </button>
          {status && <div className="status-message">{status}</div>}
        </div>
      </div>
    </>
  )

  const renderList = () => (
    <>
      <div className="top-bar-container">
        <div className="header">
          <div className="header-left">
            <h1>HPCWATCH</h1>
          </div>
          <div className="header-right">
            <button className="icon-btn" onClick={() => setShowSettings(true)}><Menu size={20} /></button>
            <button className="icon-btn" onClick={handleAppUpdate} title="Check for Updates">
              <DownloadCloud size={20} />
            </button>
          </div>
        </div>
        
        <div className="top-bar-user-stats">
          <div className="top-bar-profile">
            <User size={32} className="top-bar-user-icon" />
            <span className="top-bar-username">{username}</span>
          </div>
          
          <div className="unified-stats-row">
            <div className="unified-stat-section balance-section">
              <div className="stat-title"><CreditCard size={14} /> Balance</div>
              {typeof userStats.balance === 'object' && !userStats.balance.error ? (
                <div className="balance-grid">
                  <div className="balance-item">
                    <Cpu size={14} style={{color: 'var(--primary)'}} />
                    <span>CPU: {userStats.balance.cpu?.toLocaleString()} SUs</span>
                  </div>
                  <div className="balance-item">
                    <CircuitBoard size={14} style={{color: '#34C759'}} />
                    <span>GPU: {userStats.balance.gpu?.toLocaleString()} SUs</span>
                  </div>
                </div>
              ) : (
                <div className="stat-value">{userStats.balance?.error || userStats.balance}</div>
              )}
            </div>
            
            <div className="unified-stat-divider"></div>
            
            <div className="unified-stat-section storage-section">
              <div className="stat-title"><HardDrive size={14} /> Storage</div>
              {(() => {
                const storageObj = parseStorage(userStats.storage);
                let color = '#34C759'; // green
                if (storageObj.percent > 80) color = '#FF9500'; // orange
                if (storageObj.percent > 90) color = '#FF3B30'; // red
                
                return (
                  <div className="storage-container">
                    <div className="stat-value">{storageObj.text}</div>
                    {storageObj.percent > 0 && (
                      <div className="storage-progress-bg">
                        <div className="storage-progress-fill" style={{ width: `${storageObj.percent}%`, backgroundColor: color }}></div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
      
      <div className="list-screen">
        {jobs.length === 0 ? (
          <div className="empty-jobs">
            <Layers size={48} className="empty-icon" />
            <h3>No Active Jobs</h3>
            <p>You don't have any jobs in the queue right now.</p>
          </div>
        ) : (
          jobs.map(job => (
            <JobCard 
              key={job.id} 
              job={job} 
              onClick={() => {
                setSelectedJob(job)
                setView('detail')
              }} 
              onDelete={handleSwipeDelete}
            />
          ))
        )}
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="settings-section">
              <label>Theme</label>
              <button className="theme-toggle-btn" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
                {theme === 'light' ? <><Moon size={16}/> Dark Mode</> : <><Sun size={16}/> Light Mode</>}
              </button>
            </div>
            <div className="settings-section">
              <label>Account</label>
              <button className="theme-toggle-btn logout-btn" onClick={handleLogout}>
                <LogOut size={16} style={{marginRight: '8px'}} /> Sign Out / Switch User
              </button>
            </div>
            <button className="close-modal-btn" onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  )

  const parseSlurmTime = (timeStr) => {
    if (!timeStr || timeStr === 'N/A' || timeStr === 'None') return 0;
    // Format: DD-HH:MM:SS or HH:MM:SS or MM:SS
    let days = 0;
    let parts = timeStr;
    if (timeStr.includes('-')) {
      const split = timeStr.split('-');
      days = parseInt(split[0], 10) || 0;
      parts = split[1];
    }
    const timeParts = parts.split(':').map(n => parseInt(n, 10) || 0);
    let seconds = 0;
    if (timeParts.length === 3) {
      seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
      seconds = timeParts[0] * 60 + timeParts[1];
    }
    return days * 86400 + seconds;
  };

  const renderTimeline = () => {
    const elapsed = parseSlurmTime(jobDetails?.runTime || selectedJob?.time);
    const limit = parseSlurmTime(jobDetails?.timeLimit || selectedJob?.timeLimit);
    let progress = 0;
    if (limit > 0 && elapsed > 0) {
      progress = Math.min(100, Math.round((elapsed / limit) * 100));
    }
    
    const isRunning = selectedJob?.status?.toUpperCase() === 'RUNNING';
    const isCompleted = selectedJob?.status?.toUpperCase() === 'COMPLETED';
    const isPending = selectedJob?.status?.toUpperCase() === 'PENDING';
    const isFailed = !isRunning && !isCompleted && !isPending;
    
    const submitted = jobDetails?.submitTime ? jobDetails.submitTime.replace('T', ' ') : '-';
    const started = jobDetails?.startTime && jobDetails.startTime !== 'Unknown' 
      ? jobDetails.startTime.replace('T', ' ') 
      : (selectedJob?.startTime && selectedJob.startTime !== 'N/A' && selectedJob.startTime !== 'None'
          ? selectedJob.startTime.replace('T', ' ')
          : '-');
    let ended = jobDetails?.endTime && jobDetails.endTime !== 'Unknown' ? jobDetails.endTime.replace('T', ' ') : '-';
    if (ended === '-') ended = jobDetails?.timeLimit || selectedJob?.timeLimit || '-';
    
    let seg1Fill = 0;
    let seg2Fill = 0;
    if (!isPending) seg1Fill = 100;
    if (isRunning) seg2Fill = progress;
    if (isCompleted || isFailed) seg2Fill = 100;

    return (
      <div className="timeline-container">
        <div className="timeline-rows">
          
          <div className="timeline-row">
            <div className="node-icon-col">
              <div className="node-dot active"></div>
              <div className="timeline-segment">
                <div className="timeline-segment-fill active" style={{height: `${seg1Fill}%`}}></div>
              </div>
            </div>
            <div className="node-text-col active">
              <div className="node-label">Submitted</div>
              <div className="node-time">{submitted}</div>
            </div>
          </div>
          
          <div className="timeline-row">
            <div className="node-icon-col">
              <div className={`node-dot ${!isPending ? 'active' : ''} ${isRunning ? 'pulsing' : ''}`}></div>
              <div className="timeline-segment">
                <div className={`timeline-segment-fill ${isFailed ? 'failed' : 'active'}`} style={{height: `${seg2Fill}%`}}></div>
              </div>
            </div>
            <div className={`node-text-col ${!isPending ? 'active' : ''}`}>
              <div className="node-label">{isPending ? 'Starts (Est)' : 'Started'}</div>
              <div className="node-time">{started}</div>
            </div>
          </div>
          
          <div className="timeline-row">
            <div className="node-icon-col">
              <div className={`node-dot ${isCompleted ? 'active' : ''} ${isFailed ? 'failed' : ''}`}></div>
            </div>
            <div className={`node-text-col ${isCompleted ? 'active' : ''} ${isFailed ? 'failed' : ''}`}>
              <div className="node-label">{isCompleted ? 'Ended' : (isFailed ? 'Failed' : 'Deadline')}</div>
              <div className="node-time">{ended}</div>
            </div>
          </div>

        </div>
        
        {isRunning && (
          <div className="timeline-meta">
            <span>Elapsed: {jobDetails?.runTime || selectedJob?.time}</span>
            <span>{progress}%</span>
          </div>
        )}
      </div>
    );
  };

  const renderAllocatedTags = () => {
    const allocStr = jobDetails?.allocTres || '';
    if (!allocStr) {
      return jobDetails?.numCPUs ? <span className="resource-tag tag-cpu"><Cpu size={12}/> {jobDetails.numCPUs} CPU{jobDetails.numCPUs > 1 ? 's' : ''}</span> : <span className="row-val">-</span>;
    }
    
    const parts = allocStr.split(',');
    return (
      <div className="resource-tags-container">
        {parts.map((part, idx) => {
          const [key, val] = part.split('=');
          if (!val) return null;
          
          let icon = null;
          let className = 'tag-neutral';
          let displayName = val;
          let displayKey = key;
          
          if (key === 'cpu') {
            icon = <Cpu size={12} />;
            className = 'tag-cpu';
            displayName = `${val} Cores`;
            displayKey = '';
          } else if (key === 'mem') {
            icon = <Microchip size={12} />;
            className = 'tag-mem';
            displayName = val;
            displayKey = 'RAM: ';
          } else if (key.includes('gpu')) {
            icon = <CircuitBoard size={12} />;
            className = 'tag-gpu';
            displayKey = key.split('/')[1] || 'gpu';
            displayKey = displayKey.toUpperCase() + ': ';
          } else if (key === 'node') {
            icon = <Server size={12} />;
            className = 'tag-node';
            displayName = `${val} Node${val > 1 ? 's' : ''}`;
            displayKey = '';
          } else if (key === 'billing') {
            icon = <Coins size={12} />;
            className = 'tag-billing';
            displayKey = 'Billing: ';
          } else {
            displayKey = key + ': ';
          }
          
          return (
            <span key={idx} className={`resource-tag ${className}`}>
              {icon} {displayKey}{displayName}
            </span>
          );
        })}
      </div>
    );
  };

  const renderDetail = () => (
    <>
      <div className="detail-header">
        <button className="back-btn" onClick={() => setView('list')}>
          <ChevronLeft size={24} />
        </button>
        <div className="detail-title">{selectedJob?.name}</div>
        <button className="back-btn" onClick={fetchJobDetails} disabled={detailLoading}>
          <RotateCw size={20} className={detailLoading ? "spin" : ""} />
        </button>
      </div>
      
      <div className="detail-screen modern-details">
        <div className="detail-info-modern">
          <div className="info-top-modern">
            <div className={`status-badge status-text-${selectedJob?.status?.toLowerCase() || 'pending'}`}>
              <div className={`status-dot status-${selectedJob?.status?.toLowerCase() || 'pending'}`}></div>
              {selectedJob?.status}
            </div>
            <div className="job-id-badge">#{selectedJob?.id}</div>
          </div>

          <div className="detail-section timeline-section">
            <h4 className="section-label">Job Timeline</h4>
            {renderTimeline()}
          </div>

          <div className="detail-section">
            <h4 className="section-label">Resources</h4>
            <div className="detail-row">
              <span className="row-label"><Layers size={14}/> Partition</span>
              <span className="row-val">{jobDetails?.partition || selectedJob?.partition}</span>
            </div>
            <div className="detail-row">
              <span className="row-label"><Monitor size={14}/> Node List</span>
              <span className="row-val">{jobDetails?.nodeList || selectedJob?.nodeList || '-'}</span>
            </div>
            <div className="detail-row" style={{ alignItems: 'flex-start' }}>
              <span className="row-label"><Zap size={14}/> Allocated</span>
              <div className="row-val-tags">{renderAllocatedTags()}</div>
            </div>
          </div>

          {jobDetails?.command && (
            <div className="detail-section">
              <h4 className="section-label">Command</h4>
              <div className="command-box">
                <Terminal size={14} className="command-icon" />
                <span>{jobDetails.command}</span>
              </div>
            </div>
          )}
        </div>
        
        {detailLoading ? (
          <div style={{padding: '24px', textAlign: 'center', color: 'var(--text-secondary)'}}>Loading advanced details...</div>
        ) : (
          jobDetails?.efficiency ? (
            <div className="efficiency-section">
              <div className="section-title">Resource Efficiency</div>
              <div className="rings-container">
                <div className="ring-wrapper">
                  <div className="ring" style={{'--percentage': `${jobDetails.efficiency.cpuPercent || 0}%`, '--ring-color': '#FF9500'}}>
                    <div className="ring-inner">
                      <Cpu size={14} />
                      <span>{jobDetails.efficiency.cpuPercent || 0}%</span>
                    </div>
                  </div>
                  <div className="ring-label">CPU</div>
                  <div className="ring-sub">{jobDetails.efficiency.cpuUtilized || '0'} / {jobDetails.efficiency.cpuCoreWalltime || '0'}</div>
                </div>
                <div className="ring-wrapper">
                  <div className="ring" style={{'--percentage': `${jobDetails.efficiency.memPercent || 0}%`, '--ring-color': '#FF3B30'}}>
                    <div className="ring-inner">
                      <Battery size={14} />
                      <span>{jobDetails.efficiency.memPercent || 0}%</span>
                    </div>
                  </div>
                  <div className="ring-label">Memory</div>
                  <div className="ring-sub">{jobDetails.efficiency.memUtilized || '0'} / {jobDetails.efficiency.memLimit || '0'}</div>
                </div>
              </div>
            </div>
          ) : null
        )}
      </div>
    </>
  )

  return (
    <div className="app-container">
      {view === 'connect' && renderConnect()}
      {view === 'list' && renderList()}
      {view === 'detail' && renderDetail()}
    </div>
  )
}

export default App
