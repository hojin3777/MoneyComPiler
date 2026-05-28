import React, { useEffect, useRef } from 'react';
import './HighlightPopup.css';

// ✨ 색상 팔레트 순서를 CSS와 일치시킴
export const HIGHLIGHT_COLORS = [
  { id: 0, color: 'transparent', name: '없음' },
  { id: 1, color: '#757e8a', name: '보라/회색' },
  { id: 2, color: '#ed4245', name: '핑크/빨강' },
  { id: 3, color: '#faa61a', name: '노랑/주황' },
  { id: 4, color: '#3ba55c', name: '연두' },
  { id: 5, color: '#5c64f4', name: '하늘/파랑' },
  { id: 6, color: '#eb459f', name: '주황/마젠타' },
];

type HighlightPopupProps = {
  position: { top: number; left: number };
  onSelectColor: (colorId: number) => void;
  onClose: () => void;
  title: string;
};

const HighlightPopup: React.FC<HighlightPopupProps> = ({ position, onSelectColor, onClose, title }) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="highlight-popup"
      style={{ top: position.top, left: position.left }}
    >
      <div className='popup-title'>{title}</div>
      <div className="color-palette">
        {HIGHLIGHT_COLORS.map(({ id, color, name }) => (
          <button
            key={id}
            className="color-swatch-btn"
            title={name}
            // ✨ onSelectColor에 id를 전달
            onClick={() => onSelectColor(id)}
          >
            {id === 0 ? (
              <div className="color-swatch none">
                <svg viewBox="0 0 24 24">
                  <line x1="4" y1="20" x2="20" y2="4" stroke="red" strokeWidth="2" />
                </svg>
              </div>
            ) : (
              <div className="color-swatch" style={{ backgroundColor: color }}></div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HighlightPopup;