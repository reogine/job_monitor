import { useState, useEffect, useRef } from 'react'
import { Settings, Server, LogOut, RotateCw, ChevronRight, ChevronLeft, Layers, Monitor, Clock, Battery, Cpu, FileText, DownloadCloud, User, HardDrive, CreditCard, Trash2, Moon, Sun } from 'lucide-react'
import { io } from 'socket.io-client'
import './App.css'

function App() {
  const [view, setView] = useState('connect') // 'connect', 'list', 'detail'
  const [selectedJob, setSelectedJob] = useState(null)
  const [activeTab, setActiveTab] = useState('out')
  const [jobs, setJobs] = useState([]) // persistent state
  const [socket, setSocket] = useState(null)
  const [status, setStatus] = useState('')
  const [username, setUsername] = useState('')
  
  const [jobDetails, setJobDetails] = useState(null)
  const [jobLogs, setJobLogs] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  
  const [userStats, setUserStats] = useState({ balance: 'Loading...', storage: 'Loading...' })
  
  // Theme state
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const [showSettings, setShowSettings] = useState(false)

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

  // Fetch job logs
  const fetchJobLogs = () => {
    if (view === 'detail' && selectedJob) {
      setLogLoading(true)
      setJobLogs('')
      const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      fetch(`${basePath}api/jobs/${selectedJob.id}/logs?type=${activeTab}`)
        .then(res => res.json())
        .then(data => {
          setJobLogs(data.content)
          setLogLoading(false)
        })
        .catch(err => {
          console.error(err)
          setJobLogs('Error fetching logs.')
          setLogLoading(false)
        })
    }
  }

  useEffect(() => {
    fetchJobLogs()
  }, [view, selectedJob, activeTab])

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
          <div className="delete-bg" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', backgroundColor: '#ff3b30', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '20px', zIndex: 0, color: 'white', borderRadius: '12px', marginBottom: '12px' }}>
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
              <span className="meta-item"><Clock size={12} /> {job.time}</span>
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
        <button className="icon-btn" onClick={() => setShowSettings(true)}><Settings size={20} /></button>
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
      <div className="header">
        <div className="header-left">
          <button className="icon-btn" onClick={() => setShowSettings(true)}><Settings size={20} /></button>
          <h1>SlurmWatch</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={handleAppUpdate} title="Check for Updates">
            <DownloadCloud size={20} />
          </button>
        </div>
      </div>
      
      <div className="list-screen">
        <div className="dashboard-stats">
          <div className="user-greeting">
            <User size={16} /> {username}
          </div>
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-title"><CreditCard size={14} /> Balance</div>
              <div className="stat-value">{userStats.balance}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title"><HardDrive size={14} /> Storage</div>
              <div className="stat-value">{userStats.storage}</div>
            </div>
          </div>
        </div>

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
            <h3>Settings</h3>
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
      
      <div className="detail-screen">
        <div className="detail-info">
          <div className="info-top">
            <div className="info-status">
              <div className={`status-dot status-${selectedJob?.status?.toLowerCase() || 'pending'}`}></div>
              {selectedJob?.status}
            </div>
            <div>ID: {selectedJob?.id}</div>
          </div>
          
          <div className="info-grid">
            <div className="grid-item"><Layers size={14} /> Partition: <span className="grid-val">{jobDetails?.partition || selectedJob?.partition}</span></div>
            <div className="grid-item"><Cpu size={14} /> CPUs: <span className="grid-val">{jobDetails?.numCPUs || '-'}</span></div>
            <div className="grid-item"><Monitor size={14} /> Node List: <span className="grid-val">{jobDetails?.nodeList || selectedJob?.nodeList || '-'}</span></div>
            <div className="grid-item"><Battery size={14} /> Min RAM: <span className="grid-val">{jobDetails?.minMemoryNode || '-'}</span></div>
            <div className="grid-item"><Clock size={14} /> Elapsed: <span className="grid-val">{jobDetails?.runTime || selectedJob?.time}</span></div>
            <div className="grid-item"><Clock size={14} /> Limit: <span className="grid-val">{jobDetails?.timeLimit || '-'}</span></div>
          </div>
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
              
              <div className="time-stats">
                <div><Clock size={12} style={{display: 'inline', marginRight: '4px', verticalAlign: '-2px'}}/> Wall-clock time: <span className="time-val">{jobDetails.efficiency.wallClockTime || '-'}</span></div>
                <div>Core-walltime: <span className="time-val">{jobDetails.efficiency.cpuCoreWalltime || '-'}</span></div>
              </div>
            </div>
          ) : null
        )}
        
        <div className="tabs-section">
          <div className="section-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>Select Log File</span>
            <button className="icon-btn" style={{padding: '4px', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={fetchJobLogs} disabled={logLoading}>
              <RotateCw size={14} className={logLoading ? "spin" : ""} style={{color: 'var(--text-secondary)'}} />
            </button>
          </div>
          <div className="tabs">
            <div className={`tab ${activeTab === 'out' ? 'active' : ''}`} onClick={() => setActiveTab('out')}>
              Standard Output (.out)
            </div>
            <div className={`tab ${activeTab === 'err' ? 'active' : ''}`} onClick={() => setActiveTab('err')}>
              Standard Error (.err)
            </div>
          </div>
          
          {logLoading ? (
            <div className="empty-state">
              <RotateCw size={48} className="empty-icon spin" />
              <h3>Loading Log...</h3>
            </div>
          ) : jobLogs ? (
            <div className="log-viewer">
              <pre>{jobLogs}</pre>
            </div>
          ) : (
            <div className="empty-state">
              <FileText size={48} className="empty-icon" />
              <h3>Empty File</h3>
              <p>The requested log file exists but is currently empty.</p>
            </div>
          )}
        </div>
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
