import { useState, useEffect } from 'react'
import { Settings, Server, LogOut, RotateCw, ChevronRight, ChevronLeft, Layers, Monitor, Clock, Battery, Cpu, FileText, DownloadCloud } from 'lucide-react'
import { io } from 'socket.io-client'
import './App.css'

function App() {
  const [view, setView] = useState('connect') // 'connect', 'list', 'detail'
  const [selectedJob, setSelectedJob] = useState(null)
  const [activeTab, setActiveTab] = useState('out')
  const [jobs, setJobs] = useState([])
  const [socket, setSocket] = useState(null)
  const [status, setStatus] = useState('')
  const [username, setUsername] = useState('')

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect()
    }
  }, [socket])

  const initSocket = (baseUri, user) => {
    setStatus('Connecting to WebSocket...')
    setUsername(user)
    
    const newSocket = io(window.location.origin, {
      path: baseUri.replace(/\/$/, '') + '/socket.io',
      withCredentials: true
    })

    newSocket.on('connect', () => {
      setStatus('Connected')
      setView('list')
    })

    newSocket.on('jobs_update', (jobsData) => {
      const mappedJobs = jobsData.map(j => ({
        ...j,
        status: j.state,
      }))
      setJobs(mappedJobs)
      
      setSelectedJob(prev => {
        if (!prev) return null;
        return mappedJobs.find(j => j.id === prev.id) || prev;
      });
    })

    newSocket.on('disconnect', () => {
      setStatus('Disconnected')
    })

    setSocket(newSocket)
  }

  const handleConnect = async () => {
    setStatus('Connecting...')
    try {
      const res = await fetch('api/config')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.baseUri) {
        initSocket(data.baseUri, data.username)
      }
    } catch (err) {
      setStatus(`Connection failed: ${err.message}. Retrying...`)
      setTimeout(() => handleConnect(), 3000)
    }
  }

  const renderConnect = () => (
    <>
      <div className="header">
        <h1>SlurmWatch</h1>
        <button className="icon-btn"><Settings size={20} /></button>
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
          <button className="connect-btn btn-primary" onClick={handleConnect}>
            Connect
          </button>
          <button className="connect-btn btn-secondary">
            Configure Connection
          </button>
          {status && <div className="status-message">{status}</div>}
        </div>
      </div>
    </>
  )

  const handleAppUpdate = async () => {
    if (!window.confirm("Check for updates and restart the app?")) return;
    try {
      setStatus('Checking for updates...');
      const res = await fetch('api/update', { method: 'POST' });
      const data = await res.json();
      if (data.updated) {
        alert("App updated successfully! It will restart now.");
        window.location.reload();
      } else if (data.error) {
        alert("Failed to update: " + data.error);
      } else {
        alert("App is already up to date.");
      }
      setStatus('Connected');
    } catch (err) {
      alert("Error checking for updates: " + err.message);
      setStatus('Connected');
    }
  };

  const renderList = () => (
    <>
      <div className="header">
        <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
          <button className="icon-btn" onClick={() => {
            if (socket) socket.disconnect()
            setSocket(null)
            setView('connect')
            setStatus('')
          }}><LogOut size={20} /></button>
          <h1>SlurmWatch</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={handleAppUpdate} title="Check for Updates">
            <DownloadCloud size={20} />
          </button>
          <button className="icon-btn"><Settings size={20} /></button>
          <button className="icon-btn"><RotateCw size={20} /></button>
        </div>
      </div>
      <div className="list-screen">
        {jobs.map(job => (
          <div key={job.id} className="job-item" onClick={() => {
            setSelectedJob(job)
            setView('detail')
          }}>
            <div className="status-dot"></div>
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
        ))}
      </div>
    </>
  )

  const renderDetail = () => (
    <>
      <div className="detail-header">
        <button className="back-btn" onClick={() => setView('list')}>
          <ChevronLeft size={24} />
        </button>
        <div className="detail-title">{selectedJob?.name}</div>
        <button className="back-btn"><RotateCw size={20} /></button>
      </div>
      
      <div className="detail-screen">
        <div className="detail-info">
          <div className="info-top">
            <div className="info-status">
              <div className="status-dot"></div>
              {selectedJob?.status}
            </div>
            <div>ID: {selectedJob?.id}</div>
          </div>
          
          <div className="info-grid">
            <div className="grid-item"><Layers size={14} /> Partition: <span className="grid-val">{selectedJob?.partition}</span></div>
            <div className="grid-item"><Cpu size={14} /> CPUs: <span className="grid-val">12</span></div>
            <div className="grid-item"><Monitor size={14} /> Node List: <span className="grid-val">pike</span></div>
            <div className="grid-item"><Battery size={14} /> RAM: <span className="grid-val">2.0 GB / 16.0 GB</span></div>
            <div className="grid-item"><Clock size={14} /> Elapsed: <span className="grid-val">{selectedJob?.time}</span></div>
            <div className="grid-item"><Clock size={14} /> Limit: <span className="grid-val">10-00:00:00</span></div>
          </div>
        </div>
        
        <div className="efficiency-section">
          <div className="section-title">Resource Efficiency</div>
          <div className="rings-container">
            <div className="ring-wrapper">
              <div className="ring" style={{'--percentage': '25%', '--ring-color': '#FF9500'}}>
                <div className="ring-inner">
                  <Cpu size={14} />
                  <span>25%</span>
                </div>
              </div>
              <div className="ring-label">CPU</div>
              <div className="ring-sub">5-21:25:17 / 22-18:17:12</div>
            </div>
            <div className="ring-wrapper">
              <div className="ring" style={{'--percentage': '12%', '--ring-color': '#FF3B30'}}>
                <div className="ring-inner">
                  <Battery size={14} />
                  <span>12%</span>
                </div>
              </div>
              <div className="ring-label">Memory</div>
              <div className="ring-sub">2.0 GB / 16.0 GB</div>
            </div>
            <div className="ring-wrapper">
              <div className="ring" style={{'--percentage': '18%', '--ring-color': '#FF3B30'}}>
                <div className="ring-inner">
                  <Clock size={14} />
                  <span>18%</span>
                </div>
              </div>
              <div className="ring-label">Time</div>
              <div className="ring-sub">{selectedJob?.time} / 10-00:00:00</div>
            </div>
          </div>
          
          <div className="time-stats">
            <div><Clock size={12} style={{display: 'inline', marginRight: '4px', verticalAlign: '-2px'}}/> Wall-clock time: <span className="time-val">{selectedJob?.time}</span></div>
            <div>Core-walltime: <span className="time-val">22-18:17:12</span></div>
          </div>
        </div>
        
        <div className="tabs-section">
          <div className="section-title">Select Log File</div>
          <div className="tabs">
            <div className={`tab ${activeTab === 'out' ? 'active' : ''}`} onClick={() => setActiveTab('out')}>
              Standard Output (.out)
            </div>
            <div className={`tab ${activeTab === 'err' ? 'active' : ''}`} onClick={() => setActiveTab('err')}>
              Standard Error (.err)
            </div>
          </div>
          
          <div className="empty-state">
            <FileText size={48} className="empty-icon" />
            <h3>Empty File</h3>
            <p>The requested log file exists but is currently empty.</p>
          </div>
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
