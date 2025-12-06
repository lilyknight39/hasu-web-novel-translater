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
    <div className="workspace-panel glass-panel">
      <div className="status-header">
        <h3>翻译进行中...</h3>
        <span className="percentage">{Math.round(progress)}%</span>
      </div>

      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="stats-row">
        <div className="stat-item">
          <span className="stat-label">进度</span>
          <span className="stat-value">{completedSegments} / {totalSegments}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">状态</span>
          <span className="stat-value status-badge">{currentStatus}</span>
        </div>
      </div>

      <div className="actions">
        <button className="btn-primary" onClick={onPauseToggle}>
          {isPaused ? '▶ 继续翻译' : '⏸ 暂停'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          取消
        </button>
      </div>

      {logs && logs.length > 0 && (
        <div className="debug-console">
          <h4>
            <span className="console-icon">_</span> 运行日志
          </h4>
          <div className="logs-container" ref={logsContainerRef}>
            {logs.map((log, i) => (
              <div key={i} className="log-entry line-item">
                <span className="line-number">{i + 1}</span>
                <span className="line-content">{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .workspace-panel {
          padding: 2rem;
          margin-bottom: 2rem;
          border-radius: var(--radius-lg);
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
          font-size: 1.1rem;
          color: var(--color-text-primary);
          font-weight: 600;
        }

        .percentage {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--color-accent-primary);
          font-variant-numeric: tabular-nums;
        }

        .progress-track {
          width: 100%;
          height: 8px;
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin-bottom: 2rem;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary));
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 10px rgba(14, 165, 233, 0.3);
        }

        .stats-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 2rem;
          padding: 1rem;
          background: var(--color-bg-tertiary); /* Inner card */
          border-radius: var(--radius-md);
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-value {
          font-size: 1rem;
          color: var(--color-text-primary);
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }
        
        .status-badge {
            display: inline-flex;
            align-items: center;
        }

        .actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-bottom: 0;
        }

        button {
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius-full);
          font-weight: 600;
          transition: all 0.2s;
          cursor: pointer;
        }

        .btn-primary {
          background: var(--color-accent-primary);
          color: white;
          border: none;
          box-shadow: var(--shadow-sm);
        }
        .btn-primary:hover {
          background: var(--color-accent-hover);
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border);
        }
        .btn-secondary:hover {
          border-color: var(--color-text-primary);
          color: var(--color-text-primary);
          background: var(--color-bg-tertiary);
        }

        .debug-console {
            margin-top: 2rem;
            border-top: 1px solid var(--color-border);
            padding-top: 1.5rem;
        }
        
        .debug-console h4 {
            font-size: 0.8rem;
            color: var(--color-text-muted);
            margin: 0 0 1rem 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .console-icon {
            color: var(--color-accent-primary);
            font-weight: bold;
        }

        .logs-container {
            background: #1e1e1e; /* Hardcoded dark for console feeling */
            border-radius: var(--radius-md);
            padding: 1rem;
            height: 180px;
            overflow-y: auto;
            font-family: var(--font-mono);
            font-size: 0.8rem;
            color: #d4d4d4;
            border: 1px solid var(--color-border);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .line-item {
            display: flex;
            gap: 1rem;
            margin-bottom: 4px;
        }
        
        .line-number {
            color: #555;
            user-select: none;
            min-width: 1.5rem;
            text-align: right;
        }
        
        .line-content {
            color: #9cdcfe;
            white-space: pre-wrap;
            word-break: break-all;
        }
      `}</style>
    </div>
  );
};
