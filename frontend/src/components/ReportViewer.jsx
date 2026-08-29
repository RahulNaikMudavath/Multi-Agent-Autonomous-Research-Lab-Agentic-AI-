import React from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Award, Loader2 } from 'lucide-react';

export default function ReportViewer({ draftReport, finalReport, isRunning, activeAgent }) {
  const report = finalReport || draftReport;

  const getStepClass = (stepAgent) => {
    const AGENT_ORDER = ['Coordinator', 'Researcher', 'Writer', 'Fact-Checker', 'Critic'];
    const activeIndex = AGENT_ORDER.indexOf(activeAgent);
    const stepIndex = AGENT_ORDER.indexOf(stepAgent);
    
    if (activeAgent === 'Finalize') return 'completed';
    if (activeAgent === 'Error') return 'error';
    if (activeIndex === -1) return 'pending';
    
    if (stepIndex < activeIndex) return 'completed';
    if (stepIndex === activeIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="glass-panel report-panel">
      <div className="panel-title" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          isRunning ? (
            <div className="agent-loading-container">
              {/* Visual Radar / Orbit Effect */}
              <div className="radar-container">
                <div className="radar-circle circle-1"></div>
                <div className="radar-circle circle-2"></div>
                <div className="radar-circle circle-3"></div>
                <div className="radar-core">
                  <Loader2 size={16} className="spinning-core" />
                </div>
                <div className="radar-pulse"></div>
              </div>

              <div className="loading-status-title">
                <h3>Collaborating agents are researching...</h3>
                <p className="active-agent-desc">
                  Active Agent: <span className="active-agent-badge">{activeAgent}</span>
                </p>
              </div>

              {/* Progress Steps */}
              <div className="agent-steps">
                {/* Step 1: Coordinator */}
                <div className={`agent-step ${getStepClass('Coordinator')}`}>
                  <div className="step-bullet">
                    {getStepClass('Coordinator') === 'completed' ? '✓' : '1'}
                  </div>
                  <div className="step-info">
                    <div className="step-name">Coordinator</div>
                    <div className="step-desc">Analyzing request and drafting research plan</div>
                  </div>
                </div>

                {/* Step 2: Researcher */}
                <div className={`agent-step ${getStepClass('Researcher')}`}>
                  <div className="step-bullet">
                    {getStepClass('Researcher') === 'completed' ? '✓' : '2'}
                  </div>
                  <div className="step-info">
                    <div className="step-name">Researcher</div>
                    <div className="step-desc">Scraping web indices and compiling raw facts</div>
                  </div>
                </div>

                {/* Step 3: Writer */}
                <div className={`agent-step ${getStepClass('Writer')}`}>
                  <div className="step-bullet">
                    {getStepClass('Writer') === 'completed' ? '✓' : '3'}
                  </div>
                  <div className="step-info">
                    <div className="step-name">Writer</div>
                    <div className="step-desc">Assembling initial comprehensive report draft</div>
                  </div>
                </div>

                {/* Step 4: Fact-Checker */}
                <div className={`agent-step ${getStepClass('Fact-Checker')}`}>
                  <div className="step-bullet">
                    {getStepClass('Fact-Checker') === 'completed' ? '✓' : '4'}
                  </div>
                  <div className="step-info">
                    <div className="step-name">Fact-Checker</div>
                    <div className="step-desc">Cross-checking benchmarks and correcting errors</div>
                  </div>
                </div>

                {/* Step 5: Critic */}
                <div className={`agent-step ${getStepClass('Critic')}`}>
                  <div className="step-bullet">
                    {getStepClass('Critic') === 'completed' ? '✓' : '5'}
                  </div>
                  <div className="step-info">
                    <div className="step-name">Critic</div>
                    <div className="step-desc">Verifying editor quality and layout structure</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="report-placeholder">
              <FileText size={40} />
              <p>No report generated yet.<br/>
              <span style={{ fontSize: '0.8rem' }}>Enter a query and run research to trigger the agents.</span>
              </p>
            </div>
          )
        ) : (
          <div className="markdown-body">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
