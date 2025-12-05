import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      <header className="app-header" style={{ position: 'relative' }}>
        <div className="logo-container">
          <h1 className="logo-text">莲之空传统鉴赏部 AI 小说翻译器</h1>
        </div>
        <nav>
          {/* Settings button, etc can go here */}
        </nav>
      </header>
      <main className="app-content">
        {children}
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
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid var(--color-border);
          position: static;
          background: var(--color-bg-primary); /* Remove transparency if no longer overlay */
        }
        .logo-text {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .app-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          padding: 2rem;
        }
        
        @media (max-width: 768px) {
          .app-header {
            padding: 1rem;
            flex-direction: column;
            align-items: flex-start;
          }
          
          .logo-text {
            font-size: 1.25rem;
          }

          .app-content {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};
