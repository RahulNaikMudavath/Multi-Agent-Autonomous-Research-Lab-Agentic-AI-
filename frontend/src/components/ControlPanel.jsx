import React, { useState } from 'react';
import { Play, Square, Settings, Key, Globe, Cpu } from 'lucide-react';

export default function ControlPanel({ 
  query, 
  setQuery, 
  mode, 
  setMode, 
  provider, 
  setProvider, 
  apiKey, 
  setApiKey, 
  tavilyKey, 
  setTavilyKey, 
  speed,
  setSpeed,
  isRunning, 
  awaitingReview,
  onSendReview,
  onStart, 
  onStop 
}) {
  const [showSettings, setShowSettings] = useState(() => {
    const storedKey = localStorage.getItem('research_api_key') || '';
    const storedMode = localStorage.getItem('research_mode') || 'real';
    return storedMode === 'real' && !storedKey;
  });
  const [revisionText, setRevisionText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim() || isRunning) return;
    onStart();
  };

  return (
    <div className="glass-panel control-panel">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="search-row">
          <input
            type="text"
            className="search-input"
            placeholder="Enter research topic (e.g., 'Compare PGVector vs Milvus performance for 1M vectors')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isRunning}
          />
          
          <button 
            type="button" 
            className="toggle-btn"
            style={{ 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              padding: '0 14px', 
              background: showSettings ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: showSettings ? 'var(--accent-cyan)' : 'var(--text-secondary)'
            }}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={18} />
          </button>

          {!isRunning ? (
            <button 
              type="submit" 
              className="btn-primary"
              disabled={!query.trim()}
            >
              <Play size={16} /> Run Research
            </button>
          ) : (
            <button 
              type="button" 
              className="btn-primary" 
              style={{ background: 'linear-gradient(135deg, var(--accent-red) 0%, #dc2626 100%)', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)' }}
              onClick={onStop}
            >
              <Square size={16} /> Abort
            </button>
          )}
        </div>

        {/* Collapsible Settings Panel */}
        {showSettings && (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px', 
              padding: '16px', 
              background: 'rgba(255,255,255,0.02)', 
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <div className="settings-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>Execution Mode</span>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${mode === 'simulation' ? 'active' : ''}`}
                    onClick={() => setMode('simulation')}
                    disabled={isRunning}
                  >
                    Simulation Mode
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${mode === 'real' ? 'active' : ''}`}
                    onClick={() => setMode('real')}
                    disabled={isRunning}
                  >
                    Real Agent Mode
                  </button>
                </div>
              </div>

              {mode === 'simulation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', animation: 'fadeIn 0.2s ease' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>Simulation Speed</span>
                  <div className="toggle-group">
                    {[
                      { label: '1x', value: 1 },
                      { label: '2x', value: 2 },
                      { label: '5x', value: 5 },
                      { label: 'Instant', value: 100 }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`toggle-btn ${speed === opt.value ? 'active' : ''}`}
                        onClick={() => setSpeed(opt.value)}
                        disabled={isRunning}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'real' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>LLM Provider</span>
                  <div className="toggle-group">
                    <button
                      type="button"
                      className={`toggle-btn ${provider === 'gemini' ? 'active' : ''}`}
                      onClick={() => setProvider('gemini')}
                      disabled={isRunning}
                    >
                      Gemini
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${provider === 'openai' ? 'active' : ''}`}
                      onClick={() => setProvider('openai')}
                      disabled={isRunning}
                    >
                      OpenAI
                    </button>
                  </div>
                </div>
              )}
            </div>

            {mode === 'real' && (
              <div 
                style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  flexWrap: 'wrap',
                  animation: 'fadeIn 0.2s ease'
                }}
              >
                <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Key size={12} /> {provider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder={`Enter ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API Key...`}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isRunning}
                  />
                </div>

                <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Globe size={12} /> Tavily API Key (Optional)
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Enter Tavily Search Key (falls back to scraping)..."
                    value={tavilyKey}
                    onChange={(e) => setTavilyKey(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
              </div>
            )}
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>
                {mode === 'simulation' 
                  ? '💡 Simulation Mode runs a realistic, cyclic multi-agent run with mock data. Zero API keys required.'
                  : '⚡ Real Agent Mode spawns active LangGraph pipelines using live API calls and search scrapes.'}
              </div>
              {mode === 'real' && (
                <div style={{ color: 'var(--accent-cyan)', opacity: 0.85 }}>
                  🔑 Tip: You can also set <code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, or <code>TAVILY_API_KEY</code> in a <code>backend/.env</code> file to skip entering them here.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Human-in-the-Loop Review Panel */}
        {awaitingReview && (
          <div style={{
            background: 'rgba(189, 92, 255, 0.08)',
            border: '1.5px solid var(--accent-purple)',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 0 15px rgba(189, 92, 255, 0.2)',
            marginTop: '8px',
            animation: 'pulse-slow 3s infinite ease-in-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-purple)', boxShadow: '0 0 8px var(--accent-purple)' }} />
                🛑 Human Editor Review Required
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Please review the draft output. Click Approve to publish, or request edits below.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', width: '100%', alignItems: 'stretch' }}>
              <textarea
                value={revisionText}
                onChange={(e) => setRevisionText(e.target.value)}
                placeholder="Type revision instructions here (e.g. 'Add a column for latency', 'Summarize index build details'...) and click Request Revision, or leave empty and click Approve & Publish."
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
                rows={2}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--accent-green) 0%, #059669 100%)', 
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                    padding: '8px 16px',
                    fontSize: '0.8rem',
                    height: '36px'
                  }}
                  onClick={() => {
                    onSendReview('approve');
                    setRevisionText('');
                  }}
                >
                  Approve & Publish
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '0.8rem',
                    height: '36px',
                    opacity: revisionText.trim() ? 1 : 0.5
                  }}
                  disabled={!revisionText.trim()}
                  onClick={() => {
                    onSendReview(revisionText);
                    setRevisionText('');
                  }}
                >
                  Request Revision
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
