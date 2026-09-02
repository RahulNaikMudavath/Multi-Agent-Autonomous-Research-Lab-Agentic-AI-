import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  Sliders, 
  Layers, 
  Printer, 
  Award,
  Sparkles
} from 'lucide-react';
import { normalizeMarkdown } from '../utils/markdownUtils';

export default function PresentationModal({ isOpen, onClose, report, query }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef(null);

  // Parse markdown report into presentation slides
  const parseSlides = (rawMarkdown) => {
    const markdown = normalizeMarkdown(rawMarkdown);
    if (!markdown) return [];

    // Extract title
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const mainTitle = titleMatch ? titleMatch[1] : (query || 'Research Intelligence Report');

    // Split by `## ` (major sections)
    const rawSections = markdown.split(/\n(?=##\s+)/g);
    const slides = [];

    // Slide 0: Title Slide
    slides.push({
      type: 'cover',
      title: mainTitle,
      subtitle: query !== mainTitle ? query : 'Multi-Agent Autonomous Research Intelligence',
      date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    });

    // Content Slides
    rawSections.forEach((sec, idx) => {
      const trimmed = sec.trim();
      if (!trimmed || trimmed.startsWith('# ')) return;

      const lines = trimmed.split('\n');
      const headerLine = lines[0] || '';
      const sectionTitle = headerLine.replace(/^##\s+(?:\d+\.\s+)?/, '').trim();
      const content = lines.slice(1).join('\n').trim();

      if (sectionTitle && content) {
        slides.push({
          type: 'content',
          title: sectionTitle,
          content: content,
          index: idx + 1
        });
      }
    });

    return slides.length > 1 ? slides : [
      {
        type: 'cover',
        title: mainTitle,
        subtitle: query,
        date: new Date().toLocaleDateString()
      },
      {
        type: 'content',
        title: 'Full Findings',
        content: markdown
      }
    ];
  };

  const slides = parseSlides(report);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          exitFullscreen();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, slides.length, isFullscreen, onClose]);

  const toggleFullscreen = () => {
    if (!modalRef.current) return;

    if (!document.fullscreenElement) {
      modalRef.current.requestFullscreen().catch(err => console.warn(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.warn(err));
    }
    setIsFullscreen(false);
  };

  // Print presentation handouts
  const printDeck = () => {
    window.print();
  };

  if (!isOpen || slides.length === 0) return null;

  const current = slides[currentSlide] || slides[0];
  const progressPercent = ((currentSlide + 1) / slides.length) * 100;

  return (
    <div className="presentation-backdrop" onClick={onClose}>
      <div 
        className={`presentation-container ${isFullscreen ? 'fullscreen-mode' : ''}`}
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        {/* Top Progress Bar */}
        <div className="presentation-progress-bar">
          <div 
            className="presentation-progress-fill" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Presentation Header Controls */}
        <div className="presentation-header">
          <div className="presentation-brand">
            <Layers size={16} className="brand-icon" />
            <span>Autonomous Intelligence Deck</span>
            <span className="deck-slide-count">Slide {currentSlide + 1} of {slides.length}</span>
          </div>

          <div className="presentation-actions">
            <button 
              type="button"
              onClick={toggleFullscreen} 
              className="pres-action-btn"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button 
              type="button"
              onClick={printDeck} 
              className="pres-action-btn"
              title="Print Presentation Handouts"
            >
              <Printer size={16} />
            </button>
            <button 
              type="button"
              onClick={onClose} 
              className="pres-action-btn close-btn"
              title="Close Presentation (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Slide Stage Body */}
        <div className="presentation-stage">
          {current.type === 'cover' ? (
            /* Cover Title Slide */
            <div className="slide-cover-layout">
              <div className="slide-verified-badge">
                <Award size={14} /> Verified Autonomous Research
              </div>
              <h1 className="slide-main-title">{current.title}</h1>
              <p className="slide-subtitle">{current.subtitle}</p>
              
              <div className="slide-cover-meta">
                <span className="meta-pill">Date: {current.date}</span>
                <span className="meta-pill highlight">5-Agent Collaborative Pipeline</span>
              </div>
            </div>
          ) : (
            /* Content Slide */
            <div className="slide-content-layout">
              <div className="slide-header-box">
                <span className="slide-num-tag">0{currentSlide}</span>
                <h2 className="slide-section-title">{current.title}</h2>
              </div>
              <div className="slide-markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.content}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Toolbar */}
        <div className="presentation-footer">
          <button 
            type="button"
            className="pres-nav-btn"
            disabled={currentSlide === 0}
            onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 0))}
            title="Previous Slide (Left Arrow)"
          >
            <ChevronLeft size={18} />
            <span>Previous</span>
          </button>

          {/* Slide dots thumbnail picker */}
          <div className="slide-dots">
            {slides.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className={`slide-dot ${idx === currentSlide ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                title={s.title}
              />
            ))}
          </div>

          <button 
            type="button"
            className="pres-nav-btn next-btn"
            disabled={currentSlide === slides.length - 1}
            onClick={() => setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1))}
            title="Next Slide (Right Arrow / Space)"
          >
            <span>Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
