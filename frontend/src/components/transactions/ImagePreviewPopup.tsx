import React, { useState, useEffect, useRef } from 'react';
import './ImagePreviewPopup.css';

type ImagePreviewPopupProps = {
  preview: {
    url: string;
    top: number;
    left: number;
    filename: string;
  } | null;
  onClose: () => void;
};

const ImagePreviewPopup: React.FC<ImagePreviewPopupProps> = ({ preview, onClose }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview) {
      setPosition({ top: preview.top, left: preview.left });
    }
  }, [preview]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!popupRef.current) return;
    setIsDragging(true);
    const rect = popupRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // 텍스트 드래그 방지
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        top: e.clientY - dragOffset.current.y,
        left: e.clientX - dragOffset.current.x,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!preview) {
    return null;
  }

  const popupStyle: React.CSSProperties = {
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  return (
    <div ref={popupRef} className="image-preview-popup" style={popupStyle}>
      <div className="image-preview-header" onMouseDown={handleMouseDown}>
        <span className="image-preview-filename">{preview.filename}</span>
        <button className="image-preview-close-btn" onClick={onClose}>×</button>
      </div>
      <div className="image-preview-content">
        <img src={preview.url} alt="Transaction Preview" />
      </div>
    </div>
  );
};

export default ImagePreviewPopup;