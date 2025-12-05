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
        className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isLoading && document.getElementById('file-input')?.click()}
      >
        <input
          type="file"
          id="file-input"
          accept=".txt"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={isLoading}
        />
        <div className="icon">📄</div>
        <h3>{isLoading ? '处理中...' : '请将小说文件拖拽至此'}</h3>
        <p>支持 .txt / .md 文件</p>
      </div>

      <style>{`
        .uploader-container {
          width: 100%;
          max-width: 600px;
          margin: 4rem auto;
        }
        .drop-zone {
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-lg);
          padding: 4rem;
          text-align: center;
          transition: all var(--transition-normal);
          cursor: pointer;
          background: var(--color-bg-secondary);
        }
        .drop-zone:hover {
          border-color: var(--color-accent-primary);
          background: var(--color-bg-tertiary);
        }
        .drop-zone.drag-over {
          border-color: var(--color-accent-primary);
          background: rgba(56, 189, 248, 0.1);
          transform: scale(1.02);
        }
        .drop-zone.loading {
          opacity: 0.7;
          cursor: wait;
        }
        .icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        h3 {
          margin: 0 0 0.5rem 0;
          color: var(--color-text-primary);
        }
        p {
          margin: 0;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
};
