import React, { useEffect, useState } from 'react';
import ConfirmPopup from '../components/ConfirmPopup';
import { FaUndo } from 'react-icons/fa'
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}
type AlertInfo = {
  isOpen: boolean;
  type?: 'input' | 'confirm' | 'alert' | 'destructive';
  message: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
  title?: string;
  placeholder?: string;
}

const API_BASE_URL = 'http://127.0.0.1:5050';
const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [dataPath, setDataPath] = useState('');
  const [alertInfo, setAlertInfo] = useState<AlertInfo>({
    isOpen: false,
    message: '',
    type: 'confirm',
    onConfirm: () => {},
    onCancel: () => {},
  })
  const [originalPath, setOriginalPath] = useState('');

  useEffect(() => {
    const loadDefaultPath = async () => {
      const res = await fetch(`${API_BASE_URL}/api/settings/data-path`);
      const json = await res.json();
      setDataPath(json.path);
      setOriginalPath(json.path);
    };
    loadDefaultPath();
  }, []);

  // 경로 선택 버튼 클릭 시 디렉토리 선택 대화상자 열기
  const handleBrowse = async () => {
    if (!(window as any).electronAPI?.selectDirectory) return;
    const result = await (window as any).electronAPI.selectDirectory();
    if (!result?.canceled && result?.path) {
      setDataPath(result.path);
    }
  };

  const handlePathReset = async () => {
    setAlertInfo({
      isOpen: true,
      type: 'confirm',
      message: '저장 경로를 기본값으로 초기화하시겠습니까?',
      onConfirm: async () => {
        const res = await fetch(`${API_BASE_URL}/api/settings/data-path/default`);
        const json = await res.json();
        setDataPath(json.path);
        setAlertInfo(prev => ({ ...prev, isOpen: false }));

        if(!res.ok){
          console.error('기본 경로 불러오기 실패:', json?.error || res.statusText || 'unknown error');
        }
      },
      onCancel: () => {
        setAlertInfo(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  // 저장 버튼 클릭 시 설정 저장
  const handleSave = async () => {
    if (dataPath === originalPath) {
      onClose();
      return;
    }

    setAlertInfo({
      isOpen: true,
      type: 'confirm',
      message: '저장 경로를 변경하면 기존 데이터가 새 경로로 이동됩니다.\n계속하시겠습니까?',
      onConfirm: async () => {
        const res = await fetch(`${API_BASE_URL}/api/settings/data-path/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: dataPath, fromPath: originalPath }),
        });

        let json: any = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        if (!res.ok && json?.error === 'dest_db_exists') {
          setAlertInfo({
            isOpen: true,
            type: 'confirm',
            title: '덮어쓰기 확인',
            message: '새 경로에 기존 DB가 있습니다. 덮어쓸까요?\n(취소 시 새 경로의 기존 DB 사용)',
            onConfirm: async () => {
              const forceRes = await fetch(`${API_BASE_URL}/api/settings/data-path/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dataPath, fromPath: originalPath, force: true }),
              });

              let forceJson: any = null;
              try {
                forceJson = await forceRes.json();
              } catch {
                forceJson = null;
              }

              if (!forceRes.ok) {
                setAlertInfo({
                  isOpen: true,
                  type: 'alert',
                  message: `이동 실패: ${forceJson?.error || forceRes.statusText || 'unknown error'}`,
                  onConfirm: () => { setAlertInfo(prev => ({ ...prev, isOpen: false })); },
                  onCancel: () => { setAlertInfo(prev => ({ ...prev, isOpen: false })); },
                });
                return;
              }

              setAlertInfo({
                isOpen: true,
                type: 'confirm',
                message: '데이터 이동이 완료되었습니다. 애플리케이션을 재시작하시겠습니까?',
                onConfirm: () => (window as any).electronAPI?.relaunch?.() ?? window.location.reload(),
                onCancel: () => {
                  setAlertInfo(prev => ({ ...prev, isOpen: false }));
                  onClose();
                },
              });
            },
            onCancel: async () => {
              const useRes = await fetch(`${API_BASE_URL}/api/settings/data-path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dataPath }),
              });

              let useJson: any = null;
              try {
                useJson = await useRes.json();
              } catch {
                useJson = null;
              }

              if (!useRes.ok) {
                setAlertInfo({
                  isOpen: true,
                  type: 'alert',
                  message: `경로 변경 실패: ${useJson?.error || useRes.statusText || 'unknown error'}`,
                  onConfirm: () => { setAlertInfo(prev => ({ ...prev, isOpen: false })); },
                  onCancel: () => { setAlertInfo(prev => ({ ...prev, isOpen: false })); },
                });
                return;
              }

              setAlertInfo({
                isOpen: true,
                type: 'confirm',
                message: '기존 DB를 사용하도록 경로가 변경되었습니다.\n애플리케이션을 재시작하시겠습니까?',
                onConfirm: () => (window as any).electronAPI?.relaunch?.() ?? window.location.reload(),
                onCancel: () => {
                  setAlertInfo(prev => ({ ...prev, isOpen: false }));
                  onClose();
                },
              });
            }
          });
          return;
        }

        if (!res.ok) {
          setAlertInfo({
            isOpen: true,
            type: 'alert',
            message: `이동 실패: ${json?.error || res.statusText || 'unknown error'}`,
            onConfirm: () => { setAlertInfo(prev => ({ ...prev, isOpen: false })); },
            onCancel: () => { setAlertInfo(prev => ({ ...prev, isOpen: false })); },
          });
          return;
        }

        setAlertInfo({
          isOpen: true,
          type: 'confirm',
          message: '데이터 이동이 완료되었습니다.\n애플리케이션을 재시작하시겠습니까?',
          onConfirm: () => (window as any).electronAPI?.relaunch?.() ?? window.location.reload(),
          onCancel: () => {
            setAlertInfo(prev => ({ ...prev, isOpen: false }));
            onClose();
          },
        });
      },
      onCancel: () => {
        setAlertInfo(prev => ({ ...prev, isOpen: false }));
        onClose();
      },
    });
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
                  <button className="settings-browse-btn" onClick={handleBrowse}>
                    경로 선택
                  </button>
                  <input
                    className="settings-input"
                    type="text"
                    value={dataPath}
                    onChange={(e) => setDataPath(e.target.value)}
                    placeholder="경로를 입력하세요"
                  />
                  <button className="settings-browse-btn" onClick={handlePathReset} title="Reset to Default"><FaUndo /></button>
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
      <ConfirmPopup {...alertInfo} />
    </div>
  );
};

export default SettingsModal;