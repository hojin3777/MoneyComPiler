import React, { useState, useEffect } from 'react';
import ConfirmPopup from '../ConfirmPopup';
import './ConsumptionPatternSettingsPopup.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

interface Settings {
  weekend_ratio_threshold: number;
  weekday_min_count: number;
  payday_spike_threshold: number;
  month_period_threshold: number;
  impulse_amount_limit: number;
  impulse_increase_threshold: number;
  category_spike_threshold: number;
  budget_alert_margin: number;
  no_spend_min_days: number;
  year_comparison_threshold: number;
  fixed_ratio_warning: number;
}

interface ConsumptionPatternSettingsPopupProps {
  onClose: () => void;
  onSave: () => void;
}

const ConsumptionPatternSettingsPopup: React.FC<ConsumptionPatternSettingsPopupProps> = ({ onClose, onSave }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmPopup, setConfirmPopup] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    onCancel: (() => { }) as (() => void) | undefined,
    type: 'confirm' as 'input' | 'confirm' | 'alert' | 'destructive'
  })

  // fetchSettings: 설정 불러오기
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/settings/consumption-pattern`);
        const data = await response.json();
        setSettings(data);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // handleSave: 설정 저장
  const handleSave = async () => {
    if (!settings) return;

    try {
      await fetch(`${API_BASE_URL}/api/settings/consumption-pattern`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('설정 저장에 실패했습니다.');
    }
  };

  // handleChange: 값 변경
  const handleChange = (key: keyof Settings, value: number) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  // handleReset: 기본값으로 초기화
  const handleReset = () => {
    setConfirmPopup({
      isOpen: true,
      type: 'destructive',
      title: '설정 초기화',
      message: '모든 설정을 기본값으로 되돌리시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      onConfirm: () => {
        const defaultSettings: Settings = {
          weekend_ratio_threshold: 1.5,
          weekday_min_count: 3,
          payday_spike_threshold: 30,
          month_period_threshold: 40,
          impulse_amount_limit: 10000,
          impulse_increase_threshold: 50,
          category_spike_threshold: 100,
          budget_alert_margin: 10,
          no_spend_min_days: 3,
          year_comparison_threshold: 20,
          fixed_ratio_warning: 50
        };
        setSettings(defaultSettings);
        setConfirmPopup(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
    });
  };

  if (isLoading) {
    return (
      <div className="popup-overlay-cpsettings">
        <div className="popup-container-cpsettings">
          <div className="popup-loading-cpsettings">설정 불러오는 중...</div>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <>
      <div className="popup-overlay-cpsettings" onClick={onClose} >
        <div className="popup-container-cpsettings" onClick={(e) => e.stopPropagation()}>
          <div className="popup-header-cpsettings">
            <h3>소비 패턴 인사이트 설정</h3>
            <button className="popup-close-button-cpsettings" onClick={onClose}>×</button>
          </div>

          <div className="popup-body-cpsettings">
            {/* 시기별 패턴 */}
            <div className="settings-group-cpsettings">
              <h4>시기별 패턴</h4>

              <div className="setting-item-inline-cpsettings">
                <strong>주말/평일 비교 : </strong>
                <span className="setting-description-cpsettings">
                  평일보다 주말 지출이{' '}
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={settings.weekend_ratio_threshold}
                    onChange={(e) => handleChange('weekend_ratio_threshold', parseFloat(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  배 높으면 알림
                </span>
              </div>

              <div className="setting-item-inline-cpsettings">
                <strong>요일별 집중 : </strong>
                <span className="setting-description-cpsettings">
                  특정 요일{' '}
                  <input
                    type="number"
                    min="2"
                    value={settings.weekday_min_count}
                    onChange={(e) => handleChange('weekday_min_count', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  회 이상 지출 시 알림
                </span>
              </div>

              <div className="setting-item-inline-cpsettings">
                <strong>급여일 후 지출 : </strong>
                <span className="setting-description-cpsettings">
                  급여일 후 7일 이내 지출이{' '}
                  <input
                    type="number"
                    min="0"
                    value={settings.payday_spike_threshold}
                    onChange={(e) => handleChange('payday_spike_threshold', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 이상 증가하면 알림
                </span>
              </div>

              <div className="setting-item-inline-cpsettings">
                <strong>월초/월말 차이 : </strong>
                <span className="setting-description-cpsettings">
                  월초/월말 지출이{' '}
                  <input
                    type="number"
                    min="0"
                    value={settings.month_period_threshold}
                    onChange={(e) => handleChange('month_period_threshold', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 이상 차이나면 알림
                </span>
              </div>
            </div>

            {/* 지출 행동 */}
            <div className="settings-group-cpsettings">
              <h4>지출 행동</h4>

              <div className="setting-item-inline-cpsettings">

                <strong>소액 다빈도 : </strong>
                <span className="setting-description-cpsettings">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={settings.impulse_amount_limit}
                    onChange={(e) => handleChange('impulse_amount_limit', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  원 이하 지출이{' '}
                  <input
                    type="number"
                    min="0"
                    value={settings.impulse_increase_threshold}
                    onChange={(e) => handleChange('impulse_increase_threshold', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 증가하면 알림
                </span>

              </div>

              <div className="setting-item-inline-cpsettings">
                <strong>카테고리 급증 : </strong>
                <span className="setting-description-cpsettings">
                  지난달 대비 지출이{' '}
                  <input
                    type="number"
                    min="0"
                    value={settings.category_spike_threshold}
                    onChange={(e) => handleChange('category_spike_threshold', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 이상 급증하면 알림
                </span>
              </div>
            </div>

            {/* 예산 및 목표 */}
            <div className="settings-group-cpsettings">
              <h4>예산 및 목표</h4>

              <div className="setting-item-inline-cpsettings">
                <strong>예산 근접 : </strong>
                <span className="setting-description-cpsettings">
                  이번달 예산 진행률보다 소진률이{' '}
                  <input
                    type="number"
                    min="0"
                    value={settings.budget_alert_margin}
                    onChange={(e) => handleChange('budget_alert_margin', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 빠르면 알림 <span className="hint-text-cpsettings">(현재 달만 분석)</span>
                </span>
              </div>

              <div className="setting-item-inline-cpsettings">
                <strong>무지출 연속 : </strong>
                <span className="setting-description-cpsettings">
                  <input
                    type="number"
                    min="1"
                    value={settings.no_spend_min_days}
                    onChange={(e) => handleChange('no_spend_min_days', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  일 이상 지출이 없으면 알림
                </span>
              </div>

              <div className="setting-item-inline-cpsettings">
                <strong>고정비 비율 : </strong>
                <span className="setting-description-cpsettings">
                  고정비 비중이{' '}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.fixed_ratio_warning}
                    onChange={(e) => handleChange('fixed_ratio_warning', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 이상이면 경고
                </span>
              </div>
            </div>

            {/* 비교 분석 */}
            <div className="settings-group-cpsettings">
              <h4>비교 분석</h4>

              <div className="setting-item-inline-cpsettings">
                <strong>전년 대비 : </strong>
                <span className="setting-description-cpsettings">
                  작년 동월 대비{' '}
                  <input
                    type="number"
                    min="0"
                    value={settings.year_comparison_threshold}
                    onChange={(e) => handleChange('year_comparison_threshold', parseInt(e.target.value))}
                    className="inline-input-cpsettings"
                  />
                  % 이상 차이나면 알림
                </span>
              </div>
            </div>
          </div>

          <div className="popup-footer-cpsettings">
            <button className="reset-button-cpsettings" onClick={handleReset}>
              기본값 복원
            </button>
            <div className="action-buttons-cpsettings">
              <button className="cancel-button-cpsettings" onClick={onClose}>
                취소
              </button>
              <button className="save-button-cpsettings" onClick={handleSave}>
                저장
              </button>
            </div>
          </div>
        </div>
      </div >
      <ConfirmPopup
        isOpen={confirmPopup.isOpen}
        title={confirmPopup.title}
        message={confirmPopup.message}
        onConfirm={confirmPopup.onConfirm}
        onCancel={confirmPopup.onCancel}
        type={confirmPopup.type}
      />
    </>
  );
};

export default ConsumptionPatternSettingsPopup;