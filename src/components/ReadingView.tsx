import React, { useState } from 'react';
import type { TextChunk } from '../services/chunker';

interface ReadingViewProps {
  chunks: TextChunk[];
  translations: Record<string, string>;
  title: string;
}

type ViewMode = 'side-by-side' | 'interleaved' | 'original-only' | 'translation-only';

import ReactMarkdown from 'react-markdown';

interface ReadingViewProps {
  chunks: TextChunk[];
  translations: Record<string, string>;
  title: string;
  onExport?: () => void;
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
  onFontChange?: (font: string) => void;
  currentFont?: string;
  onRetry?: (chunkId: string) => void;
}

export const ReadingView: React.FC<ReadingViewProps> = ({
  chunks,
  translations,
  title,
  onExport,
  currentTheme = 'light',
  onThemeChange,
  currentFont = 'sans',
  onFontChange,
  onRetry
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [fontSize, setFontSize] = useState(18);

  /* Fullscreen styles */
  const containerRef = React.useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="reading-view" ref={containerRef}>
      <div className="toolbar">
        <h2 className="novel-title">{title}</h2>
        <div className="controls">
          {onExport && (
            <div className="control-group">
              <button onClick={onExport} className="btn-secondary" title="导出">
                导出
              </button>
            </div>
          )}
          <div className="control-group">
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "退出全屏" : "全屏模式"}
              className={isFullscreen ? "active" : ""}
            >
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
          </div>
          <div className="control-group">
            <select
              value={currentTheme}
              onChange={(e) => onThemeChange?.(e.target.value)}
              title="主题"
            >
              <option value="light">明亮</option>
              <option value="dark">暗黑</option>
              <option value="sepia">护眼</option>
              <option value="oled">OLED</option>
            </select>
            <select
              value={currentFont}
              onChange={(e) => onFontChange?.(e.target.value)}
              title="字体"
            >
              <option value="sans">无衬线</option>
              <option value="serif">衬线</option>
              <option value="mono">等宽</option>
              <option value="rounded">圆体</option>
            </select>
          </div>
          <div className="control-group">
            <button onClick={() => setFontSize(s => Math.max(14, s - 2))}>A-</button>
            <button onClick={() => setFontSize(s => Math.min(32, s + 2))}>A+</button>
          </div>
          <div className="control-group">
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
              <option value="side-by-side">双语对照</option>
              <option value="interleaved">交替显示</option>
              <option value="translation-only">仅译文</option>
              <option value="original-only">仅原文</option>
            </select>
          </div>
        </div>
      </div>

      <div className={`content-area mode-${viewMode}`} style={{ fontSize: `${fontSize}px` }}>
        {chunks.map((chunk) => {
          const translation = translations[chunk.id];
          return (
            <div key={chunk.id} className="paragraph-pair">
              {(viewMode === 'side-by-side' || viewMode === 'interleaved' || viewMode === 'original-only') && (
                <div className="original-text markdown-body">
                  <ReactMarkdown>{chunk.text}</ReactMarkdown>
                </div>
              )}

              {(viewMode === 'side-by-side' || viewMode === 'interleaved' || viewMode === 'translation-only') && (
                <div className="translated-text markdown-body">
                  {translation ? (
                    <ReactMarkdown>{translation}</ReactMarkdown>
                  ) : (
                    <div className="translation-placeholder">
                      <p className="placeholder-text">翻译中...</p>
                      {onRetry && (
                        <button
                          className="retry-btn"
                          onClick={() => onRetry(chunk.id)}
                          title="重试翻译"
                        >
                          ↺ 重试
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .reading-view {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        /* Fullscreen overrides */
        .reading-view:fullscreen {
           background: var(--color-bg-primary);
           overflow-y: auto;
           padding: 0 2rem; /* Restore page padding in fullscreen */
        }
        
        .reading-view:fullscreen .toolbar {
            /* Ensure toolbar stays pinned inside fullscreen container */
            position: sticky; 
            top: 0;
            z-index: 100;
        }

        .toolbar {
          position: sticky;
          top: 0;
          background: var(--color-bg-primary);
          border-bottom: 1px solid var(--color-border);
          padding: 1rem 0;
          margin-bottom: 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 10;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .novel-title {
          margin: 0;
          font-family: var(--font-serif);
          font-size: 1.5rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .controls {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .control-group {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        button, select {
          background: var(--color-bg-secondary);
          color: var(--color-text-primary);
          border: 1px solid var(--color-border);
          padding: 0.5rem 1rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          cursor: pointer;
        }
        
        button.active {
            background: var(--color-accent-primary);
            color: white;
            border-color: var(--color-accent-primary);
        }

        .content-area {
          flex: 1;
        }

        .paragraph-pair {
          margin-bottom: 2rem;
          line-height: 1.8;
          font-family: var(--font-reading, var(--font-sans));
        }

        /* Markdown Styling Defaults */
        .markdown-body p {
            margin-bottom: 0;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
            margin-top: 0;
            font-size: 1.25em; /* normalized headers within chunks */
        }
        .markdown-body blockquote {
            border-left: 3px solid var(--color-accent-primary);
            padding-left: 1rem;
            margin-left: 0;
            color: var(--color-text-muted);
        }

        /* Side by Side Mode */
        .mode-side-by-side .paragraph-pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          align-items: start;
        }
        
        .mode-side-by-side .original-text {
          color: var(--color-text-muted);
          border-right: 1px solid var(--color-border);
          padding-right: 2rem;
        }

        /* Interleaved Mode */
        .mode-interleaved .paragraph-pair {
          display: flex;
          flex-direction: column;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }

        .mode-interleaved .original-text {
          font-size: 0.9em;
          color: var(--color-text-muted);
          margin-bottom: 0.5rem;
        }

        .mode-interleaved .translated-text {
          padding-left: 1rem;
          border-left: 2px solid var(--color-accent-primary);
        }

        /* Single Columns */
        .mode-original-only, .mode-translation-only {
          max-width: 800px;
          margin: 0 auto;
        }

        .placeholder {
          color: var(--color-text-muted);
          font-style: italic;
          opacity: 0.5;
        }

        @media (max-width: 768px) {
          .toolbar {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          
          .novel-title {
            width: 100%;
            font-size: 1.25rem;
          }

          .translation-placeholder {
            display: flex;
            align-items: center;
            gap: 1rem;
            color: var(--color-text-muted);
            font-style: italic;
            opacity: 0.8;
          }
          
          .placeholder-text {
            margin: 0;
          }

          .retry-btn {
            background: transparent;
            border: 1px solid var(--color-border);
            padding: 0.2rem 0.6rem;
            font-size: 0.75rem;
            opacity: 0.7;
            transition: all 0.2s;
          }
          
          .retry-btn:hover {
            opacity: 1;
            background: var(--color-bg-secondary);
            border-color: var(--color-accent-primary);
            color: var(--color-accent-primary);
          }
          
          .controls {
            width: 100%;
            overflow-x: auto;
            padding-bottom: 0.5rem;
            /* Hide scrollbar for cleaner look */
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          
          .controls::-webkit-scrollbar {
            display: none;
          }

          .mode-side-by-side .paragraph-pair {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          .mode-side-by-side .original-text {
            border-right: none;
            padding-right: 0;
            margin-bottom: 0.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px dashed var(--color-border);
          }
          
          .control-group button, .control-group select {
             padding: 0.4rem 0.6rem; 
             font-size: 0.8rem;
          }
          
          /* Adjust fullscreen padding for mobile */
          .reading-view:fullscreen {
             padding: 0 1rem;
          }
        }
      `}</style>
    </div>
  );
};
