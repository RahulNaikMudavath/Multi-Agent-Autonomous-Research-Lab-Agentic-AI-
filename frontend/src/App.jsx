import React, { useState, useRef, useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import ControlPanel from './components/ControlPanel';
import AgentGraph from './components/AgentGraph';
import LogsPanel from './components/LogsPanel';
import ReportViewer from './components/ReportViewer';
import './App.css';

export default function App() {
  // Config state
  const [query, setQuery] = useState(() => localStorage.getItem('research_query') || 'Compare the performance of PGVector vs. Milvus for 1M vectors');
  const [mode, setMode] = useState(() => localStorage.getItem('research_mode') || 'real');
  const [provider, setProvider] = useState(() => localStorage.getItem('research_provider') || 'gemini');
  const [model, setModel] = useState(() => localStorage.getItem('research_model') || 'gemini-3.6-flash');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('research_api_key') || '');
  const [tavilyKey, setTavilyKey] = useState(() => localStorage.getItem('research_tavily_key') || '');
  const [speed, setSpeed] = useState(() => {
    const savedSpeed = localStorage.getItem('research_speed');
    return savedSpeed ? parseFloat(savedSpeed) : 1;
  });
  
  // Execution status state
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState(null);
  const [logs, setLogs] = useState([]);
  const [draftReport, setDraftReport] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  const [researchResults, setResearchResults] = useState([]);
  const [awaitingReview, setAwaitingReview] = useState(false);
  
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
    setResearchResults([]);
    setAwaitingReview(false);

    // Initialize dynamic WebSocket connection (auto-detects HTTPS/WSS in production on Render)
    const getWebSocketUrl = () => {
      if (import.meta.env.VITE_WS_URL) {
        return import.meta.env.VITE_WS_URL;
      }
      if (window.location.hostname === 'localhost' && window.location.port === '5173') {
        return 'ws://localhost:8000/ws/research';
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws/research`;
    };

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // Send execution configuration payload
      const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const payload = {
        type: 'start',
        run_id: runId,
        query,
        mode,
        provider,
        model,
        api_key: apiKey,
        tavily_key: tavilyKey,
        speed
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
          setAwaitingReview(false);
          return;
        }

        // Update application state from LangGraph state frame
        if (data.active_agent) setActiveAgent(data.active_agent);
        if (data.logs) setLogs(data.logs);
        if (data.draft_report) setDraftReport(data.draft_report);
        if (data.final_report) setFinalReport(data.final_report);
        if (data.research_results) setResearchResults(data.research_results);
        if (data.awaiting_review !== undefined) setAwaitingReview(data.awaiting_review);

        // Terminate UI execution if workflow is finalized or errored
        if (data.active_agent === 'Finalize' || data.active_agent === 'Error') {
          setIsRunning(false);
          setAwaitingReview(false);
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
      setAwaitingReview(false);
    };

    ws.onclose = () => {
      setIsRunning(false);
      setAwaitingReview(false);
      console.log('WebSocket connection closed.');
    };
  };

  const stopResearch = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'abort' }));
      wsRef.current.close();
    }
    setIsRunning(false);
    setAwaitingReview(false);
    setActiveAgent(null);
    setLogs(prev => [...prev, { agent: 'System', status: 'error', message: 'Research process aborted by user.' }]);
  };

  const sendReview = (feedbackText) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'review',
        feedback: feedbackText
      }));
      setAwaitingReview(false);
      // Locally echo the action in logs
      setLogs(prev => [...prev, {
        agent: 'System',
        status: 'planning',
        message: feedbackText.toLowerCase() === 'approve'
          ? 'Human Editor: Approved report draft.'
          : `Human Editor requested revisions: "${feedbackText}"`
      }]);
    }
  };

  // Persist config to localStorage
  useEffect(() => {
    localStorage.setItem('research_mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('research_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('research_model', model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem('research_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('research_tavily_key', tavilyKey);
  }, [tavilyKey]);

  useEffect(() => {
    localStorage.setItem('research_query', query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem('research_speed', speed.toString());
  }, [speed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getStatusText = () => {
    if (awaitingReview) return 'Awaiting Human Review';
    if (!isRunning) return 'Ready';
    if (activeAgent === 'Finalize') return 'Completed';
    if (activeAgent === 'Error') return 'Failed';
    return `Agent ${activeAgent} Active`;
  };

  const getStatusClass = () => {
    if (awaitingReview) return 'active'; // or custom pulsing
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
        model={model}
        setModel={setModel}
        apiKey={apiKey}
        setApiKey={setApiKey}
        tavilyKey={tavilyKey}
        setTavilyKey={setTavilyKey}
        speed={speed}
        setSpeed={setSpeed}
        isRunning={isRunning}
        awaitingReview={awaitingReview}
        onSendReview={sendReview}
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
            researchResults={researchResults}
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
