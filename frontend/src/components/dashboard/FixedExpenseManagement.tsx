import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FaCircle, FaCaretUp, FaCaretDown, FaMinus } from 'react-icons/fa';
import './FixedExpenseManagement.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

// ******************** 타입 정의 ********************
interface FixedExpenseItem {
    merchant: string;
    category: string;
    major_category: string;
    minor_category: string;
    day_range: string;
    amount_range: string;
    amount_min: number;
    amount_max: number;
    trend: 'up' | 'down' | 'same' | 'none';
    recent_months: [boolean, boolean, boolean];
    transaction_details: { date: string; amount: number }[];
    total_count: number;
    avg_count_per_month: number;
}

interface FixedExpenseManagementProps {
    months: string[];
    range: [number, number];
    // onPopupStateChange?: (isOpen: boolean) => void;
    // isPopupOpen?: boolean;
}

interface TooltipState {
    isOpen: boolean;
    position: { top: number; left: number };
    content: React.ReactNode;
}

// ******************** 메인 컴포넌트 ********************
const FixedExpenseManagement: React.FC<FixedExpenseManagementProps> = ({ months, range }) => {
    const [expenses, setExpenses] = useState<FixedExpenseItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [tooltip, setTooltip] = useState<TooltipState>({ isOpen: false, position: { top: 0, left: 0 }, content: null });
    const tooltipRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [detailPopup, setDetailPopup] = useState<{
        isOpen: boolean;
        item: FixedExpenseItem | null
        position: { top: number; left: number };
    }>({ isOpen: false, item: null, position: { top: 0, left: 0 } });

    // ****** 데이터 로딩 ******
    const fetchData = useCallback(async () => {
        if (months.length === 0 || range[0] < 0 || range[1] < 0) return;
        const startMonth = months[range[0]];
        const endMonth = months[range[1]];
        setIsLoading(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/statistics/fixed_expenses?start_month=${startMonth}&end_month=${endMonth}`
            );
            const data = await response.json();
            setExpenses(data);
        } catch (error) {
            console.error('고정비 데이터 로딩 실패:', error);
        } finally {
            setIsLoading(false);
        }
    }, [months, range]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ****** 툴팁 핸들러 ******
    // 거래처명/카테고리 툴팁
    const showDetailPopup = (e: React.MouseEvent, item: FixedExpenseItem) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const popupHeight = 240; // 최대 높이

        // 아래쪽 공간이 부족하면 위쪽에 표시
        const spaceBelow = viewportHeight - rect.bottom - 30;
        const spaceAbove = rect.top;

        let top = rect.bottom + window.scrollY + 5;

        if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
            // 위쪽에 표시
            top = rect.top + window.scrollY - popupHeight - 5;
        }

        setDetailPopup({
            isOpen: true,
            item,
            position: {
                top: top,
                left: rect.left + window.scrollX
            }
        });
    };

    const hideDetailPopup = () => {
        setDetailPopup({ isOpen: false, item: null, position: { top: 0, left: 0 } });
    };

    // ****** 외부 클릭 및 스크롤 감지 수정 (MonthlyDetail 방식) ******
    useEffect(() => {
        if (!detailPopup.isOpen) return;

        const handleOutsideClick = (e: MouseEvent) => {
            const popupElement = document.querySelector('.detail-popup-tooltip-fexpense');
            if (popupElement && !popupElement.contains(e.target as Node)) {
                hideDetailPopup();
            }
        };

        const handleScroll = (e: Event) => {
            const target = e.target as Node | null;
            // const popupElement = document.querySelector('.detail-popup-tooltip-fexpense');
            const popupBody = document.querySelector('.detail-popup-body-fexpense');

            // 팝업 내부 스크롤은 무시
            if (popupBody && target && (target === popupBody || popupBody.contains(target))) {
                return;
            }

            // 팝업 외부 스크롤이면 닫기
            hideDetailPopup();
        };

        document.addEventListener('mousedown', handleOutsideClick);
        window.addEventListener('scroll', handleScroll, true);  // capture 단계에서 모든 스크롤 감지

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [detailPopup.isOpen]);

    // 증감 아이콘 툴팁
    const showTrendTooltip = (e: React.MouseEvent, trend: string) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        let message = '';
        if (trend === 'up') message = '전월 대비 증가';
        else if (trend === 'down') message = '전월 대비 감소';
        else if (trend === 'same') message = '전월과 동일';

        const content = <div className="fixed-expense-small-tooltip-fexpense">{message}</div>;

        setTooltip({
            isOpen: true,
            position: { top: rect.bottom - rect.height - 20, left: rect.left + (rect.width / 2) - 40 },
            content
        });
    };

    // 월별 지출 현황 툴팽
    const showMonthStatusTooltip = (e: React.MouseEvent, monthIndex: number, hasTransaction: boolean) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const last3Months = months.slice(Math.max(0, range[1] - 2), range[1] + 1);
        const targetMonth = last3Months[monthIndex];

        let message = '';
        if (!targetMonth) {
            message = '데이터 부족';
        } else if (hasTransaction) {
            const [year, month] = targetMonth.split('-');
            message = `${year}년 ${parseInt(month, 10)}월 결제완료`;
        } else if (hasTransaction === null){
            const [year, month] = targetMonth.split('-');
            message = `${year}년 ${parseInt(month, 10)}월 데이터 부족`;
        } else {
            const [year, month] = targetMonth.split('-');
            message = `${year}년 ${parseInt(month, 10)}월 미결제`;
        }

        const content = <div className="fixed-expense-small-tooltip-fexpense">{message}</div>;

        setTooltip({
            isOpen: true,
            position: { top: rect.bottom - rect.height - 25, left: rect.left + (rect.width / 2) - 60 },
            content
        });
    };

    const hideTooltip = () => {
        setTooltip({ isOpen: false, position: { top: 0, left: 0 }, content: null });
    };

    // ****** 총 고정비 계산 ******
    const selectBasisMonth = (): number | null => {
        if (expenses.length === 0) return null;

        // 각 월의 초록불 개수 계산
        const greenCounts = [0, 1, 2].map(monthIdx => expenses.filter(item => item.recent_months[monthIdx] === true).length);

        // 과거부터 비교: greenCounts[0] <= greenCounts[1] <= greenCounts[2] 이면 최근 월 선택
        let basisMonthIdx = 0; // 기본값: 전전월 (최근 3개월 중 가장 오래된 달)

        // 전전월 vs 전월 비교 : 전월이 전전월보다 같거나 크면 전월 선택
        if (greenCounts[1] >= greenCounts[0]) basisMonthIdx = 1;
        // 전월 vs 마지막 달 비교 : 마지막 달이 현재 선택된 월보다 같거나 크면 마지막 달 선택
        if (greenCounts[2] >= greenCounts[basisMonthIdx]) basisMonthIdx = 2;
        // 선택된 월의 초록불이 0개면 null 반환 (모두 노란불)
        if (greenCounts[basisMonthIdx] === 0) return null;

        return basisMonthIdx;
    };

    // ****** 총 고정비 계산 (단순화) ******
    const basisMonthIdx = selectBasisMonth();
    const totalFixedExpense = basisMonthIdx !== null ? expenses.reduce((sum, item) => {
        const details = item.transaction_details;
        const targetMonth = months[range[1] - (2 - basisMonthIdx)]; // 0 -> range[1]-2, 1 -> range[1]-1, 2 -> range[1]

        if (!targetMonth) return sum;

        const targetAmount = details
            .filter(tx => tx.date.substring(0, 7) === targetMonth)
            .reduce((acc, tx) => acc + tx.amount, 0);

        return sum + targetAmount;
    }, 0) : null;

    // ****** 기준 월 표시 (단순화) ******
    const getBasisMonth = () => {
        if (basisMonthIdx === null) return '';

        const targetMonth = months[range[1] - (2 - basisMonthIdx)];
        if (!targetMonth) return '';

        const [year, month] = targetMonth.split('-');
        return `${year}년 ${parseInt(month, 10)}월 기준`;
    };

    const showBasisTooltip = (e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const content = <div className="fixed-expense-small-tooltip-fexpense">최근 3개월 중 가장 지출내역(초록불)이<br />많은 달을 기준으로 합산</div>;

        setTooltip({
            isOpen: true,
            position: { top: rect.bottom - rect.height - 35, left: rect.left - 75 },  // 왼쪽으로 이동하여 잘리지 않도록
            content
        });
    };


    // ****** 렌더링 ******
    if (isLoading) {
        return (
            <div className="dashboard-card">
                <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">고정비 관리
                        <span className="dashboard-card-title subtle">('고정지출' 유형이 2개월 이상 지속)</span>
                    </h3>
                    <div className="dashboard-card-subtitle">
                        {months.length > 0 && range[0] >= 0 && range[1] >= 0
                            ? `${months[range[0]].replace('-', '년 ')}월 ~ ${months[range[1]].replace('-', '년 ')}월`  // 형식 통일
                            : '기간을 선택하세요'}
                    </div>
                </div>
                <div className="dashboard-card-content fixed-expense-card-content-fexpense">
                    <div className="loading-message-fexpense">데이터 로딩 중...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-card" ref={rootRef}>
            <div className="dashboard-card-header">
                <h3 className="dashboard-card-title">고정비 관리
                    <span className="dashboard-card-title subtle"> ('고정지출' 유형이 2개월 이상 지속)</span>
                </h3>
                <div className="dashboard-card-subtitle">
                    {months.length > 0 && range[0] >= 0 && range[1] >= 0
                        ? `${months[range[0]].replace('-', '년 ')}월 ~ ${months[range[1]].replace('-', '년 ')}월`  // 형식 통일
                        : '기간을 선택하세요'}
                </div>
            </div>
            <div className="dashboard-card-content fixed-expense-card-content-fexpense">
                <div className="fixed-expense-table-container-fexpense">
                    <table className="fixed-expense-table-fexpense">
                        <thead>
                            <tr>
                                <th className="col-merchant-fexpense">거래처명</th>
                                <th className="col-category-fexpense">카테고리</th>
                                <th className="col-day-fexpense">평균 출금일</th>
                                <th className="col-amount-fexpense">&nbsp;&nbsp;&nbsp;&nbsp;평균 지출액</th>
                                <th className="col-trend-fexpense"></th>
                                <th className="col-recent-fexpense">월별 지출 현황</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map((item, index) => (
                                <tr key={index}>
                                    {/* 거래처명 */}
                                    <td
                                        className="merchant-cell-fexpense clickable-cell-fexpense"
                                        onClick={(e) => showDetailPopup(e, item)}
                                    >
                                        {item.merchant}
                                    </td>

                                    {/* 카테고리 */}
                                    <td
                                        className="category-cell-fexpense clickable-cell-fexpense"
                                        onClick={(e) => showDetailPopup(e, item)}
                                    >
                                        {item.category}
                                    </td>

                                    {/* 평균 출금일 */}
                                    <td className="day-cell-fexpense">{item.day_range}</td>
                                    {/* 평균 지출액 */}
                                    <td className="amount-cell-fexpense">{item.amount_range}</td>
                                    {/* 증감 */}
                                    <td className="trend-cell-fexpense">
                                        {item.trend === 'up' && (
                                            <FaCaretUp
                                                className="trend-icon-up-fexpense"
                                                onMouseEnter={(e) => showTrendTooltip(e, 'up')}
                                                onMouseLeave={hideTooltip}
                                            />
                                        )}
                                        {item.trend === 'down' && (
                                            <FaCaretDown
                                                className="trend-icon-down-fexpense"
                                                onMouseEnter={(e) => showTrendTooltip(e, 'down')}
                                                onMouseLeave={hideTooltip}
                                            />
                                        )}
                                        {item.trend === 'same' && (
                                            <FaMinus
                                                className="trend-icon-same-fexpense"
                                                onMouseEnter={(e) => showTrendTooltip(e, 'same')}
                                                onMouseLeave={hideTooltip}
                                            />
                                        )}
                                    </td>

                                    {/* 월별 지출 현황 */}
                                    <td className="recent-cell-fexpense">
                                        <div className="recent-months-fexpense">
                                            {item.recent_months.map((hasTransaction, monthIdx) => (
                                                <FaCircle
                                                    key={monthIdx}
                                                    className={`month-indicator-fexpense ${hasTransaction === null
                                                        ? 'indicator-insufficient-fexpense'
                                                        : hasTransaction
                                                            ? 'indicator-complete-fexpense'
                                                            : 'indicator-incomplete-fexpense'
                                                        }`}
                                                    onMouseEnter={(e) => showMonthStatusTooltip(e, monthIdx, hasTransaction)}
                                                    onMouseLeave={hideTooltip}
                                                />
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {expenses.length > 0 && (
                                <tr className="total-row-fexpense">
                                    <td></td>
                                    <td></td>
                                    <td className="total-label-fexpense">총 고정비</td>
                                    <td className="total-amount-fexpense">{totalFixedExpense !== null ? `${totalFixedExpense.toLocaleString()}원` : '-'}</td>
                                    <td></td>
                                    <td
                                        className='total-basis-fexpense'
                                        onMouseEnter={showBasisTooltip}
                                        onMouseLeave={hideTooltip}
                                    >
                                        {getBasisMonth()}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 툴팁 */}
            {tooltip.isOpen && (
                <div
                    ref={tooltipRef}
                    className="fixed-expense-tooltip-fexpense"
                    style={{ top: tooltip.position.top, left: tooltip.position.left, pointerEvents: 'none' }}
                >
                    {tooltip.content}
                </div>
            )}
            {/* 상세 팝업 (거래처명/카테고리 클릭 시) */}
            {detailPopup.isOpen && detailPopup.item && (
                <>
                    {/* 툴팁 스타일 팝업 */}
                    <div
                        className="detail-popup-tooltip-fexpense"
                        style={{
                            top: `${detailPopup.position.top}px`,
                            left: `${detailPopup.position.left}px`
                        }}
                    >
                        <div className="detail-popup-header-fexpense">
                            <div className="detail-popup-title-fexpense">
                                <span>{detailPopup.item.merchant}</span>
                                <span>{detailPopup.item.total_count}회 (월 {detailPopup.item.avg_count_per_month}회)</span>
                            </div>
                            <button className="detail-popup-close-fexpense" onClick={hideDetailPopup}>✕</button>
                        </div>
                        <div className="detail-popup-period-fexpense">
                            {months[range[0]].replace('-', '년 ')}월 ~ {months[range[1]].replace('-', '년 ')}월
                        </div>
                        <div className="detail-popup-divider-fexpense"></div>
                        <div className="detail-popup-body-fexpense">
                            {detailPopup.item.transaction_details.map((tx, idx) => (
                                <div key={idx} className="detail-popup-item-fexpense">
                                    <span>{tx.date}</span>
                                    <span>{tx.amount.toLocaleString()}원</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FixedExpenseManagement;