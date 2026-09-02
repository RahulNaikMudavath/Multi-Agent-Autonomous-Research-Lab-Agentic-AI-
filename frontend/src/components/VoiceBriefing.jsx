import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, Pause, RotateCcw, FastForward, Sparkles } from 'lucide-react';

export default function VoiceBriefing({ report }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1.1); // natural slightly brisk pace
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);

  // Initialize Speech Synthesis & Load Voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;

      const updateVoices = () => {
        const available = synthRef.current.getVoices();
        setVoices(available);
        // Prioritize natural sounding English voices
        const preferred = available.find(v => 
          (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Premium')) && v.lang.startsWith('en')
        ) || available.find(v => v.lang.startsWith('en')) || available[0];
        
        setSelectedVoice(preferred || null);
      };

      updateVoices();
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = updateVoices;
      }
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Generate clean spoken audio script from Markdown report
  const generateAudioScript = (mdText) => {
    if (!mdText) return '';
    
    // Extract title
    const titleMatch = mdText.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : 'Research Intelligence Briefing';

    // Extract Executive Summary
    let summaryText = '';
    const summaryMatch = mdText.match(/##\s+(?:1\.\s+)?Executive Summary[\s\S]*?(?=##|$)/i);
    if (summaryMatch) {
      summaryText = summaryMatch[0].replace(/##\s+(?:1\.\s+)?Executive Summary/i, '').trim();
    } else {
      // Fallback to first 2 paragraphs
      const paras = mdText.split(/\n\s*\n/).filter(p => !p.startsWith('#')).slice(0, 2);
      summaryText = paras.join('. ');
    }

    // Extract Critical Decision / Recommendation if present
    let decisionText = '';
    const decisionMatch = mdText.match(/##\s+(?:5\.\s+)?(?:Critical Trade-Offs|Decision Guide|Conclusion|Verdict)[\s\S]*?(?=##|$)/i);
    if (decisionMatch) {
      decisionText = decisionMatch[0].replace(/##\s+[^\n]+/i, '').trim();
    }

    const rawScript = `Intelligence briefing for ${title}. Summary: ${summaryText}. Key Decision and Takeaways: ${decisionText}. End of briefing.`;

    // Clean markdown characters, links, backticks, table pipes, and math
    return rawScript
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/[*#_~>|]/g, ' ') // markdown symbols
      .replace(/[-+*]\s+/g, '. ') // bullet points to pauses
      .replace(/\s+/g, ' ')
      .trim();
  };

  const startSpeaking = () => {
    if (!synthRef.current || !report) return;

    if (isPaused) {
      synthRef.current.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    synthRef.current.cancel();

    const script = generateAudioScript(report);
    if (!script) return;

    const utterance = new SpeechSynthesisUtterance(script);
    utteranceRef.current = utterance;
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.rate = rate;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error', e);
      setIsPlaying(false);
      setIsPaused(false);
    };

    synthRef.current.speak(utterance);
  };

  const pauseSpeaking = () => {
    if (synthRef.current && isPlaying) {
      synthRef.current.pause();
      setIsPaused(true);
    }
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const toggleRate = () => {
    const nextRate = rate === 1.0 ? 1.25 : rate === 1.25 ? 1.5 : 1.0;
    setRate(nextRate);
    if (isPlaying && !isPaused) {
      stopSpeaking();
      setTimeout(() => startSpeaking(), 100);
    }
  };

  if (!report || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }

  return (
    <div className="voice-briefing-bar">
      <div className="voice-briefing-left">
        <div className={`voice-pulse-icon ${isPlaying && !isPaused ? 'active' : ''}`}>
          <Volume2 size={15} />
        </div>
        <div className="voice-briefing-info">
          <span className="voice-briefing-title">
            <Sparkles size={11} className="inline-sparkle" /> AI Audio Briefing
          </span>
          <span className="voice-briefing-status">
            {isPlaying 
              ? (isPaused ? 'Paused' : 'Playing spoken executive summary...') 
              : 'Listen to narrated takeaways'}
          </span>
        </div>
      </div>

      {/* Live Equalizer Waveform Animation */}
      {isPlaying && !isPaused && (
        <div className="audio-wave">
          <span className="wave-bar bar-1"></span>
          <span className="wave-bar bar-2"></span>
          <span className="wave-bar bar-3"></span>
          <span className="wave-bar bar-4"></span>
          <span className="wave-bar bar-5"></span>
        </div>
      )}

      <div className="voice-briefing-controls">
        {/* Speed Toggle */}
        <button 
          type="button"
          onClick={toggleRate} 
          className="voice-ctrl-btn rate-badge"
          title="Change playback speed"
        >
          {rate}x
        </button>

        {/* Play / Pause Toggle */}
        {!isPlaying || isPaused ? (
          <button 
            type="button"
            onClick={startSpeaking} 
            className="voice-ctrl-btn primary-play-btn"
            title="Play audio briefing"
          >
            <Play size={13} fill="currentColor" />
            <span>Play</span>
          </button>
        ) : (
          <button 
            type="button"
            onClick={pauseSpeaking} 
            className="voice-ctrl-btn pause-btn"
            title="Pause audio briefing"
          >
            <Pause size={13} fill="currentColor" />
            <span>Pause</span>
          </button>
        )}

        {/* Stop Button */}
        {(isPlaying || isPaused) && (
          <button 
            type="button"
            onClick={stopSpeaking} 
            className="voice-ctrl-btn stop-btn"
            title="Stop audio briefing"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
