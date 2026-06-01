import { useState, useRef, useEffect } from 'react';
import { IconSend, IconChevronDown, IconChevronRight, IconArrowBackUp } from '@tabler/icons-react';
import { useAIStore } from '../store/aiStore';
import { useProjectStore } from '../store/projectStore';
import { useTimelineStore } from '../store/timelineStore';
import './AIChatPanel.css';

const QUICK_ACTIONS = [
  'Summarize clip',
  'Find best moments',
  'Auto caption',
  'Suggest music',
];

export default function AIChatPanel() {
  const { messages, isLoading, steps, sendMessage } = useAIStore();
  const { currentProject } = useProjectStore();
  const { getSelectedClip, undo } = useTimelineStore();
  const [input, setInput] = useState('');
  const [showStepsLog, setShowStepsLog] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, steps]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const selectedClip = getSelectedClip();
    sendMessage(text, {
      currentClip: selectedClip?.fileName,
      projectName: currentProject?.name,
    });
    setInput('');
  };

  const handleQuickAction = (action: string) => {
    const selectedClip = getSelectedClip();
    sendMessage(action, {
      currentClip: selectedClip?.fileName,
      projectName: currentProject?.name,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUndoAIChanges = () => {
    const successSteps = steps.filter((s) => s.status === 'success');
    if (successSteps.length === 0) return;
    
    // Undo each successful operation in reverse
    for (let i = 0; i < successSteps.length; i++) {
      setTimeout(() => {
        undo();
      }, i * 150);
    }
  };

  return (
    <div className="ai-chat-panel">
      {/* Quick Actions */}
      <div className="ai-chat-chips">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            className="ai-chip"
            onClick={() => handleQuickAction(action)}
            disabled={isLoading}
          >
            {action}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-avatar-large">N</div>
            <p>Hi! I'm Nami, your AI editing assistant.</p>
            <p className="text-muted text-center" style={{ padding: '0 var(--space-xl)' }}>
              Ask me to cut silence, apply black & white effects, generate subtitles, or rearrange clips!
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message ${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="ai-avatar-sm">N</div>
            )}
            <div className={`ai-message-bubble ${msg.role}`}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Action Steps & Progress Indicators */}
        {isLoading && (
          <div className="ai-message assistant">
            <div className="ai-avatar-sm">N</div>
            <div className="ai-thinking-wrapper">
              <div className="ai-thinking-header">
                <span className="spinner sm" />
                <span className="ai-thinking-text">Nami is editing...</span>
              </div>
            </div>
          </div>
        )}

        {/* Tool execution collapsible steps log */}
        {steps && steps.length > 0 && (
          <div className="ai-steps-card">
            <button 
              className="ai-steps-toggle" 
              onClick={() => setShowStepsLog(!showStepsLog)}
            >
              {showStepsLog ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <span>Nami's Editing Log ({steps.length} operation{steps.length !== 1 ? 's' : ''})</span>
            </button>
            
            {showStepsLog && (
              <div className="ai-steps-list">
                {steps.map((step, idx) => (
                  <div key={idx} className={`ai-step-item ${step.status}`}>
                    <span className="ai-step-bullet">
                      {step.status === 'success' ? '✓' : step.status === 'failed' ? '✗' : '⟳'}
                    </span>
                    <span className="ai-step-name">
                      {step.tool.replace('_', ' ')}
                    </span>
                    {step.result && (
                      <span className="ai-step-result text-muted">
                        - {step.result}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary card & Undo Trigger */}
            <div className="ai-summary-footer">
              <span className="ai-summary-badge">AI Applied</span>
              <button 
                className="ai-undo-all-btn btn btn-ghost" 
                onClick={handleUndoAIChanges}
                title="Undo Nami's timeline edits"
              >
                <IconArrowBackUp size={14} />
                <span>Undo All</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-chat-input-wrapper">
        <input
          ref={inputRef}
          className="ai-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Make the video black and white..."
          disabled={isLoading}
        />
        <button
          className="ai-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          <IconSend size={16} stroke={1.5} />
        </button>
      </div>
    </div>
  );
}
