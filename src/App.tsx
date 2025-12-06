import { useState, useEffect } from 'react';
import './App.css';
import { FileUploader } from './components/FileUploader';
import { ReadingView } from './components/ReadingView';
import { TranslationWorkspace } from './components/TranslationWorkspace';
import { useNovel } from './hooks/useNovel';
import { storage } from './services/storage';

function App() {
  // Persist API Key & Base URL & Debug Mode & Model & Prompt
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('openai_base_url') || '');
  const [model, setModel] = useState(() => localStorage.getItem('openai_model') || 'gpt-4o');
  const [customPrompt, setCustomPrompt] = useState(() => localStorage.getItem('openai_custom_prompt') || '');
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem('debug_mode') === 'true');
  // Auto-detect theme preference
  const getInitialTheme = () => {
    const saved = localStorage.getItem('app_theme');
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  };
  const [theme, setTheme] = useState(getInitialTheme);
  const {
    novel,
    isLoading,
    error,
    logs,
    processFile,
    loadNovel,
    startTranslation,
    pauseTranslation,
    resumeTranslation,
    exportNovel,
    retrySegment,
    observeParagraph,
    unobserveParagraph,
    saveReadingPosition
  } = useNovel(apiKey, baseUrl, debugMode, model, customPrompt);

  // Persist theme & font
  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    document.body.dataset.theme = theme;
    // Update global CSS variables based on theme
    if (theme === 'dark') {
      document.documentElement.style.setProperty('--color-bg-primary', '#1a1a1a');
      document.documentElement.style.setProperty('--color-bg-secondary', '#2a2a2a');
      document.documentElement.style.setProperty('--color-text-primary', '#e0e0e0');
      document.documentElement.style.setProperty('--color-text-muted', '#a0a0a0');
      document.documentElement.style.setProperty('--color-border', '#333');
      document.documentElement.style.setProperty('--color-card-bg', '#2a2a2a');
    } else if (theme === 'sepia') {
      document.documentElement.style.setProperty('--color-bg-primary', '#f9f3e9');
      document.documentElement.style.setProperty('--color-bg-secondary', '#f2e8d5');
      document.documentElement.style.setProperty('--color-text-primary', '#5b4636');
      document.documentElement.style.setProperty('--color-text-muted', '#8c7b70');
      document.documentElement.style.setProperty('--color-border', '#dccdbb');
      document.documentElement.style.setProperty('--color-card-bg', '#f9f3e9');
    } else if (theme === 'oled') {
      document.documentElement.style.setProperty('--color-bg-primary', '#000000');
      document.documentElement.style.setProperty('--color-bg-secondary', '#000000');
      document.documentElement.style.setProperty('--color-text-primary', '#c0c0c0');
      document.documentElement.style.setProperty('--color-text-muted', '#666666');
      document.documentElement.style.setProperty('--color-border', '#333');
      document.documentElement.style.setProperty('--color-card-bg', '#121212');
    } else {
      // Light
      document.documentElement.style.setProperty('--color-bg-primary', '#ffffff');
      document.documentElement.style.setProperty('--color-bg-secondary', '#f3f4f6');
      document.documentElement.style.setProperty('--color-text-primary', '#111827');
      document.documentElement.style.setProperty('--color-text-muted', '#6b7280');
      document.documentElement.style.setProperty('--color-border', '#e5e7eb');
      document.documentElement.style.setProperty('--color-card-bg', '#ffffff');
    }
  }, [theme]);

  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('app_font') || 'sans');
  useEffect(() => {
    localStorage.setItem('app_font', fontFamily);
    // We pass this to ReadingView, or set a global variable?
    // A global variable is better for deep nesting, but props work for now.
    // Actually, setting a CSS variable on body is easiest.
    const map: Record<string, string> = {
      'sans': 'var(--font-sans)',
      'serif': 'var(--font-serif)',
      'mono': 'var(--font-mono)',
      'rounded': 'var(--font-rounded)'
    };
    document.documentElement.style.setProperty('--font-reading', map[fontFamily] || map['sans']);
  }, [fontFamily]);

  const [showSettings, setShowSettings] = useState(!apiKey);
  const [savedNovels, setSavedNovels] = useState<{ id: string, title: string }[]>([]);

  useEffect(() => {
    storage.getNovels().then(novels => {
      setSavedNovels(novels.map(n => ({ id: n.id, title: n.title })));
    });
  }, [novel]);

  const handleSettingsSave = () => {
    localStorage.setItem('openai_api_key', apiKey);
    localStorage.setItem('openai_base_url', baseUrl);
    localStorage.setItem('openai_model', model);
    localStorage.setItem('openai_custom_prompt', customPrompt);
    localStorage.setItem('debug_mode', String(debugMode));
    setShowSettings(false);
  };

  const renderSettingsModal = () => (
    <div className="modal-overlay">
      <div className="settings-panel glass-panel">
        <h2>配置 AI 服务</h2>
        <p className="settings-desc">配置您的 AI 服务提供商设置以开始翻译。</p>

        <div className="input-group">
          <label>API 密钥 (API Key)</label>
          <input
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="api-input"
          />
        </div>

        <div className="input-group">
          <label>API 地址 (Base URL)</label>
          <input
            type="text"
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="api-input"
          />
        </div>

        <div className="input-group">
          <label>模型名称 (Model Name)</label>
          <input
            type="text"
            placeholder="gpt-3.5-turbo"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="api-input"
          />
        </div>

        <div className="input-group">
          <label>自定义系统提示词 (可选)</label>
          <textarea
            placeholder="覆盖默认的系统提示词。使用 {{context}} 插入上下文..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="api-input"
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <small className="hint-text">
            <strong>提示：</strong>
            <ul>
              <li>此提示词将覆盖系统默认设置。</li>
              <li>使用 <code>{`{{context}}`}</code> 插入上下文（前文内容等）。</li>
              <li>批量翻译指令会自动追加以优化速度。</li>
            </ul>
          </small>
        </div>

        <div className="input-group checkbox-group">
          <input
            type="checkbox"
            id="debugMode"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          <label htmlFor="debugMode">启用调试模式</label>
        </div>

        <div className="modal-actions">
          <button
            className="btn-primary"
            onClick={handleSettingsSave}
            disabled={!apiKey.startsWith('sk-') && !apiKey}
          >
            保存并继续
          </button>
          {savedNovels.length > 0 && (
            <button className="btn-link" onClick={() => setShowSettings(false)}>
              暂不配置
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    if (novel) {
      // Reading View - No Global Header, just content and floating controls
      return (
        <div className={`novel-workspace theme-${theme}`}>
          {novel.status !== 'completed' && novel.status !== 'idle' && (
            <TranslationWorkspace
              progress={novel.progress}
              currentStatus={novel.status === 'paused' ? 'Paused' : 'Translating...'}
              isPaused={novel.status === 'paused'}
              onPauseToggle={novel.status === 'paused' ? resumeTranslation : pauseTranslation}
              onCancel={() => { pauseTranslation(); }}
              totalSegments={novel.chunks.length}
              completedSegments={Object.keys(novel.translations).length}
              logs={logs}
            />
          )}

          {novel.status === 'idle' && Object.keys(novel.translations).length < novel.chunks.length && (
            <div className="title-page-container">
              <div className="title-content">
                <h1 className="book-title">{novel.title}</h1>
                <p className="book-subtitle">莲之空传统鉴赏部机械桑翻译</p>
                <div className="action-area">
                  <button className="btn-liquid-cta" onClick={startTranslation}>开始翻译</button>
                </div>
              </div>

              <style>{`
                  .title-page-container {
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      min-height: 60vh; /* Centered visually in the upper portion */
                      text-align: center;
                      padding: 2rem;
                      animation: fadeIn 0.8s ease-out;
                  }
                  
                  @keyframes fadeIn {
                      from { opacity: 0; transform: translateY(20px); }
                      to { opacity: 1; transform: translateY(0); }
                  }

                  .book-title {
                      font-family: var(--font-serif);
                      font-size: 2.5rem;
                      font-weight: 700;
                      color: var(--color-text-primary);
                      margin: 0 0 1rem 0;
                      line-height: 1.2;
                      letter-spacing: -0.02em;
                  }
                  
                  .book-subtitle {
                      font-family: var(--font-serif);
                      font-size: 1.25rem;
                      color: var(--color-text-secondary);
                      margin: 0 0 4rem 0; /* Generous whitespace before action */
                      font-weight: 400;
                  }
                  
                  /* Liquid CTA Button */
                  .btn-liquid-cta {
                      background: var(--color-text-primary); /* High contrast, like ink */
                      border: none;
                      padding: 1rem 3.5rem;
                      font-size: 1.1rem;
                      font-weight: 600;
                      color: var(--color-bg-primary); /* Inverted text */
                      border-radius: 999px;
                      cursor: pointer;
                      position: relative;
                      overflow: hidden;
                      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                      box-shadow: 0 20px 40px -10px rgba(0,0,0,0.3);
                  }
                  
                  [data-theme='dark'] .btn-liquid-cta {
                      background: var(--color-accent-primary); /* Blue accent for dark mode */
                      color: white;
                      box-shadow: 0 4px 12px rgba(0, 122, 255, 0.4); /* Refined blue shadow */
                  }

                  .btn-liquid-cta:hover {
                      transform: scale(1.05) translateY(-2px);
                      box-shadow: 0 30px 60px -12px rgba(0,0,0,0.4);
                  }
                  
                  .btn-liquid-cta:active {
                      transform: scale(0.98);
                  }
                `}</style>
            </div>
          )}

          <ReadingView
            chunks={novel.chunks}
            translations={novel.translations}
            title={novel.title}
            onExport={() => exportNovel('txt')}
            currentTheme={theme}
            onThemeChange={setTheme}
            currentFont={fontFamily}
            onFontChange={setFontFamily}
            onRetry={retrySegment}
            onObserveParagraph={observeParagraph}
            onUnobserveParagraph={unobserveParagraph}
            onSaveReadingPosition={saveReadingPosition}
            initialReadingPosition={novel.lastReadChunkIndex}
            onBack={() => {
              if (confirm('返回主页？')) {
                window.location.reload();
              }
            }}
          />
        </div>
      );
    }

    // Home View - With Header
    return (
      <div className="home-view">
        {/* Simple Header for Home */}
        <div style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 10
        }}>
          <button
            className="btn-icon-subtle"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        <div className="hero-section">
          <h2>莲之空传统鉴赏部</h2>
          <p>AI 翻译阅读器 beta 1.6</p>
        </div>

        <FileUploader onFileSelect={processFile} isLoading={isLoading} />

        {savedNovels.length > 0 && (
          <div className="saved-novels">
            <h3>Continue Reading</h3>
            <div className="saved-list">
              {savedNovels.map(n => (
                <div key={n.id} className="novel-list-item">
                  <div className="novel-info" onClick={() => loadNovel(n.id)}>
                    <div className="list-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      </svg>
                    </div>
                    <h4>{n.title}</h4>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`确定要删除 "${n.title}" 吗？\n\n这将删除小说和所有翻译内容。`)) {
                        storage.deleteNovel(n.id).then(() => {
                          storage.getNovels().then(novels => {
                            setSavedNovels(novels.map(novel => ({ id: novel.id, title: novel.title })));
                          });
                        });
                      }
                    }}
                    title="删除"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    // Removed Layout wrapper to control Headers manually per view
    <div className="app-container">
      {error && <div className="error-banner">{error}</div>}
      {renderContent()}
      {showSettings && renderSettingsModal()}
    </div>
  );
};

export default App;
