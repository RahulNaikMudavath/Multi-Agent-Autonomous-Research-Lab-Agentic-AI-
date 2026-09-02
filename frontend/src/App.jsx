import React, { useState, useRef, useEffect } from 'react';
import { FlaskConical, BookOpen } from 'lucide-react';
import ControlPanel from './components/ControlPanel';
import AgentGraph from './components/AgentGraph';
import LogsPanel from './components/LogsPanel';
import ReportViewer from './components/ReportViewer';
import HistoryDrawer from './components/HistoryDrawer';
import './App.css';

export default function App() {
  // Config state
  const [query, setQuery] = useState(() => localStorage.getItem('research_query') || 'Compare the performance of PGVector vs. Milvus for 1M vectors');
  const [mode, setMode] = useState(() => localStorage.getItem('research_mode') || 'real');
  const [provider, setProvider] = useState(() => localStorage.getItem('research_provider') || 'groq');
  const [model, setModel] = useState(() => localStorage.getItem('research_model') || 'openai/gpt-oss-120b');
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

  // History / Dossiers Drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('research_dossiers_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const wsRef = useRef(null);

  // Auto-save completed session into Dossiers History
  const saveSessionToHistory = (sessionQuery, fReport, dReport, results, pMode, pProvider, pModel) => {
    const reportText = fReport || dReport;
    if (!reportText) return;

    const newRecord = {
      id: 'dossier_' + Date.now(),
      timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      query: sessionQuery || query,
      mode: pMode || mode,
      provider: pProvider || provider,
      model: pModel || model,
      draftReport: dReport,
      finalReport: fReport,
      researchResults: results || []
    };

    setHistory(prev => {
      const filtered = prev.filter(item => item.query.toLowerCase() !== newRecord.query.toLowerCase());
      const updated = [newRecord, ...filtered].slice(0, 30);
      try {
        localStorage.setItem('research_dossiers_v1', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save dossier to localStorage', err);
      }
      return updated;
    });
  };

  const loadSession = (item) => {
    setQuery(item.query || '');
    if (item.mode) setMode(item.mode);
    if (item.provider) setProvider(item.provider);
    if (item.model) setModel(item.model);
    setDraftReport(item.draftReport || null);
    setFinalReport(item.finalReport || null);
    setResearchResults(item.researchResults || []);
    setActiveAgent('Finalize');
    setLogs([
      {
        agent: 'System',
        status: 'completed',
        message: `Restored saved research dossier: "${item.query}" (${item.timestamp})`
      }
    ]);
  };

  const deleteSession = (id) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      try {
        localStorage.setItem('research_dossiers_v1', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to update localStorage', err);
      }
      return updated;
    });
  };

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear all saved research dossiers?')) {
      setHistory([]);
      try {
        localStorage.removeItem('research_dossiers_v1');
      } catch {}
    }
  };

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

          if (data.active_agent === 'Finalize') {
            saveSessionToHistory(
              query,
              data.final_report || finalReport,
              data.draft_report || draftReport,
              data.research_results || researchResults,
              mode,
              provider,
              model
            );
          }
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
    if (awaitingReview) return 'active';
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
          <FlaskConical className="logo-icon" size={22} />
          <h1>Multi-Agent Autonomous Research Lab</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Dossiers Library Toggle */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            title="Open saved research dossiers"
          >
            <BookOpen size={13} style={{ color: 'var(--accent-cyan)' }} />
            <span>Dossiers</span>
            {history.length > 0 && (
              <span style={{
                background: 'rgba(0, 240, 255, 0.15)',
                color: 'var(--accent-cyan)',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '0.68rem',
                fontWeight: 700
              }}>
                {history.length}
              </span>
            )}
          </button>

          <div className="header-status">
            <span className={`status-dot ${getStatusClass()}`} />
            <span>Status: <strong>{getStatusText()}</strong></span>
          </div>
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
          {/* Report Viewer with Tabs: Document, Visual Charts, Ask AI, Sources */}
          <ReportViewer 
            query={query}
            draftReport={draftReport} 
            finalReport={finalReport} 
            researchResults={researchResults}
            isRunning={isRunning}
            activeAgent={activeAgent}
            provider={provider}
            model={model}
            apiKey={apiKey}
          />

          {/* Console Logs */}
          <LogsPanel logs={logs} />
        </div>
      </div>

      {/* History Dossiers Slide-out Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        onClearHistory={clearHistory}
      />
    </div>
  );
}

