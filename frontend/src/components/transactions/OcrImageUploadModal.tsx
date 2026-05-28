import React, { useRef, useState, useEffect } from 'react';
import './OcrImageUploadModal.css';

type OcrImageUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => void;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
};

const OcrImageUploadModal: React.FC<OcrImageUploadModalProps> = ({ isOpen, onClose, onUpload, anchorRef }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // 팝업 닫힐 때 파일 state 초기화
  useEffect(() => {
    if (!isOpen) setSelectedFiles([]);
  }, [isOpen]);

  // 외부 클릭 시 닫힘
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // 팝업 위치 계산 (anchorRef가 있으면 버튼 아래로)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (isOpen && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPopupStyle({
        position: 'absolute',
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        zIndex: 2000,
      });
    }
  }, [isOpen, anchorRef]);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles(files);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };
  const handleAreaClick = () => {
    inputRef.current?.click();
  };
  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onUpload(selectedFiles);
      setSelectedFiles([]);
    }
  };

  return (
    <div className="ocr-modal-popup" style={popupStyle} ref={modalRef}>
      <div className="ocr-modal-content">
        <div className="ocr-modal-header-row">
          <div className="ocr-modal-title">이미지로 거래내역 자동입력</div>
          <button className="ocr-modal-close" onClick={onClose}>×</button>
        </div>
        <div
          className={`ocr-drop-area${dragActive ? ' drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleAreaClick}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div className="ocr-drop-area-inner">
            {selectedFiles.length === 0 ? (
              <>
                <img src="/img-upload.svg" style={{ width: 48, opacity: 0.7, marginBottom: 8 }} />
                <div className="ocr-upload-text">
                  이미지를 드래그하거나 <span className="ocr-file-link">파일을 업로드</span>하세요.
                </div>
              </>
            ) : (
              <div className="ocr-file-list-inside">
                {selectedFiles.map(file => (
                  <div key={file.name}>{file.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ocr-modal-footer">
          <button
            className="primary ocr-upload-btn"
            onClick={handleUpload}
            disabled={selectedFiles.length === 0}
          >
            업로드
          </button>
          <button className="ocr-cancel-btn" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  );
};

export default OcrImageUploadModal;