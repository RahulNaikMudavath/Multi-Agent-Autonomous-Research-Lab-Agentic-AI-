import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Sparkles, Loader2, RefreshCw } from 'lucide-react';

export default function ChatWithReport({ 
  query, 
  report, 
  sources = [], 
  provider = 'groq', 
  model = '', 
  apiKey = '' 
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello! I have analyzed the research report for **"${query}"**. Ask me any follow-up questions, request deeper explanations, or explore specific trade-offs!`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef(null);

  const QUICK_PROMPTS = [
    "Summarize the key trade-offs in 3 clear bullet points.",
    "Which option is better for daily practical use vs. extreme performance?",
    "What are the maintenance, reliability, and long-term cost differences?",
    "Explain the core engineering specifications in simpler terms."
  ];

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (userText) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage = { role: 'user', content: textToSend.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          report: report || '',
          sources: sources || [],
          message: textToSend.trim(),
          history: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          provider,
          model,
          api_key: apiKey
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = {
        role: 'assistant',
        content: data.answer || "I couldn't process an answer at this time. Please check your connection."
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error generating response**: ${err.message}. Please verify your API key or model settings.`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: `Conversation reset. Feel free to ask anything about **"${query}"**!`
      }
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '360px', gap: '12px' }}>
      {/* Quick Prompts Bar */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles size={12} style={{ color: 'var(--accent-cyan)' }} /> Suggested:
        </span>
        {QUICK_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            className="toggle-btn"
            style={{
              fontSize: '0.72rem',
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            onClick={() => handleSend(prompt)}
            disabled={isLoading}
          >
            {prompt}
          </button>
        ))}
        <button
          type="button"
          onClick={clearChat}
          title="Reset conversation"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '10px 4px',
          maxHeight: '320px'
        }}
      >
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                justifyContent: isUser ? 'flex-end' : 'flex-start'
              }}
            >
              {!isUser && (
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  background: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-cyan)',
                  flexShrink: 0
                }}>
                  <Bot size={14} />
                </div>
              )}

              <div
                style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  lineHeight: '1.5',
                  background: isUser ? 'linear-gradient(135deg, rgba(189, 92, 255, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)' : 'rgba(255, 255, 255, 0.03)',
                  border: isUser ? '1px solid rgba(189, 92, 255, 0.4)' : '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>

              {isUser && (
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  background: 'rgba(189, 92, 255, 0.12)',
                  border: '1px solid rgba(189, 92, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-purple)',
                  flexShrink: 0
                }}>
                  <User size={14} />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
            <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-cyan)' }} />
            <span>Consulting research report intelligence...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          className="search-input"
          placeholder="Ask a follow-up question regarding this report..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          style={{ height: '36px', fontSize: '0.82rem' }}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ height: '36px', padding: '0 14px' }}
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
