import React, { useEffect, useState } from 'react';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [dataPath, setDataPath] = useState('');
  useEffect(() => {
    const loadDefaultPath = async () => {
      const defaultPath =
        (window as any).electronAPI?.getDefaultDataPath
          ? await (window as any).electronAPI.getDefaultDataPath()
          : '~/.customMydataService';
      setDataPath(defaultPath);
    };
    loadDefaultPath();
  }, []);

  const handleBrowse = async () => {
    if (!(window as any).electronAPI?.selectDirectory) return;
    const result = await (window as any).electronAPI.selectDirectory();
    if (!result?.canceled && result?.path) {
      setDataPath(result.path);
    }
  };

  const handleSave = () => {
    // 아직 저장은 안 하고, 값만 바뀌는지 테스트
    console.log('Selected data path:', dataPath);
    onClose();
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-modal-bg" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2 className="settings-modal-title">설정</h2>
          <button className="settings-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-section">
            <div className="settings-section-title">일반</div>
            <div className="settings-section-content">
              <div className="settings-row">
                <div className="settings-label">저장 경로</div>
                <div className="settings-field">
                  <input
                    className="settings-input"
                    type="text"
                    value={dataPath}
                    onChange={(e) => setDataPath(e.target.value)}
                    placeholder="경로를 입력하세요"
                  />
                  <button className="settings-browse-btn" onClick={handleBrowse}>
                    경로 선택
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">데이터</div>
            <div className="settings-section-content">
              <div className="settings-row">이 영역에 옵션을 배치하세요.</div>
            </div>
          </div>
        </div>

        <div className="settings-modal-footer">
          <button className="settings-cancel-btn" onClick={onClose}>취소</button>
          <button className="settings-save-btn" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;