import React, { useMemo } from 'react';
import { BarChart3, TrendingUp, Award, Activity, Layers } from 'lucide-react';

/**
 * Parses markdown tables from the report and extracts numerical comparisons.
 */
function parseComparisonTable(reportText) {
  if (!reportText) return null;

  // Regex to find markdown tables
  const tableRegex = /\|(.+)\|\n\|(?:\s*[-:]+[-| :]*)\|\n((?:\|.*\|\n?)+)/g;
  let match;
  const tables = [];

  while ((match = tableRegex.exec(reportText)) !== null) {
    const headerRow = match[1].split('|').map(s => s.trim()).filter(Boolean);
    const bodyRows = match[2].trim().split('\n').map(row => {
      return row.split('|').map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length);
    });

    if (headerRow.length >= 2 && bodyRows.length > 0) {
      tables.push({ headers: headerRow, rows: bodyRows });
    }
  }

  if (tables.length === 0) return null;

  // Pick the best comparison table (usually the one with the most columns or rows)
  const mainTable = tables[0];
  const headers = mainTable.headers;
  const rows = mainTable.rows;

  // Extract entities (column 2, 3...) or row names
  const metrics = [];

  rows.forEach(row => {
    if (row.length < 2) return;
    const metricName = row[0].replace(/\*\*/g, '').replace(/__/g, '').trim();
    const values = [];

    for (let i = 1; i < row.length; i++) {
      const rawVal = row[i] ? row[i].replace(/\*\*/g, '').trim() : '';
      // Extract first number found
      const numMatch = rawVal.match(/[-+]?[0-9]*\.?[0-9]+/);
      const num = numMatch ? parseFloat(numMatch[0]) : null;
      values.push({
        label: headers[i] || `Entity ${i}`,
        raw: rawVal,
        num: num
      });
    }

    // Only include metrics if at least one column has a parseable number
    if (values.some(v => v.num !== null)) {
      metrics.push({
        metric: metricName,
        values
      });
    }
  });

  return {
    entities: headers.slice(1),
    metrics
  };
}

export default function VisualCharts({ report }) {
  const chartData = useMemo(() => parseComparisonTable(report), [report]);

  if (!chartData || chartData.metrics.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--text-dim)',
        gap: '12px',
        textAlign: 'center'
      }}>
        <BarChart3 size={36} style={{ color: 'var(--accent-purple)', opacity: 0.7 }} />
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Numerical Comparison Matrix Pending
        </div>
        <p style={{ fontSize: '0.8rem', maxWidth: '420px', lineHeight: 1.5 }}>
          Visual analytics automatically render when the research report produces quantitative benchmark tables (such as acceleration, horsepower, latency, or throughput metrics).
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

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
        {metrics.map((item, mIdx) => {
          // Calculate max value for normalized bar calculation
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
                <Activity size={13} style={{ color: 'var(--text-dim)' }} />
              </div>

              {/* Entity Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {item.values.map((v, vIdx) => {
                  const color = ENTITY_COLORS[vIdx % ENTITY_COLORS.length];
                  const percentage = v.num !== null && maxNum > 0 ? Math.max(12, Math.min(100, (v.num / maxNum) * 100)) : 100;

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
  );
}
