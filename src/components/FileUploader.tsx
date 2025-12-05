import React, { useCallback, useState } from 'react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, isLoading }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (isLoading) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect, isLoading]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading) setIsDragOver(true);
  }, [isLoading]);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="uploader-container">
      <div
        className={`drop-zone glass-panel ${isDragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isLoading && document.getElementById('file-input')?.click()}
      >
        <input
          type="file"
          id="file-input"
          accept=".txt,.md"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={isLoading}
        />
        <div className="content-wrap">
          <div className="icon-wrapper">
            <svg className="icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h3>{isLoading ? '正在分析文本...' : '点击或拖拽上传小说'}</h3>
          <p className="sub-text">支持 .txt 和 .md 格式 &middot; 自动识别章节</p>
        </div>
      </div>

      <style>{`
        .uploader-container {
          width: 100%;
          max-width: 500px;
          margin: 1rem auto 2rem auto;
          padding: 0 1rem;
        }
        .drop-zone {
          /* Liquid Drop Zone */
          border: 1px solid var(--color-border); /* Solid, subtle border */
          border-radius: var(--radius-xl);
          padding: 3.5rem 2rem;
          text-align: center;
          transition: var(--transition-spring);
          cursor: pointer;
          
          /* Glass Effect */
          background: var(--color-bg-glass);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          
          /* Light effects */
          box-shadow: var(--shadow-lg), 
                      inset 0 1px 1px var(--color-rim-light);
          
          position: relative;
          overflow: hidden;
        }
        
        /* Interactive States */
        .drop-zone:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: var(--shadow-xl), 
                      inset 0 1px 1px rgba(255,255,255,0.4);
          border-color: var(--color-accent-primary);
        }
        
        .drop-zone.drag-over {
          border-color: var(--color-accent-primary);
          background: var(--color-bg-glass-heavy);
          transform: scale(1.02);
          box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.1);
        }
        
        .drop-zone.loading {
          opacity: 0.8;
          cursor: wait;
        }
        
        /* Content Styling */
        .content-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          position: relative;
          z-index: 10;
        }

        .icon-wrapper {
          width: 72px;
          height: 72px;
          background: var(--color-bg-tertiary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.5rem;
          transition: var(--transition-spring);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); /* Inner depth */
        }

        .drop-zone:hover .icon-wrapper {
          background: var(--color-accent-primary);
          color: white;
          transform: scale(1.1) rotate(-8deg);
          box-shadow: 0 8px 16px rgba(0,122,255,0.3);
        }

        .icon {
          font-size: 2rem;
        }
        
        h3 {
          margin: 0;
          color: var(--color-text-primary);
          font-size: 1.1rem;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        
        .sub-text {
          margin: 0;
          color: var(--color-text-secondary);
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
};
