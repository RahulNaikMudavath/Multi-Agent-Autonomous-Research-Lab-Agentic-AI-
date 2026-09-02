import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Trash2, 
  Download, 
  ExternalLink, 
  BookOpen, 
  Calendar, 
  Cpu, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function HistoryDrawer({ 
  isOpen, 
  onClose, 
  history = [], 
  onLoadSession, 
  onDeleteSession, 
  onClearHistory 
}) {
  const [searchTerm, setSearchTerm] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredHistory = history.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      (item.query && item.query.toLowerCase().includes(term)) ||
      (item.provider && item.provider.toLowerCase().includes(term)) ||
      (item.model && item.model.toLowerCase().includes(term))
    );
  });

  const exportSingleDossier = (item) => {
    const text = item.finalReport || item.draftReport || '';
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dossier_${(item.query || 'research').slice(0, 25).replace(/\s+/g, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAllDossiers = () => {
    if (history.length === 0) return;
    const allContent = history.map((item, i) => {
      const report = item.finalReport || item.draftReport || '';
      return `# Dossier ${i + 1}: ${item.query}\n*Date: ${item.timestamp} | Provider: ${item.provider} | Model: ${item.model}*\n\n${report}\n\n---\n`;
    }).join('\n');

    const blob = new Blob([allContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `all_research_dossiers_${new Date().toISOString().slice(0, 10)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.2s ease',
        cursor: 'pointer'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          maxWidth: '90vw',
          height: '100%',
          background: 'rgba(14, 16, 26, 0.95)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          gap: '16px',
          boxSizing: 'border-box',
          cursor: 'default'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            <BookOpen size={18} style={{ color: 'var(--accent-cyan)' }} />
            Research Dossiers ({history.length})
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search and Bulk Actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              className="search-input"
              placeholder="Filter past investigations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '32px', height: '34px', fontSize: '0.78rem' }}
            />
          </div>
          {history.length > 0 && (
            <button
              type="button"
              className="toggle-btn"
              title="Export all dossiers"
              style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 8px', height: '34px' }}
              onClick={exportAllDossiers}
            >
              <Download size={14} />
            </button>
          )}
          {history.length > 0 && (
            <button
              type="button"
              className="toggle-btn"
              title="Clear history"
              style={{ border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '0 8px', height: '34px', color: 'var(--accent-red)' }}
              onClick={onClearHistory}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Dossiers List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {filteredHistory.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              color: 'var(--text-dim)',
              textAlign: 'center',
              gap: '10px',
              padding: '20px'
            }}>
              <Sparkles size={32} style={{ color: 'var(--accent-purple)', opacity: 0.6 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                No Dossiers Found
              </div>
              <p style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                Every research query you execute is automatically saved here so you can revisit, export, or continue deep dives anytime.
              </p>
            </div>
          ) : (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'border-color 0.2s',
                  position: 'relative'
                }}
              >
                {/* Title and Load Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {item.query}
                  </div>
                  <button
                    type="button"
                    title="Load into workspace"
                    onClick={() => {
                      onLoadSession(item);
                      onClose();
                    }}
                    style={{
                      background: 'rgba(0, 240, 255, 0.1)',
                      border: '1px solid rgba(0, 240, 255, 0.3)',
                      color: 'var(--accent-cyan)',
                      borderRadius: '5px',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Load <ArrowRight size={12} />
                  </button>
                </div>

                {/* Metadata badges */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: item.mode === 'real' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: item.mode === 'real' ? 'var(--accent-green)' : 'var(--accent-yellow)',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {item.mode || 'REAL'}
                  </span>

                  <span style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-secondary)',
                    fontWeight: 500
                  }}>
                    {(item.provider || 'groq').toUpperCase()}
                  </span>

                  {item.model && (
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(189, 92, 255, 0.1)',
                      color: 'var(--accent-purple)',
                      fontWeight: 500
                    }}>
                      {item.model.split('/').pop()}
                    </span>
                  )}

                  <span style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-dim)',
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}>
                    <Calendar size={10} /> {item.timestamp}
                  </span>
                </div>

                {/* Card Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => exportSingleDossier(item)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                    title="Export Markdown"
                  >
                    <Download size={12} /> Export
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(item.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px', opacity: 0.8 }}
                    title="Delete record"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
