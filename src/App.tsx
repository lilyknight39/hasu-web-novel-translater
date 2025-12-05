import { useState, useEffect } from 'react';
import './App.css';
import { Layout } from './components/Layout';
import { FileUploader } from './components/FileUploader';
import { ReadingView } from './components/ReadingView';
import { TranslationWorkspace } from './components/TranslationWorkspace';
import { useNovel } from './hooks/useNovel';
import { storage } from './services/storage';

function App() {
  // Persist API Key & Base URL & Debug Mode & Model & Prompt
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('openai_base_url') || '');
  const [model, setModel] = useState(() => localStorage.getItem('openai_model') || 'gpt-3.5-turbo');
  const [customPrompt, setCustomPrompt] = useState(() => localStorage.getItem('openai_custom_prompt') || '');
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem('debug_mode') === 'true');
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light');
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
    retrySegment
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

  const renderContent = () => {
    if (showSettings) {
      return (
        <div className="settings-panel">
          <h2>配置</h2>
          <p>配置您的 AI 服务提供商设置。</p>

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
            <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: '0.25rem', lineHeight: '1.4' }}>
              <strong>提示：</strong>
              <ul style={{ paddingLeft: '1.2rem', marginTop: '0.25rem' }}>
                <li>此提示词将覆盖系统默认设置。</li>
                <li>使用 <code>{`{{context}}`}</code> 插入上下文（前文内容等）。</li>
                <li>批量翻译指令会自动追加以优化速度。</li>
              </ul>
            </small>
          </div>

          <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="debugMode"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            <label htmlFor="debugMode" style={{ margin: 0 }}>启用调试模式</label>
          </div>

          <button
            className="btn-primary"
            onClick={handleSettingsSave}
            disabled={!apiKey.startsWith('sk-') && !apiKey}
          >
            开始翻译
          </button>
          {savedNovels.length > 0 && <button className="btn-link" onClick={() => setShowSettings(false)}>取消</button>}
        </div>
      );
    }

    if (novel) {
      return (
        <div className={`novel-workspace theme-${theme}`}>
          {novel.status !== 'completed' && novel.status !== 'idle' && (
            <TranslationWorkspace
              progress={novel.progress}
              currentStatus={novel.status === 'paused' ? '已暂停' : '翻译中...'}
              isPaused={novel.status === 'paused'}
              onPauseToggle={novel.status === 'paused' ? resumeTranslation : pauseTranslation}
              onCancel={() => { /* TODO: Implement cancel fully */ pauseTranslation(); }}
              totalSegments={novel.chunks.length}
              completedSegments={Object.keys(novel.translations).length}
              logs={logs}
            />
          )}

          {novel.status === 'idle' && Object.keys(novel.translations).length < novel.chunks.length && (
            <div className="start-banner">
              <p>准备翻译 <strong>{novel.title}</strong></p>
              <button className="btn-primary" onClick={startTranslation}>开始翻译</button>
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
          />
        </div>
      );
    }

    return (
      <div className="home-view">
        <FileUploader onFileSelect={processFile} isLoading={isLoading} />

        {savedNovels.length > 0 && (
          <div className="saved-novels">
            <h3>继续阅读</h3>
            <div className="grid">
              {savedNovels.map(n => (
                <div key={n.id} className="novel-card" onClick={() => loadNovel(n.id)}>
                  <h4>{n.title}</h4>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="settings-trigger">
          <button className="btn-small" onClick={() => setShowSettings(true)}>API 设置</button>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      {error && <div className="error-banner">{error}</div>}
      {renderContent()}
    </Layout>
  );
}

export default App;
