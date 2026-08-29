import React from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Award, Loader2 } from 'lucide-react';

export default function ReportViewer({ draftReport, finalReport, isRunning, activeAgent }) {
  const report = finalReport || draftReport;

  return (
    <div className="glass-panel report-panel">
      <div className="panel-title" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignState: 'center', gap: '8px' }}>
          <FileText size={16} /> Research Output
        </div>
        {finalReport && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px', 
            color: 'var(--accent-green)', 
            fontSize: '0.75rem',
            background: 'rgba(16, 185, 129, 0.08)',
            padding: '2px 8px',
            borderRadius: '12px',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <Award size={12} /> Factual & Editorial Verified
          </div>
        )}
      </div>

      <div className="report-content">
        {!report ? (
          <div className="report-placeholder">
            {isRunning ? (
              <>
                <Loader2 size={32} className="logo-icon" style={{ animation: 'spin 2s linear infinite' }} />
                <p>Collaborating agents are researching...<br/>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {activeAgent === 'Coordinator' && 'Coordinator is drafting research plan...'}
                  {activeAgent === 'Researcher' && 'Researcher is scraping search indices...'}
                  {activeAgent === 'Writer' && 'Writer is assembling the initial draft report...'}
                </span>
                </p>
              </>
            ) : (
              <>
                <FileText size={40} />
                <p>No report generated yet.<br/>
                <span style={{ fontSize: '0.8rem' }}>Enter a query and run research to trigger the agents.</span>
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
