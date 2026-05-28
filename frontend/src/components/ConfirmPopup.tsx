import React, { useState, useEffect, useRef } from 'react';
import './ConfirmPopup.css';

type ConfirmPopupProps = {
  isOpen: boolean;
  type?: 'input' | 'confirm' | 'alert' | 'destructive';
  message: string;
  onConfirm: (value?: string) => void;
  onCancel?: () => void;
  title?: string;
  placeholder?: string;
};

const ConfirmPopup: React.FC<ConfirmPopupProps> = ({
  isOpen,
  type = 'alert',
  message,
  onConfirm,
  onCancel,
  title,
  placeholder = '<값 입력>'
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      if (type === 'input' && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  }, [isOpen, type]);

  // ESC를 누르면 취소 동작
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (type === 'alert') {
          onConfirm();
        } else if (onCancel) {
          onCancel();
        } else {
          onConfirm();
        }
      } else if (e.key === 'Enter' && type === 'confirm') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, type, onConfirm, onCancel]);


  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(type === 'input' ? inputValue : undefined);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-box">
        {title && type !== 'destructive' && (
          <div className='popup-header-general'>
            <h4>{title}</h4>
          </div>
        )}
        {type === 'destructive' && (
          <div className='popup-header'>
            <h3>{title || '경   고'}</h3>
          </div>
        )}
        <div className="popup-body">
          <p>{message}</p>
          {type === 'input' && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className='popup-input'
            />
          )}
      </div>
      <div className='popup-buttons'>
          {type !== 'alert' && onCancel && (
            <button onClick={onCancel} className="popup-button cancel">
              취소
            </button>
          )}
          <button onClick={handleConfirm} className="popup-button confirm">
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmPopup;