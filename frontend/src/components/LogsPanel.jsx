import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export default function LogsPanel({ logs }) {
  const terminalEndRef = useRef(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const getAgentClass = (agent) => {
    switch (agent.toLowerCase()) {
      case 'coordinator': return 'coordinator';
      case 'researcher': return 'researcher';
      case 'writer': return 'writer';
      case 'fact-checker': return 'fact-checker';
      case 'critic': return 'critic';
      default: return 'system';
    }
  };

  const formatTime = (index) => {
    // Standard mock increments for logs
    const date = new Date();
    date.setSeconds(date.getSeconds() - (logs.length - index) * 2);
    return date.toLocaleTimeString([], { hour12: false });
  };

  return (
    <div className="glass-panel logs-panel">
      <div className="panel-title">
        <Terminal size={16} /> Console Logs
      </div>
      <div className="logs-terminal">
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', marginTop: '10px' }}>
            No active research running. Waiting for trigger...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div className="log-entry" key={idx}>
              <span className="log-time">[{formatTime(idx)}]</span>
              <span className={`log-agent ${getAgentClass(log.agent)}`}>
                {log.agent.toUpperCase()}:
              </span>
              <span className={`log-msg ${log.status === 'error' ? 'error' : ''}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
