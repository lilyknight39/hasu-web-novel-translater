import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      <header className="app-header glass-panel">
        <div className="header-content">
          <div className="logo-container">
            <h1 className="logo-text">莲之空传统鉴赏部 - AI 小说翻译</h1>
            <span className="logo-badge">测试版</span>
          </div>
          <nav className="nav-actions">
            {/* Future nav items */}
          </nav>
        </div>
      </header>
      <main className="app-content">
        <div className="content-wrapper">
          {children}
        </div>
      </main>
      <style>{`
        .layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--color-bg-primary);
          color: var(--color-text-primary);
        }

        .app-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255,255,255,0.01); /* Extremely subtle initially */
          backdrop-filter: blur(0px); /* Transition to blur */
          border-bottom: 1px solid transparent;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        /* When scrolling, we could add a class, but for now let's just make it always glass-frosted but clean */
        .app-header.glass-panel {
            background: var(--color-bg-glass);
            backdrop-filter: blur(var(--backdrop-blur));
            border-bottom: 1px solid var(--color-border);
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0.75rem 1.5rem; /* Reduced padding for cleaner look */
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: var(--header-height);
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .logo-text {
          margin: 0;
          font-size: 1.35rem; /* Larger, bolder */
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.02em;
        }

        .logo-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.75rem;
          background: var(--color-bg-secondary);
          color: var(--color-text-secondary);
          border-radius: var(--radius-full);
          font-weight: 600;
        }

        .app-content {
          flex: 1;
          width: 100%;
        }

        .content-wrapper {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          width: 100%;
          box-sizing: border-box;
        }
        
        @media (max-width: 768px) {
          .header-content {
            padding: 0.5rem 1rem;
          }
          
          .logo-text {
            font-size: 1.2rem;
          }

          .content-wrapper {
            padding: 1.5rem 1rem;
          }
        }
      `}</style>
    </div>
  );
};
