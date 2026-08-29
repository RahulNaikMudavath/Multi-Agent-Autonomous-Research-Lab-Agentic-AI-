import React, { useState, useRef, useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import ControlPanel from './components/ControlPanel';
import AgentGraph from './components/AgentGraph';
import LogsPanel from './components/LogsPanel';
import ReportViewer from './components/ReportViewer';
import './App.css';

export default function App() {
  // Config state
  const [query, setQuery] = useState('Compare the performance of PGVector vs. Milvus for 1M vectors');
  const [mode, setMode] = useState('simulation');
  const [provider, setProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  
  // Execution status state
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState(null);
  const [logs, setLogs] = useState([]);
  const [draftReport, setDraftReport] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  
  const wsRef = useRef(null);

  const startResearch = () => {
    if (isRunning) return;

    setIsRunning(true);
    setActiveAgent('Coordinator');
    setLogs([
      { agent: 'System', status: 'planning', message: `Initializing Multi-Agent Research Session [Mode: ${mode.toUpperCase()}]...` }
    ]);
    setDraftReport(null);
    setFinalReport(null);

    // Initialize WebSocket connection
    const ws = new WebSocket('ws://localhost:8000/ws/research');
    wsRef.current = ws;

    ws.onopen = () => {
      // Send execution configuration payload
      const payload = {
        query,
        mode,
        provider,
        api_key: apiKey,
        tavily_key: tavilyKey
      };
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          setLogs(prev => [...prev, { agent: 'System', status: 'error', message: `Server error: ${data.error}` }]);
          setIsRunning(false);
          setActiveAgent('Error');
          return;
        }

        // Update application state from LangGraph state frame
        if (data.active_agent) setActiveAgent(data.active_agent);
        if (data.logs) setLogs(data.logs);
        if (data.draft_report) setDraftReport(data.draft_report);
        if (data.final_report) setFinalReport(data.final_report);

        // Terminate UI execution if workflow is finalized or errored
        if (data.active_agent === 'Finalize' || data.active_agent === 'Error') {
          setIsRunning(false);
          ws.close();
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket connection error', err);
      setLogs(prev => [...prev, { agent: 'System', status: 'error', message: 'WebSocket connection encountered an error.' }]);
      setIsRunning(false);
      setActiveAgent('Error');
    };

    ws.onclose = () => {
      setIsRunning(false);
      console.log('WebSocket connection closed.');
    };
  };

  const stopResearch = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsRunning(false);
    setActiveAgent(null);
    setLogs(prev => [...prev, { agent: 'System', status: 'error', message: 'Research process aborted by user.' }]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getStatusText = () => {
    if (!isRunning) return 'Ready';
    if (activeAgent === 'Finalize') return 'Completed';
    if (activeAgent === 'Error') return 'Failed';
    return `Agent ${activeAgent} Active`;
  };

  const getStatusClass = () => {
    if (!isRunning) return 'idle';
    if (activeAgent === 'Finalize') return 'completed';
    if (activeAgent === 'Error') return 'error';
    return 'active';
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-panel app-header">
        <div className="header-logo">
          <FlaskConical className="logo-icon" size={24} />
          <h1>Multi-Agent Autonomous Research Lab</h1>
        </div>
        <div className="header-status">
          <span className={`status-dot ${getStatusClass()}`} />
          <span>Status: <strong>{getStatusText()}</strong></span>
        </div>
      </header>

      {/* Control Configuration Panel */}
      <ControlPanel
        query={query}
        setQuery={setQuery}
        mode={mode}
        setMode={setMode}
        provider={provider}
        setProvider={setProvider}
        apiKey={apiKey}
        setApiKey={setApiKey}
        tavilyKey={tavilyKey}
        setTavilyKey={setTavilyKey}
        isRunning={isRunning}
        onStart={startResearch}
        onStop={stopResearch}
      />

      {/* Grid Dashboard */}
      <div className="dashboard-grid">
        {/* Left: React Flow Visualization of Collaboration */}
        <div className="left-column">
          <div className="glass-panel visualizer-panel">
            <div className="panel-title">
              Agent Collaboration Graph
            </div>
            <AgentGraph activeAgent={activeAgent} logs={logs} />
          </div>
        </div>

        {/* Right: Reports and Logs Console Output */}
        <div className="right-column">
          {/* Report Viewer */}
          <ReportViewer 
            draftReport={draftReport} 
            finalReport={finalReport} 
            isRunning={isRunning}
            activeAgent={activeAgent}
          />

          {/* Console Logs */}
          <LogsPanel logs={logs} />
        </div>
      </div>
    </div>
  );
}
