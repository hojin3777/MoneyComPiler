import React, { useState, useEffect } from 'react';
import './ConsumptionPattern.css';
import ConsumptionPatternSettingsPopup from './ConsumptionPatternSettingsPopup';
import { IoSettingsSharp } from "react-icons/io5";

const API_BASE_URL = 'http://127.0.0.1:5050';

// ****** 타입 정의 ******
interface HeatmapCell {
  weekday: string;
  major_category_id: number;
  major_category_name: string;
  total_amount: number;
  transaction_count: number;
  transactions: TransactionDetail[];  // 거래내역 추가
}

interface Insight {
  type: string;
  icon: string;
  message: string;
}

interface ConsumptionPatternProps {
  selectedYear: number | null;
  selectedMonth: number | null;
}

interface TransactionDetail {
  date: string;
  merchant: string;
  amount: number;
}

interface TooltipState {
  isOpen: boolean;
  position: { top: number; left: number };
  weekday: string;
  categoryName: string;
  totalAmount: number;
  transactions: TransactionDetail[];
}

// ****** 메인 컴포넌트 ******
const ConsumptionPattern: React.FC<ConsumptionPatternProps> = ({ selectedYear, selectedMonth }) => {
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({
    isOpen: false,
    position: { top: 0, left: 0 },
    weekday: '',
    categoryName: '',
    totalAmount: 0,
    transactions: []
  });
  const [highlightedCells, setHighlightedCells] = useState<{
    weekdays: string[] | null;
    category: string | null;
  } | null>(null);

  // fetchData: 히트맵 + 인사이트 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedYear || !selectedMonth) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/dashboard/consumption-pattern?year=${selectedYear}&month=${selectedMonth}`
        );
        const data = await response.json();

        setHeatmapData(data.heatmap_data || []);
        setInsights(data.insights || []);
      } catch (error) {
        console.error('Failed to fetch consumption pattern data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedYear, selectedMonth]);

  // ****** 인사이트 아이콘 매핑 ******
  const getInsightIcon = (type: string): string => {
    const iconMap: { [key: string]: string } = {
      'weekend_spending': '🏖️',
      'recurring_pattern': '📈',
      'payday_spike': '💸',
      'month_period': '📅',
      'impulse_spending': '🛒',
      'category_spike': '💣',
      'budget_alert': '⚠️',
      'no_spend_streak': '🎉',
      'year_comparison': '📊',
      'fixed_ratio_warning': '🔧'
    };
    return iconMap[type] || '💡';
  };

  // ← 추가: 인사이트 메시지에서 강조 정보 파싱
  const parseInsightForHighlight = (message: string, type: string): {
    weekdays: string[] | null;
    category: string | null;
  } | null => {
    try {
      // 1. 주말 패턴: "주말 식비가 평일보다 2.0배 높아요"
      if (type === 'weekend_spending') {
        const match = message.match(/주말 '(\S+)'(?:이\(가\)|가)/);
        if (match) {
          return { weekdays: ['일', '토'], category: match[1] };
        }
      }

      // 2. 요일별 반복 패턴: "매주 금요일 식비 지출이 집중돼요"
      if (type === 'recurring_pattern') {
        const weekdayMatch = message.match(/(일|월|화|수|목|금|토)요일/);
        const categoryMatch = message.match(/요일 (\S+) 지출/);
        if (weekdayMatch && categoryMatch) {
          return { weekdays: [weekdayMatch[1]], category: categoryMatch[1] };
        }
      }

      // 3. 급여일 패턴: "급여일(가) 평일보다 지출이 ~" (특정 셀 없음, 전체 강조)
      if (type === 'payday_spike') {
        return null; // 강조 안 함
      }

      // 4. 월별 기간 패턴: "이번 달 소액 지출이 3회로 평소보다 106% 증가했어요"
      if (type === 'impulse_spending') {
        return null; // 강조 안 함
      }

      // 5. 카테고리 급증: "식비가 지난달보다 203% 증가했어요"
      if (type === 'category_spike') {
        const match = message.match(/'(\S+)'(?:이\(가\)|가) 지난달보다/);
        if (match) {
          return { weekdays: null, category: match[1] }; // 전체 카테고리 행 강조
        }
      }

      // 6. 예산 경고: "직업 05월보다 지출이 30% 감소했어요" (특정 셀 없음)
      if (type === 'budget_alert') {
        return null;
      }

      // 7. 무지출 달성: "3일 연속 무지출 달성!" (특정 셀 없음)
      if (type === 'no_spend_streak') {
        return null;
      }

      // 8. 전년 대비: 특정 셀 없음
      if (type === 'year_comparison') {
        return null;
      }

      // 9. 고정비 비율: 특정 셀 없음
      if (type === 'fixed_ratio_warning') {
        return null;
      }

      // 10. 월초/월말 패턴: "주말 생활비(가) 평일보다 2.0배 높아요" (이미 weekend_spending과 동일)
      if (type === 'month_period') {
        return null;
      }

    } catch (error) {
      console.error('Failed to parse insight for highlight:', error);
    }

    return null;
  };

  // ← 추가: 인사이트 hover 핸들러
  const handleInsightHover = (insight: Insight) => {
    const highlight = parseInsightForHighlight(insight.message, insight.type);
    setHighlightedCells(highlight);
  };

  const handleInsightLeave = () => {
    setHighlightedCells(null);
  };

  // ← 추가: 셀 강조 여부 확인
  const isCellHighlighted = (weekday: string, category: string): boolean => {
    if (!highlightedCells) return false;

    const weekdayMatch = !highlightedCells.weekdays || highlightedCells.weekdays.includes(weekday);
    const categoryMatch = !highlightedCells.category || highlightedCells.category === category;

    return weekdayMatch && categoryMatch;
  };



  // getHeatmapColor: 금액에 따른 히트맵 색상 계산
  const getHeatmapColor = (amount: number, maxAmount: number): string => {
    if (maxAmount === 0 || amount === 0) return 'var(--color-highlight-1-transparent7)';
    const percentage = (amount / maxAmount) * 100;
    // 단색 반환 (히트맵은 그라데이션보다 단색이 가독성 좋음)
    if (percentage >= 80) return 'var(--color-highlight-2)';
    if (percentage >= 60) return 'var(--color-highlight-6)';
    if (percentage >= 40) return 'var(--color-highlight-3)';
    if (percentage >= 20) return 'var(--color-highlight-4)';
    return 'var(--color-highlight-5)';
  };

  // formatAmount: 금액 포맷팅 (만원 단위, 소수점 1자리)
  const formatAmount = (amount: number): string => {
    if (amount === 0) return '-';
    const manwon = amount / 10000;
    return manwon >= 10 ? Math.round(manwon).toString() : manwon.toFixed(1);
  }

  // ******************** 툴팁 핸들러 ********************
  // ****** hover 툴팁 핸들러 ******
  const showTooltip = (e: React.MouseEvent, weekday: string, categoryName: string) => {
    const cellData = heatmapData.find(
      d => d.weekday === weekday && d.major_category_name === categoryName
    );

    if (!cellData || cellData.total_amount === 0) return;

    // 백엔드에서 이미 거래내역을 포함하여 전달받았으므로 별도 API 호출 불필요
    const transactions = [...(cellData.transactions || [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const popupHeight = 180;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + window.scrollY + 5;

    if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
      top = rect.top + window.scrollY + 5 - popupHeight / 2;
    }

    setTooltip({
      isOpen: true,
      position: {
        top: top,
        left: rect.left + window.scrollX
      },
      weekday,
      categoryName,
      totalAmount: cellData.total_amount,
      transactions
    });
  };

  const hideTooltip = () => {
    setTooltip({
      isOpen: false,
      position: { top: 0, left: 0 },
      weekday: '',
      categoryName: '',
      totalAmount: 0,
      transactions: []
    });
  };

  // ****** 외부 클릭 및 스크롤 감지 (FixedExpenseManagement 방식) ******
  useEffect(() => {
    if (!tooltip.isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const popupElement = document.querySelector('.heatmap-tooltip-cpattern');
      if (popupElement && !popupElement.contains(e.target as Node)) {
        hideTooltip();
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      const popupBody = document.querySelector('.tooltip-body-cpattern');

      // 팝업 내부 스크롤은 무시
      if (popupBody && target && (target === popupBody || popupBody.contains(target))) {
        return;
      }

      hideTooltip();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [tooltip.isOpen]);


  // 히트맵 데이터 구조화 (요일별 × 카테고리별 매트릭스)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const categoryTotals = new Map<string, number>();
  heatmapData.forEach(d => {
    const current = categoryTotals.get(d.major_category_name) || 0;
    categoryTotals.set(d.major_category_name, current + d.total_amount);
  });

  const categories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])  // 금액 내림차순
    .map(([name]) => name);

  const maxAmount = Math.max(...heatmapData.map(d => d.total_amount), 0);

  const getAmountForCell = (weekday: string, category: string): number => {
    const cell = heatmapData.find(
      d => d.weekday === weekday && d.major_category_name === category
    );
    return cell?.total_amount || 0;
  };

  // 요일별 합계 계산
  const getWeekdayTotal = (weekday: string): number => {
    return heatmapData
      .filter(d => d.weekday === weekday)
      .reduce((sum, d) => sum + d.total_amount, 0);
  };

  const handleSetings = () => {
    setShowSettingsPopup(true);
  };

  const handleSettingsSave = () => {
    // 데이터 새로고침
    const fetchData = async () => {
      if (!selectedYear || !selectedMonth) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/dashboard/consumption-pattern?year=${selectedYear}&month=${selectedMonth}`
        );
        const data = await response.json();
        setHeatmapData(data.heatmap_data || []);
        setInsights(data.insights || []);
      } catch (error) {
        console.error('Failed to fetch consumption pattern data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  };





  if (isLoading) {
    return (
      <div className="dashboard-card-cpattern">
        <div className="dashboard-card-header">
          <h3 className="dashboard-card-title">
            소비 패턴 인사이트
          </h3>
          <span className="dashboard-card-subtitle">
            {selectedYear}년 {selectedMonth}월 기준
          </span>
        </div>
        <div className="dashboard-card-content-pattern loading-pattern">
          데이터 로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-card-cpattern">
      <div className="dashboard-card-header">
        <h3 className="dashboard-card-title">
          소비 패턴 인사이트
          {/* <IoSettingsSharp className="header-icon-button-pattern" onClick={handleSetings} /> */}
          <button className="header-icon-button-cpattern" onClick={handleSetings} title='알림 설정'><IoSettingsSharp size={16} /></button>
          <span className='dashboard-card-title subtle'>(단위: 만, 합계)</span>
        </h3>
        <div className="heatmap-legend-cpattern">
          <span className="legend-item-cpattern">
            낮음
            <span className="legend-color-cpattern" style={{ backgroundColor: 'var(--color-highlight-1)' }}></span>
            <span className="legend-color-cpattern" style={{ backgroundColor: 'var(--color-highlight-5)' }}></span>
            <span className="legend-color-cpattern" style={{ backgroundColor: 'var(--color-highlight-4)' }}></span>
            <span className="legend-color-cpattern" style={{ backgroundColor: 'var(--color-highlight-3)' }}></span>
            <span className="legend-color-cpattern" style={{ backgroundColor: 'var(--color-highlight-6)' }}></span>
            <span className="legend-color-cpattern" style={{ backgroundColor: 'var(--color-highlight-2)' }}></span>
            높음
          </span>
        </div>
        <span className="dashboard-card-subtitle">
          {selectedYear}년 {selectedMonth}월 기준
        </span>
      </div>

      <div className="dashboard-card-content-cpattern">
        {/* 좌우 레이아웃 */}
        <div className="pattern-layout-cpattern">
          {/* 좌측: 히트맵 영역 */}
          <div className="heatmap-section-cpattern">
            <div className="heatmap-table-wrapper-cpattern">
              <table className="heatmap-table-cpattern">
                <thead>
                  <tr>
                    <th className="category-header-cpattern">카테고리</th>
                    {weekdays.map(day => (
                      <th
                        key={day}
                        className={`weekday-header-cpattern ${day === '일' ? 'sunday' : day === '토' ? 'saturday' : ''}`}
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map(category => (
                    <tr key={category}>
                      <td className="category-label-cpattern">{category}</td>
                      {weekdays.map(day => {
                        const amount = getAmountForCell(day, category);
                        const isHighlighted = isCellHighlighted(day, category);
                        return (
                          <td
                            key={`${category}-${day}`}
                            className={`heatmap-cell-cpattern ${amount === 0 ? 'empty-cell-cpattern' : ''
                              } ${isHighlighted ? 'heatmap-cell-highlighted-cpattern' : ''}`}
                            style={{
                              backgroundColor: getHeatmapColor(amount, maxAmount)
                            }}
                            onClick={(e) => amount > 0 && showTooltip(e, day, category)}
                            title={amount > 0 ? `${amount.toLocaleString()}원` : '지출 없음'}
                          >
                            {formatAmount(amount)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="total-row-cpattern">
                    <td className="total-label-cpattern">합계</td>
                    {weekdays.map(day => {
                      const total = getWeekdayTotal(day);
                      return (
                        <td key={`total-${day}`} className="total-cell-cpattern">
                          {formatAmount(total)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 우측: 인사이트 영역 */}
          <div className="insights-section-cpattern">
            {insights.length > 0 ? (
              insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="insight-item-cpattern"
                  onMouseEnter={() => handleInsightHover(insight)}
                  onMouseLeave={handleInsightLeave}
                >
                  <span className="insight-icon-cpattern">{getInsightIcon(insight.type)}</span>
                  <span className="insight-message-cpattern">{insight.message}</span>
                </div>
              ))
            ) : (
              <div className="no-insights-cpattern">
                충분한 데이터가 쌓이면 소비 패턴을 분석해드립니다.
              </div>
            )}
          </div>
        </div>
      </div>
      {tooltip.isOpen && (
        <div
          className="heatmap-tooltip-cpattern"
          style={{
            top: `${tooltip.position.top}px`,
            left: `${tooltip.position.left}px`
          }}
        >
          <div className="tooltip-header-cpattern">
            <div className="tooltip-title-cpattern">
              <span>{tooltip.categoryName} · {tooltip.weekday}요일</span>
              <span>{tooltip.totalAmount.toLocaleString()}원</span>
            </div>
            <button className="tooltip-close-button-cpattern" onClick={hideTooltip}>×</button>
          </div>
          <div className="tooltip-divider-cpattern"></div>
          <div className="tooltip-body-cpattern">
            {tooltip.transactions.map((tx, idx) => (
              <div key={idx} className="tooltip-item-cpattern">
                <span className="tooltip-date-cpattern">{tx.date}</span>
                <span className="tooltip-merchant-cpattern">{tx.merchant}</span>
                <span className="tooltip-amount-cpattern">{tx.amount.toLocaleString()}원</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showSettingsPopup && (
        <ConsumptionPatternSettingsPopup
          onClose={() => setShowSettingsPopup(false)}
          onSave={handleSettingsSave}
        />
      )}
    </div>
  );
};

export default ConsumptionPattern;