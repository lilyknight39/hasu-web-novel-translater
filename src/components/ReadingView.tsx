import React, { useState, useEffect, useRef } from 'react';
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
  onBack?: () => void;
  onObserveParagraph?: (element: HTMLElement, chunkId: string, chunkIndex: number, text: string) => void;
  onUnobserveParagraph?: (element: HTMLElement) => void;
  onSaveReadingPosition?: (chunkIndex: number) => void;
  initialReadingPosition?: number;
}

// ParagraphItem component handles observation lifecycle
const ParagraphItem: React.FC<{
  chunk: TextChunk;
  translation?: string;
  viewMode: ViewMode;
  onRetry?: (chunkId: string) => void;
  onObserve?: (element: HTMLElement, chunkId: string, chunkIndex: number, text: string) => void;
  onUnobserve?: (element: HTMLElement) => void;
}> = ({ chunk, translation, viewMode, onRetry, onObserve, onUnobserve }) => {
  const paragraphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = paragraphRef.current;
    if (element && onObserve) {
      onObserve(element, chunk.id, chunk.index, chunk.text);
    }
    return () => {
      if (element && onUnobserve) {
        onUnobserve(element);
      }
    };
  }, [chunk.id, chunk.index, chunk.text, onObserve, onUnobserve]);

  return (
    <div ref={paragraphRef} className="paragraph-pair" data-chunk-id={chunk.id}>
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
              <span className="scramble-loader">Translating...</span>
              {onRetry && (
                <button
                  className="retry-btn"
                  onClick={() => onRetry(chunk.id)}
                  title="重试"
                >
                  ↺
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ReadingView: React.FC<ReadingViewProps> = ({
  chunks,
  translations,
  title: _title,
  onExport,
  currentTheme = 'light',
  onThemeChange,
  currentFont = 'sans',
  onFontChange,
  onRetry,
  onBack,
  onObserveParagraph,
  onUnobserveParagraph,
  onSaveReadingPosition,
  initialReadingPosition = 0
}) => {
  /* State for Appearance Popover & Collapse */
  const [showAppearance, setShowAppearance] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  /* Reading State */
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [fontSize, setFontSize] = useState(18);
  const [paragraphSpacing, setParagraphSpacing] = useState(1.2); // in rem, default to '紧凑'

  /* Fullscreen styles */
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  /* Safari scroll position preservation - CSS overflow-anchor not supported */
  const scrollAnchorRef = useRef<{ element: Element | null; offsetFromTop: number }>({
    element: null,
    offsetFromTop: 0
  });

  // Before render: capture the currently visible element and its position
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the first paragraph that's visible in the viewport
    const paragraphs = container.querySelectorAll('.paragraph-pair');
    for (const para of paragraphs) {
      const rect = para.getBoundingClientRect();
      // If this paragraph is partially or fully visible
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        scrollAnchorRef.current = {
          element: para,
          offsetFromTop: rect.top
        };
        break;
      }
    }
  }); // Run before every render

  // After translation changes: restore scroll position
  React.useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    if (!anchor.element) return;

    // Get the new position of the anchor element
    const newRect = anchor.element.getBoundingClientRect();
    const drift = newRect.top - anchor.offsetFromTop;

    // If the element has moved, adjust scroll to compensate
    if (Math.abs(drift) > 1) {
      window.scrollBy(0, drift);
    }
  }, [translations]); // Only when translations change

  /* Close appearances menu when clicking outside */
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.control-capsule') && !target.closest('.appearance-popover')) {
        setShowAppearance(false);
      }
    };
    if (showAppearance) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showAppearance]);

  /* Reading position tracking - debounced save */
  const lastSavedPositionRef = useRef<number>(-1);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!onSaveReadingPosition) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first visible paragraph
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const chunkId = entry.target.getAttribute('data-chunk-id');
            const chunk = chunks.find(c => c.id === chunkId);
            if (chunk && chunk.index !== lastSavedPositionRef.current) {
              lastSavedPositionRef.current = chunk.index;

              // Debounce: save at most every 2 seconds
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
              }
              saveTimeoutRef.current = setTimeout(() => {
                onSaveReadingPosition(chunk.index);
              }, 2000);
            }
            break;
          }
        }
      },
      { root: null, rootMargin: '-20% 0px -60% 0px', threshold: 0.1 }
    );

    // Observe all paragraph pairs
    const paragraphs = containerRef.current?.querySelectorAll('.paragraph-pair');
    paragraphs?.forEach(p => observer.observe(p));

    return () => {
      observer.disconnect();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [chunks, onSaveReadingPosition]);

  /* Scroll to initial reading position on mount */
  React.useEffect(() => {
    if (initialReadingPosition > 0 && chunks.length > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const targetChunk = chunks[initialReadingPosition];
        if (targetChunk) {
          const element = containerRef.current?.querySelector(
            `[data-chunk-id="${targetChunk.id}"]`
          );
          element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  }, [initialReadingPosition, chunks]);

  return (
    <div className="reading-view" ref={containerRef}>

      {/* Content Area */}
      <div className={`content-area mode-${viewMode}`} style={{ fontSize: `${fontSize}px`, lineHeight: 1.7, '--paragraph-spacing': `${paragraphSpacing}rem` } as React.CSSProperties & { '--paragraph-spacing': string }}>
        {chunks.map((chunk) => (
          <ParagraphItem
            key={chunk.id}
            chunk={chunk}
            translation={translations[chunk.id]}
            viewMode={viewMode}
            onRetry={onRetry}
            onObserve={onObserveParagraph}
            onUnobserve={onUnobserveParagraph}
          />
        ))}
      </div>

      {/* Floating Control Capsule (Liquid Glass) */}
      <div className="control-capsule-container">

        {/* Appearance Popover - Outside to avoid stacking context issues */}
        {showAppearance && (
          <div
            className="appearance-popover"
            style={{
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)'
            } as React.CSSProperties}
          >
            <div className="popover-section">
              <span className="label">字号</span>
              <div className="control-row">
                <button onClick={() => setFontSize(s => Math.max(14, s - 2))} className="icon-btn-large">A-</button>
                <div className="value-display">{fontSize}</div>
                <button onClick={() => setFontSize(s => Math.min(32, s + 2))} className="icon-btn-large">A+</button>
              </div>
            </div>

            <div className="popover-section">
              <span className="label">段落间距</span>
              <div className="segmented-control">
                {[
                  { value: 0.8, label: '超紧凑' },
                  { value: 1.2, label: '紧凑' },
                  { value: 1.8, label: '舒适' },
                  { value: 2.5, label: '宽松' }
                ].map(({ value, label }) => (
                  <button key={value} className={paragraphSpacing === value ? 'active' : ''} onClick={() => setParagraphSpacing(value)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="popover-section">
              <span className="label">字体</span>
              <div className="segmented-control">
                {['sans', 'serif', 'mono', 'rounded'].map(font => (
                  <button key={font} className={currentFont === font ? 'active' : ''} onClick={() => onFontChange?.(font)}>
                    {font === 'sans' ? '无衬线' : font === 'serif' ? '衬线' : font === 'mono' ? '等宽' : '圆体'}
                  </button>
                ))}
              </div>
            </div>

            <div className="popover-section">
              <span className="label">主题</span>
              <div className="theme-grid">
                {[{ id: 'light', label: '☀️' }, { id: 'dark', label: '🌙' }, { id: 'sepia', label: '🟤' }, { id: 'oled', label: '⚪' }].map(theme => (
                  <button key={theme.id} onClick={() => onThemeChange?.(theme.id)} className={`theme-circle ${theme.id} ${currentTheme === theme.id ? 'active' : ''}`} title={theme.id}>{theme.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Capsule - Collapsible */}
        <div className={`control-capsule ${isCollapsed ? 'collapsed' : ''}`}>

          {isCollapsed ? (
            <button className="icon-btn expand-btn" onClick={() => setIsCollapsed(false)} title="展开菜单">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
            </button>
          ) : (
            <>
              {/* Back Button */}
              {onBack && (
                <>
                  <div className="capsule-group">
                    <button
                      className="icon-btn"
                      onClick={onBack}
                      title="返回首页"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                    </button>
                  </div>
                  <div className="vertical-divider"></div>
                </>
              )}

              <div className="capsule-group">
                <button
                  className={`icon-btn ${showAppearance ? 'active-state' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setShowAppearance(!showAppearance); }}
                  title="外观"
                >
                  Aa
                </button>
              </div>

              <div className="vertical-divider"></div>

              <div className="capsule-group middle-group segmented-pill">
                <button
                  className={`pill-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
                  onClick={() => setViewMode('side-by-side')}
                  title="对照阅读"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="9" height="18" rx="2" /><rect x="13" y="3" width="9" height="18" rx="2" /></svg>
                </button>
                <div className="pill-divider"></div>
                <button
                  className={`pill-btn ${viewMode === 'interleaved' ? 'active' : ''}`}
                  onClick={() => setViewMode('interleaved')}
                  title="交替阅读"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="14" x2="21" y2="14" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
              </div>

              <div className="vertical-divider"></div>

              <div className="capsule-group">
                <button
                  onClick={toggleFullscreen}
                  className={`icon-btn ${isFullscreen ? "active" : ""}`}
                  title="全屏"
                >
                  {isFullscreen ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                  )}
                </button>
              </div>

              {/* Export Button */}
              {onExport && (
                <>
                  <div className="vertical-divider export-divider"></div>
                  <div className="capsule-group export-group">
                    <button
                      onClick={onExport}
                      className="icon-btn"
                      title="导出翻译"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </button>
                  </div>
                </>
              )}

              <div className="vertical-divider"></div>

              {/* Collapse Toolbar Button */}
              <button
                className="action-btn-circle"
                onClick={() => setIsCollapsed(true)}
                title="收起工具栏"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </>
          )}

        </div>
      </div>

      <style>{`
        .reading-view {
          width: 100%;
          min-height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
          padding-bottom: 140px;
        }
        
        .reading-view:fullscreen {
           background: var(--color-bg-primary);
           overflow-y: auto;
           padding: 2rem;
           padding-bottom: 140px;
        }

        /* Container: Fixed position, allows children to float */
        .control-capsule-container {
          position: fixed;
          bottom: 0;
          left: 0; 
          right: 0;
          height: auto;
          padding-bottom: 2rem;
          display: flex;
          justify-content: center;
          align-items: flex-end; /* ensure it sits at bottom */
          z-index: 1000;
          pointer-events: none;
        }

        /* Main Capsule Bar */
        .control-capsule {
          pointer-events: auto;
          display: flex;
          align-items: center;
          /* Desktop: Thicker, Premium, No Clipping */
          padding: 0.625rem 1.25rem; /* ~10px vertical padding -> 44 + 20 = 64px height */
          gap: 0.75rem; /* Optimized gap for better visual grouping */
          border-radius: 999px;
          
          /* Apple Liquid Glass - Same as Appearance Popover */
          background: var(--color-bg-glass-heavy);
          backdrop-filter: blur(24px) saturate(180%); /* Add saturation for vibrant clarity */
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          
          /* Rim Lighting - Directional Borders for 3D Effect (Reduced for pill shape) */
          border-top: 1px solid rgba(255, 255, 255, 0.5);    /* Reduced from 0.8 */
          border-left: 1px solid rgba(255, 255, 255, 0.5);   /* Reduced from 0.8 */
          border-right: 1px solid rgba(0, 0, 0, 0.08);       /* Same - BLACK for contrast */
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);      /* Same - BLACK */
          
          /* Rim Lighting + Internal Glow */
          box-shadow: 
             0 8px 32px rgba(31, 38, 135, 0.12),           /* Depth shadow */
             inset 0 1px 0 rgba(255, 255, 255, 0.3),       /* Top inner highlight - reduced */
             inset 0 -1px 0 rgba(255, 255, 255, 0.1);      /* Bottom inner glow - reduced */ 

          /* Physics Animation */
          transition: 
             width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
             height 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
             border-radius 0.4s ease,
             transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
             background 0.3s ease,
             gap 0.4s ease,
             padding 0.4s ease;
          
          transform-origin: center bottom;
          will-change: width, height, transform; 
          
          width: auto;
          max-width: none; /* Let it breathe on desktop */
          overflow: visible; /* CRITICAL: Allows Popover to spill out */
          position: relative;
        }
        
        /* Theme-specific borders for toolbar (slightly reduced for pill shape) */
        [data-theme='dark'] .control-capsule {
           border-top: 1px solid rgba(255, 255, 255, 0.12);   /* Reduced from 0.15 */
           border-left: 1px solid rgba(255, 255, 255, 0.12);
           border-right: 1px solid rgba(255, 255, 255, 0.05);
           border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        [data-theme='sepia'] .control-capsule {
           border-top: 1px solid rgba(255, 250, 235, 0.6);
           border-left: 1px solid rgba(255, 250, 235, 0.6);
           border-right: 1px solid rgba(91, 70, 54, 0.25);
           border-bottom: 1px solid rgba(91, 70, 54, 0.25);
        }
        
        [data-theme='oled'] .control-capsule {
           border-top: 1px solid rgba(255, 255, 255, 0.10);
           border-left: 1px solid rgba(255, 255, 255, 0.10);
           border-right: 1px solid rgba(255, 255, 255, 0.03);
           border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        
        /* Collapsed State */
        .control-capsule.collapsed {
            position: fixed; 
            bottom: 2rem;
            right: 2rem;
            left: auto; 
            transform: none;
            
            width: 56px;
            height: 56px;
            padding: 0;
            gap: 0;
            justify-content: center;
            border-radius: 50%;
            
            overflow: hidden; 
            background: var(--color-bg-glass);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.1);
        }
        
        /* Mobile adjustment for corner */
        @media (max-width: 768px) {
           .control-capsule.collapsed {
              right: 1.5rem;
              bottom: 1.5rem;
           }
        }
        
        @media (hover: hover) {
            .control-capsule:not(.collapsed):hover {
                box-shadow: 0 12px 40px rgba(0,0,0,0.2),
                            0 1px 1px rgba(255,255,255,0.3) inset,
                            0 0 0 1px rgba(255,255,255,0.2),
                            0 0 20px -5px var(--color-accent-primary-faint, rgba(0,122,255,0.15));
                transform: translateY(-2px) scale(1.005);
            }
        }

        .vertical-divider {
            width: 1px;
            height: 24px; /* Taller for desktop */
            min-width: 1px; 
            background: var(--color-text-primary);
            opacity: 0.15;
            margin: 0;
            transition: opacity 0.2s;
        }
        
        .control-capsule.collapsed .vertical-divider {
           display: none; 
        }

        .icon-btn {
           width: 44px; height: 44px; 
           min-width: 44px; 
           border-radius: 50%;
           display: flex;
           align-items: center; justify-content: center;
           color: var(--color-text-secondary);
           background: transparent;
           border: none;
           cursor: pointer;
           transition: var(--transition-base);
           font-weight: 600;
           flex-shrink: 0; 
        }
        
        .icon-btn:hover {
            color: var(--color-text-primary);
            background: rgba(0,0,0,0.05);
            transform: scale(1.05);
        }
        
        .icon-btn.active, .icon-btn.active-state {
            color: var(--color-accent-primary);
            background: rgba(0, 122, 255, 0.1);
        }
        
        /* Ensure SVGs always render correctly inside buttons */
        .icon-btn svg,
        .pill-btn svg,
        .action-btn-circle svg,
        .expand-btn svg {
            display: block;
            flex-shrink: 0;
            width: auto;
            height: auto;
            visibility: visible !important;
            opacity: 1 !important;
            pointer-events: none;
        }
        
        /* Prevent SVG from inheriting harmful text styles */
        .control-capsule svg {
            font-size: inherit;
            line-height: 1;
            overflow: visible;
        }
        
        .expand-btn {
           width: 100%; height: 100%;
           color: var(--color-text-primary);
           opacity: 0.8;
           border-radius: 50%;
        }
        .expand-btn:hover {
           background: transparent;
           opacity: 1;
           transform: scale(1.1);
        }

        .middle-group {
           display: flex;
           gap: 0.5rem;
           flex-shrink: 0; 
        }

        .action-btn-circle {
           width: 44px; height: 44px;
           min-width: 44px;
           border-radius: 50%;
           border: none;
           background: var(--color-accent-primary);
           color: white;
           font-weight: bold;
           cursor: pointer;
           margin-left: 0.5rem;
           box-shadow: 0 4px 12px rgba(0,122,255,0.3);
           transition: var(--transition-spring);
           flex-shrink: 0;
        }
        
        .action-btn-circle:hover {
           transform: scale(1.1);
           background: var(--color-accent-hover);
        }

        /* Segmented Pill Styling */
        .segmented-pill {
           background: rgba(120, 120, 128, 0.16);
           padding: 3px;
           border-radius: 99px;
           display: flex;
           align-items: center;
           height: 44px; /* Match icon button height */
           gap: 0 !important; /* Override gap */
        }
        
        .pill-btn {
           background: transparent;
           border: none;
           border-radius: 99px;
           width: 44px; /* Match icon button width */
           height: 38px; /* Slightly less than container for breathing room */
           display: flex;
           align-items: center; 
           justify-content: center;
           color: var(--color-text-secondary);
           cursor: pointer;
           transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .pill-btn:hover {
           color: var(--color-text-primary);
        }
        
        .pill-btn.active {
           background: var(--color-bg-primary);
           color: var(--color-accent-primary);
           box-shadow: 0 2px 4px rgba(0,0,0,0.12),
                       0 0 0 0.5px rgba(0,0,0,0.04);
        }
        
        .pill-divider {
           width: 1px;
           height: 16px; /* Taller for 44px container */
           background: var(--color-text-muted);
           opacity: 0.25;
           margin: 0 3px;
        }
        .pill-btn.active + .pill-divider, .pill-divider:has(+ .pill-btn.active) {
            opacity: 0; /* Hide divider near active pill */
        }


        /* --- Appearance Popover (Unified Desktop & Mobile) --- */
        .appearance-popover {
           pointer-events: auto;
           
           /* Fixed positioning - float above toolbar */
           position: fixed;
           bottom: 7rem; /* Above the toolbar */
           left: 50%;
           transform: translateX(-50%); /* Center horizontally */
           
           /* Sizing */
           width: min(280px, calc(100vw - 2rem));
           max-height: 60vh;
           overflow-y: auto;
           padding: 1.25rem;
           border-radius: var(--radius-xl);
           /* Apple Liquid Glass - Light Mode */
           background: rgba(255, 255, 255, 0.30); /* 30% opacity for translucency */
           backdrop-filter: blur(16px) saturate(180%); /* Blur + saturation for vibrant clarity */
           -webkit-backdrop-filter: blur(16px) saturate(180%);
           
           
           /* Rim Lighting - Directional Borders for 3D Effect */
           border-top: 1px solid rgba(255, 255, 255, 0.8);    /* Top highlight - light source */
           border-left: 1px solid rgba(255, 255, 255, 0.8);   /* Left highlight */
           border-right: 1px solid rgba(0, 0, 0, 0.08);       /* Right shadow - BLACK for contrast! */
           border-bottom: 1px solid rgba(0, 0, 0, 0.08);      /* Bottom shadow - BLACK */
           
           /* Rim Lighting + Internal Glow */
           box-shadow: 
              0 8px 32px rgba(31, 38, 135, 0.15),              /* Depth shadow - floating effect */
              inset 0 1px 0 rgba(255, 255, 255, 0.8),          /* Top inner highlight */
              inset 0 -1px 0 rgba(255, 255, 255, 0.3);         /* Bottom inner glow */
           
           /* Content */
           display: flex;
           flex-direction: column;
           gap: 1.25rem;
           color: var(--color-text-primary);
           
           /* Animation */
           animation: slideUpMobile 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
           will-change: transform;
           transition: box-shadow 0.3s ease, transform 0.3s ease;
           z-index: 2000;
        }
        
        /* Hover enhancement (desktop only) */
        @media (hover: hover) {
           .appearance-popover:hover {
              box-shadow: 0 16px 48px rgba(0,0,0,0.2),
                          0 1px 1px rgba(255,255,255,0.25) inset,
                          0 0 0 1px rgba(255,255,255,0.15);
              transform: translateX(-50%) translateY(-4px) !important;
           }
        }
        
        /* Apple Liquid Glass - Dark Themes */
        [data-theme='dark'] .appearance-popover {
           background: rgba(28, 28, 30, 0.40); /* Dark glass - 40% opacity */
           backdrop-filter: blur(20px) saturate(150%); /* Stronger blur for dark mode */
           -webkit-backdrop-filter: blur(20px) saturate(150%);
           /* Rim Lighting for dark mode */
           border-top: 1px solid rgba(255, 255, 255, 0.15);
           border-left: 1px solid rgba(255, 255, 255, 0.15);
           border-right: 1px solid rgba(255, 255, 255, 0.05);
           border-bottom: 1px solid rgba(255, 255, 255, 0.05);
           box-shadow: 
              0 8px 32px rgba(0, 0, 0, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.08),
              inset 0 -1px 0 rgba(255, 255, 255, 0.03);
        }
        
        [data-theme='sepia'] .appearance-popover {
           background: rgba(248, 241, 227, 0.30); /* Sepia glass */
           backdrop-filter: blur(16px) saturate(180%);
           -webkit-backdrop-filter: blur(16px) saturate(180%);
           /* Rim Lighting for sepia - warm tones with stronger contrast */
           border-top: 1px solid rgba(255, 250, 235, 0.6);
           border-left: 1px solid rgba(255, 250, 235, 0.6);
           border-right: 1px solid rgba(91, 70, 54, 0.25);  /* Increased for contrast */
           border-bottom: 1px solid rgba(91, 70, 54, 0.25);
           box-shadow: 
              0 8px 32px rgba(91, 70, 54, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.4),
              inset 0 -1px 0 rgba(255, 255, 255, 0.15);
        }
        
        [data-theme='oled'] .appearance-popover {
           background: rgba(10, 10, 10, 0.50); /* OLED glass - more opaque */
           backdrop-filter: blur(20px) saturate(140%);
           -webkit-backdrop-filter: blur(20px) saturate(140%);
           /* Rim Lighting for OLED - ultra subtle */
           border-top: 1px solid rgba(255, 255, 255, 0.10);
           border-left: 1px solid rgba(255, 255, 255, 0.10);
           border-right: 1px solid rgba(255, 255, 255, 0.03);
           border-bottom: 1px solid rgba(255, 255, 255, 0.03);
           box-shadow: 
              0 8px 32px rgba(0, 0, 0, 0.6),
              inset 0 1px 0 rgba(255, 255, 255, 0.06),
              inset 0 -1px 0 rgba(255, 255, 255, 0.02);
        }
        
        /* Slide up animation */
        @keyframes slideUpMobile {
           from { 
              opacity: 0; 
              transform: translateX(-50%) translateY(30px);
           }
           to { 
              opacity: 1; 
              transform: translateX(-50%) translateY(0);
           }
        }

        .popover-section {
           display: flex;
           flex-direction: column;
           gap: 0.5rem;
        }
        
        .label {
           font-size: 0.75rem;
           text-transform: uppercase;
           letter-spacing: 0.05em;
           color: var(--color-text-muted);
           font-weight: 600;
           margin-left: 0.25rem;
        }
        
        .control-row {
           display: flex;
           align-items: center;
           background: rgba(120, 120, 128, 0.12);
           border-radius: var(--radius-md);
           padding: 0.25rem;
        }
        
        .icon-btn-large {
           flex: 1;
           background: transparent;
           border: none;
           padding: 0.5rem;
           color: var(--color-text-primary);
           cursor: pointer;
           border-radius: var(--radius-sm);
           min-height: 44px; /* Target size */
        }
        
        .icon-btn-large:hover { background: rgba(255,255,255,0.2); }
        
        .value-display {
           font-weight: 600;
           font-size: 0.9rem;
           width: 40px;
           text-align: center;
           color: var(--color-text-primary);
        }

        .segmented-control {
           display: flex;
           background: rgba(120, 120, 128, 0.12);
           border-radius: var(--radius-md);
           padding: 0.25rem;
        }
        
        .segmented-control button {
           flex: 1;
           background: transparent;
           border: none;
           padding: 0.4rem;
           font-size: 0.8rem;
           color: var(--color-text-primary);
           border-radius: 6px;
           cursor: pointer;
           transition: all 0.2s;
           min-height: 32px;
        }
        
        .segmented-control button.active {
           background: var(--color-bg-primary);
           box-shadow: 0 2px 4px rgba(0,0,0,0.1);
           font-weight: 600;
        }

        .theme-grid {
           display: flex;
           justify-content: space-between;
           gap: 0.5rem;
        }
        
        .theme-circle {
           width: 48px; height: 48px;
           border-radius: 50%;
           border: 2px solid transparent;
           cursor: pointer;
           font-size: 1.2rem;
           display: flex;
           align-items: center; justify-content: center;
           transition: transform 0.2s;
        }
        
        .theme-circle:hover { transform: scale(1.1); }
        .theme-circle.active { border-color: var(--color-accent-primary); }
        
        .theme-circle.light { background: #f2f4f6; color: #1d1d1f; }
        .theme-circle.dark { background: #1c1c1e; color: #f2f2f7; }
        .theme-circle.sepia { background: #efe6d5; color: #5b4636; }
        .theme-circle.oled { background: #000000; color: #e0e0e0; border: 1px solid #333; }
        .theme-circle.oled.active { border-color: #fff; }

        /* Typography & Content Layout */
        .content-area {
          flex: 1;
          max-width: 900px; /* Slightly wider for book mode */
          margin: 0 auto;
          padding: 4rem 2rem 8rem 2rem;
          /* Enable scroll anchoring to prevent scroll jumps when content height changes */
          overflow-anchor: auto;
        }

        .paragraph-pair {
          margin-bottom: var(--paragraph-spacing, 1.5rem);
          font-family: var(--font-reading, var(--font-sans));
          transition: opacity 0.3s;
          position: relative; /* Context for spine */
        }

        /* SIDE BY SIDE: OPEN BOOK LAYOUT */
        .mode-side-by-side .paragraph-pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem; /* Wide Gap */
          align-items: start;
          /* Use selected font family and line height, not forced values */
        }
        
        /* The Spine Line */
        .mode-side-by-side .paragraph-pair::after {
            content: '';
            position: absolute;
            left: 50%;
            top: -1.25rem; /* Extend slightly up and down to connect */
            bottom: -1.25rem; 
            width: 1px;
            background: linear-gradient(to bottom, transparent, var(--color-border), transparent);
            transform: translateX(-50%);
            opacity: 0.5;
        }
        
        /* Add page-like padding to text to clearing the spine */
        .mode-side-by-side .original-text {
          color: var(--color-text-secondary);
          text-align: justify;
          margin-bottom: 0; /* Align perfectly */
        }
        
        .mode-interleaved .translated-text {
          text-align: justify;
          color: var(--color-text-primary);
          
          /* Minimal quote indicator - just left border */
          border-left: 3px solid rgba(0, 0, 0, 0.12); /* Subtle gray border - light mode */
          padding-left: 0.75rem;
        }
        
        /* Dark theme - use white gray */
        [data-theme='dark'] .mode-interleaved .translated-text {
          border-left-color: rgba(255, 255, 255, 0.15);
        }
        
        [data-theme='sepia'] .mode-interleaved .translated-text {
          border-left-color: rgba(91, 70, 54, 0.2); /* Warm gray for sepia */
        }
        
        [data-theme='oled'] .mode-interleaved .translated-text {
          border-left-color: rgba(255, 255, 255, 0.18);
        }
        
        .mode-side-by-side .translated-text {
          text-align: justify;
          color: var(--color-text-primary);
        }

        .translation-placeholder {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--color-text-muted);
            font-size: 0.85em;
            background: rgba(120,120,128,0.05);
            padding: 0.5rem 0.75rem;
            border-radius: 8px;
            width: fit-content;
            /* Prevent this element from being used as scroll anchor */
            overflow-anchor: none;
        }
        
        /* Make translated text stable for scroll anchoring */
        .translated-text {
            overflow-anchor: auto;
        }
        
        .retry-btn {
            background: none; border:none; 
            padding: 0; cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
            font-size: 1.1rem;
            min-width: 30px; min-height: 30px; /* Accessible retry */
            display: flex; align-items: center; justify-content: center;
        }
        .retry-btn:hover { opacity: 1; color: var(--color-accent-primary); }

        @media (max-width: 768px) {
           /* 1. Optimize reading area padding and spacing */
           .reading-view { 
              padding-bottom: 100px; /* Reduced for better space usage */
           }
           
           .reading-view:fullscreen {
              padding: 1rem; /* Optimized for mobile fullscreen */
              padding-bottom: 100px;
           }
           
           .control-capsule-container { 
              bottom: 0.75rem; 
              padding-bottom: 1.5rem;
           }
           
           /* Content area optimization */
           .content-area {
              padding: 1.5rem 1rem 6rem 1rem; /* Better vertical spacing */
              max-width: 100%; /* Full width on mobile */
           }
           
           /* 2. Toolbar responsive layout - NO horizontal scroll */
           .control-capsule {
              max-width: calc(100vw - 2rem); /* Account for container margins */
              width: auto;
              overflow: visible; /* Remove horizontal scroll */
              padding: 0.5rem 0.65rem; /* Reduced horizontal padding */
              gap: 0.3rem; /* Tighter gap to fit buttons */
              justify-content: center; /* Center the controls */
           }
           
           /* 3. Optimize dividers for mobile */
           .vertical-divider {
              height: 20px; /* Shorter to match reduced button padding */
           }
           
           
           /* 4. Mobile appearance popover - inherits from main .appearance-popover */
           /* No override needed - unified positioning above */
           
           /* 5. Ensure buttons are touch-friendly (44px minimum) */
           .icon-btn {
              min-width: 44px;
              min-height: 44px;
              width: 44px;
              height: 44px;
           }
           
           .pill-btn {
              min-width: 40px; /* Slightly smaller but still touchable */
              min-height: 36px;
           }
           
           .action-btn-circle {
              min-width: 44px;
              min-height: 44px;
           }
           
           /* 6. Optimize collapsed state positioning */
           .control-capsule.collapsed {
              right: 1rem;
              bottom: 1rem;
              width: 52px;
              height: 52px;
           }
           
           /* 7. Side-by-side mode optimization for mobile */
           .mode-side-by-side .paragraph-pair {
             grid-template-columns: 1fr;
             gap: 1rem;
           }
           
           .mode-side-by-side .paragraph-pair::after {
             display: none; /* No spine on mobile vertical layout */
           }
           
           .mode-side-by-side .original-text {
             opacity: 0.8;
             font-size: 0.9em;
             margin-bottom: 0.5rem;
             text-align: left; /* Reset justify */
           }
           
           .mode-side-by-side .translated-text {
             text-align: left;
           }
        }
        
        /* Small phones - hide export button to prevent overflow */
        @media (max-width: 420px) {
           .export-group,
           .export-divider {
              display: none; /* Hide export on very small screens */
           }
           
           .control-capsule {
              gap: 0.25rem; /* Tighter spacing */
              padding: 0.5rem 0.6rem;
           }
           
           .icon-btn {
              width: 42px;
              height: 42px;
              min-width: 42px;
              min-height: 42px;
           }
           
           .action-btn-circle {
              width: 42px;
              height: 42px;
              min-width: 42px;
              min-height: 42px;
           }
        }
        
        /* Extra small devices optimization */
        @media (max-width: 380px) {
           .control-capsule {
              gap: 0.2rem; /* Even tighter spacing */
              padding: 0.45rem 0.5rem;
              max-width: calc(100vw - 1.5rem);
           }
           
           .icon-btn {
              width: 38px; /* Smaller but still accessible */
              height: 38px;
              min-width: 38px;
              min-height: 38px;
           }
           
           .action-btn-circle {
              width: 38px;
              height: 38px;
              min-width: 38px;
              min-height: 38px;
           }
           
           .vertical-divider {
              height: 18px; /* Shorter dividers */
           }
           
           .appearance-popover {
              width: calc(100vw - 1.5rem);
              padding: 1rem;
           }
           
           .content-area {
              padding: 1rem 0.75rem 5rem 0.75rem;
           }
        }
        
        /* Ultra small devices - further optimizations */
        @media (max-width: 350px) {
           .control-capsule {
              gap: 0.15rem;
              padding: 0.4rem 0.45rem;
           }
           
           .icon-btn {
              width: 36px;
              height: 36px;
              min-width: 36px;
              min-height: 36px;
           }
           
           .action-btn-circle {
              width: 36px;
              height: 36px;
              min-width: 36px;
              min-height: 36px;
           }
           
           .pill-btn {
              min-width: 36px;
              min-height: 32px;
           }
        }
      `}</style>
    </div>
  );
};

