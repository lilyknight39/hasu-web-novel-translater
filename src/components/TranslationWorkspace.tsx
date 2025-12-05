import React from 'react';

interface TranslationWorkspaceProps {
  progress: number; // 0 to 100
  currentStatus: string;
  isPaused: boolean;
  onPauseToggle: () => void;
  onCancel: () => void;
  totalSegments: number;
  completedSegments: number;
  logs?: string[];
}

export const TranslationWorkspace: React.FC<TranslationWorkspaceProps> = ({
  progress,
  currentStatus,
  isPaused,
  onPauseToggle,
  onCancel,
  totalSegments,
  completedSegments,
  logs
}) => {
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="workspace-panel">
      <div className="status-header">
        <h3>翻译进行中</h3>
        <span className="percentage">{Math.round(progress)}%</span>
      </div>

      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="stats">
        <span>{completedSegments} / {totalSegments} 段落</span>
        <span className="status-text">{currentStatus}</span>
      </div>

      <div className="actions">
        <button className="btn-primary" onClick={onPauseToggle}>
          {isPaused ? '继续' : '暂停'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          取消
        </button>
      </div>

      {logs && logs.length > 0 && (
        <div className="debug-console">
          <h4>调试控制台</h4>
          <div className="logs-container" ref={logsContainerRef}>
            {logs.map((log, i) => (
              <div key={i} className="log-entry">{log}</div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .workspace-panel {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: var(--shadow-md);
        }

        .status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        h3 {
          margin: 0;
          font-size: 1.125rem;
          color: var(--color-text-primary);
        }

        .percentage {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--color-accent-primary);
        }

        .progress-track {
          width: 100%;
          height: 8px;
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary));
          transition: width 0.3s ease;
        }

        .stats {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          color: var(--color-text-muted);
          margin-bottom: 1.5rem;
        }
        
        .status-text {
          font-family: var(--font-mono);
        }

        .actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-bottom: 1rem;
        }

        button {
          padding: 0.5rem 1.5rem;
          border-radius: var(--radius-md);
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary {
          background: var(--color-accent-primary);
          color: white;
          border: none;
        }
        .btn-primary:hover {
          background: var(--color-accent-hover);
        }

        .btn-secondary {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border);
        }
        .btn-secondary:hover {
          border-color: var(--color-text-primary);
          color: var(--color-text-primary);
        }

        .debug-console {
            margin-top: 1.5rem;
            border-top: 1px solid var(--color-border);
            padding-top: 1rem;
        }
        
        .debug-console h4 {
            font-size: 0.875rem;
            color: var(--color-text-muted);
            margin: 0 0 0.5rem 0;
        }

        .logs-container {
            background: #000;
            border-radius: var(--radius-sm);
            padding: 0.5rem;
            height: 150px;
            overflow-y: auto;
            font-family: var(--font-mono);
            font-size: 0.75rem;
            color: #4ade80;
        }
        
        .log-entry {
            margin-bottom: 2px;
            white-space: pre-wrap;
            word-break: break-all;
        }
      `}</style>
    </div>
  );
};
