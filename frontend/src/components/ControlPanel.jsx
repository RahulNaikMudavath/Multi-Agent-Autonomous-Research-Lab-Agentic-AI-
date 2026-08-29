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
  isRunning, 
  onStart, 
  onStop 
}) {
  const [showSettings, setShowSettings] = useState(false);

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
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              {mode === 'simulation' 
                ? '💡 Simulation Mode runs a realistic, cyclic multi-agent run with mock data. Zero API keys required.'
                : '⚡ Real Agent Mode spawns active LangGraph pipelines using live API calls and search scrapes.'}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
