import React, { useMemo } from 'react';
import { BarChart3, TrendingUp, Award, Activity, Layers, CheckCircle2 } from 'lucide-react';
import { normalizeMarkdown } from '../utils/markdownUtils';

/**
 * Parses markdown tables from the report and extracts comparative metrics
 * (both quantitative with visual bars and qualitative specifications).
 */
function parseComparisonData(rawReport) {
  if (!rawReport) return null;

  const reportText = normalizeMarkdown(rawReport);

  // Match all markdown tables in the normalized report
  const tableRegex = /\|(.+)\|\n\|(?:\s*[-:]+[-| :]*)\|\n((?:\|.*\|\n?)+)/g;
  let match;
  const allTables = [];

  while ((match = tableRegex.exec(reportText)) !== null) {
    const headerRow = match[1].split('|').map(s => s.trim()).filter(Boolean);
    const bodyRows = match[2].trim().split('\n').map(row => {
      return row.split('|').map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length);
    });

    if (headerRow.length >= 2 && bodyRows.length > 0) {
      allTables.push({ headers: headerRow, rows: bodyRows });
    }
  }

  const metrics = [];
  let detectedEntities = [];

  allTables.forEach(table => {
    const headers = table.headers;
    const rows = table.rows;

    if (headers.length >= 2) {
      if (detectedEntities.length === 0) {
        detectedEntities = headers.slice(1);
      }

      rows.forEach(row => {
        if (row.length < 2) return;
        const metricName = row[0].replace(/\*\*/g, '').replace(/__/g, '').replace(/^[-*]\s*/, '').trim();
        if (!metricName || metricName.startsWith('---')) return;

        const values = [];

        for (let i = 1; i < headers.length; i++) {
          const rawVal = row[i - 1] !== undefined ? row[i - 1].replace(/\*\*/g, '').trim() : (row[i] ? row[i].replace(/\*\*/g, '').trim() : '');
          
          // Try to extract numerical value (e.g., "473 hp" -> 473, "3.8s" -> 3.8, "$75,000" -> 75000)
          let num = null;
          const cleanValForNum = rawVal.replace(/,/g, '');
          const numMatch = cleanValForNum.match(/[-+]?[0-9]*\.?[0-9]+/);
          if (numMatch && !isNaN(parseFloat(numMatch[0]))) {
            num = parseFloat(numMatch[0]);
          }

          values.push({
            label: headers[i] || `Option ${i}`,
            raw: rawVal || 'N/A',
            num: num
          });
        }

        if (values.length > 0) {
          metrics.push({
            metric: metricName,
            hasNumbers: values.some(v => v.num !== null),
            values
          });
        }
      });
    }
  });

  if (metrics.length === 0) {
    return null;
  }

  return {
    entities: detectedEntities.length > 0 ? detectedEntities : ['Option A', 'Option B'],
    metrics
  };
}

export default function VisualCharts({ report }) {
  const chartData = useMemo(() => parseComparisonData(report), [report]);

  if (!chartData || chartData.metrics.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '50px 20px',
        color: 'var(--text-dim)',
        gap: '12px',
        textAlign: 'center'
      }}>
        <BarChart3 size={38} style={{ color: 'var(--accent-purple)', opacity: 0.7 }} />
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Comparative Intelligence Matrix
        </div>
        <p style={{ fontSize: '0.82rem', maxWidth: '440px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Visual analytics automatically generate when a research report contains comparison tables or benchmark specifications. Run a research query or select a completed dossier to view visual charts.
        </p>
      </div>
    );
  }

  const { entities, metrics } = chartData;

  // Color palette for compared entities
  const ENTITY_COLORS = [
    { fill: 'linear-gradient(90deg, #00f0ff 0%, #0284c7 100%)', bar: '#00f0ff', glow: 'rgba(0, 240, 255, 0.4)' },
    { fill: 'linear-gradient(90deg, #bd5cff 0%, #9333ea 100%)', bar: '#bd5cff', glow: 'rgba(189, 92, 255, 0.4)' },
    { fill: 'linear-gradient(90deg, #10b981 0%, #059669 100%)', bar: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
    { fill: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)', bar: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' }
  ];

  const numericalMetrics = metrics.filter(m => m.hasNumbers);
  const specMetrics = metrics.filter(m => !m.hasNumbers);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s ease' }}>
      {/* Top Banner / Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '10px 16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          <TrendingUp size={16} style={{ color: 'var(--accent-cyan)' }} />
          Comparative Benchmark Intelligence
        </div>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {entities.map((entity, idx) => {
            const color = ENTITY_COLORS[idx % ENTITY_COLORS.length];
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: color.fill, boxShadow: `0 0 6px ${color.glow}` }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entity}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quantitative Metric Comparison Bars */}
      {numericalMetrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-cyan)' }}>
            Quantitative Metrics & Benchmarks ({numericalMetrics.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {numericalMetrics.map((item, mIdx) => {
              const validNums = item.values.map(v => v.num).filter(n => n !== null && n > 0);
              const maxNum = validNums.length > 0 ? Math.max(...validNums) : 1;

              return (
                <div 
                  key={mIdx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.metric}
                    </span>
                    <Activity size={13} style={{ color: 'var(--accent-purple)' }} />
                  </div>

                  {/* Entity Bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {item.values.map((v, vIdx) => {
                      const color = ENTITY_COLORS[vIdx % ENTITY_COLORS.length];
                      const percentage = v.num !== null && maxNum > 0 ? Math.max(14, Math.min(100, (v.num / maxNum) * 100)) : 100;

                      return (
                        <div key={vIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                            <span style={{ color: 'var(--text-dim)' }}>{v.label}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.raw || 'N/A'}</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div 
                              style={{
                                width: `${percentage}%`,
                                height: '100%',
                                background: color.fill,
                                borderRadius: '3px',
                                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: `0 0 6px ${color.glow}`
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Qualitative Specifications Comparison Cards */}
      {specMetrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-purple)' }}>
            Architecture & Specification Highlights ({specMetrics.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {specMetrics.map((item, sIdx) => (
              <div 
                key={sIdx}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                  {item.metric}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {item.values.map((v, vIdx) => {
                    const color = ENTITY_COLORS[vIdx % ENTITY_COLORS.length];
                    return (
                      <div key={vIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.72rem' }}>
                        <span style={{ color: color.bar, fontWeight: 600 }}>{v.label}</span>
                        <span style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{v.raw || 'Not specified'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
