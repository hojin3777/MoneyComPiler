import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Transaction } from './Transactions';
import FloatingSelectPopup, { type FloatingSelectHandle, type Opt } from '../components/FloatingSelectPopup';
import DateDetailPopup from '../components/monthly/DateDetailPopup';
import './Monthly.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

const Monthly = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState('Loading...');
  const floatingSelectRef = useRef<FloatingSelectHandle>(null);
  const [popupData, setPopupData] = useState<{
    date: Date;
    transactions: Transaction[];
    totalExpense: number;
    expenseCount: number;
  } | null>(null);

  // 데이터 로딩
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setStatus('Loading...');
        const response = await fetch(`${API_BASE_URL}/api/transactions`);
        if (!response.ok) throw new Error('Failed to fetch transactions');
        const data: Transaction[] = await response.json();
        setTransactions(data);
        setStatus('');
      } catch (error) {
        console.error(error);
        setStatus('Failed to load data');
      }
    };
    fetchTransactions();
  }, []);

  // 년/월 선택 핸들러
  const handleSelectDatePart = (e: React.MouseEvent, part: 'year' | 'month') => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    let options: Opt[] = [];
    let currentValue: string;

    if (part === 'year') {
      const years = [...new Set(transactions.map(t => new Date(t.transaction_date).getFullYear()))].sort((a, b) => a - b);
      options = years.map(y => ({ value: String(y), label: `${y}` }));
      currentValue = String(selectedDate.getFullYear());
    } else {
      const months = [...new Set(transactions
        .filter(t => new Date(t.transaction_date).getFullYear() === selectedDate.getFullYear())
        .map(t => new Date(t.transaction_date).getMonth() + 1)
      )].sort((a, b) => a - b);
      options = months.map(m => ({ value: String(m), label: `${m}` }));
      currentValue = String(selectedDate.getMonth() + 1);
    }

    const onSelect = (value: string) => {
      const newDate = new Date(selectedDate);
      const numValue = Number(value);
      if (part === 'year') {
        newDate.setFullYear(numValue);
        // 연도 변경 시, 해당 연도에 데이터가 있는 첫번째 월로 설정
        const firstMonthWithData = Math.min(...[...new Set(transactions
          .filter(t => new Date(t.transaction_date).getFullYear() === numValue)
          .map(t => new Date(t.transaction_date).getMonth() + 1)
        )]);
        if (isFinite(firstMonthWithData)) {
            newDate.setMonth(firstMonthWithData - 1);
        }
      } else {
        newDate.setMonth(numValue - 1);
      }
      setSelectedDate(newDate);
    };

    floatingSelectRef.current?.open(options, currentValue, { top: rect.bottom, left: rect.left, width: rect.width }, onSelect);
  };

  // 달력 데이터 계산
  const calendarData = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0:일, 1:월, ...
    const daysInMonth = lastDayOfMonth.getDate();
    const prevLastDay = new Date(year, month, 0).getDate();

    const days = [];
    // 이전 달 날짜 채우기
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ day: prevLastDay - i, isCurrentMonth: false });
    }
    // 현재 달 날짜 채우기
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true });
    }
    // 다음 달 날짜 채우기
    const remainingCells = 7 - (days.length % 7);
    if (remainingCells < 7) {
      for (let i = 1; i <= remainingCells; i++) {
        days.push({ day: i, isCurrentMonth: false });
      }
    }

    const transactionsByDay = transactions
      .filter(t => {
        const tDate = new Date(t.transaction_date);
        return t.type !== '이체' && tDate.getFullYear() === year && tDate.getMonth() === month;
      })
      .reduce((acc, t) => {
        const day = new Date(t.transaction_date).getDate();
        if (!acc[day]) {
          acc[day] = { items: [], totalExpense: 0, expenseCount: 0 };
        }
        acc[day].items.push(t);
        if (t.amount && ['고정지출', '반고정지출', '유동지출'].includes(t.type)) {
          acc[day].totalExpense += t.amount;
          acc[day].expenseCount += 1;
        }
        return acc;
      }, {} as Record<number, { items: Transaction[], totalExpense: number, expenseCount: number }>);

    return { daysInGrid: days, transactionsByDay };
  }, [selectedDate, transactions]);

  // 날짜 클릭 핸들러
  const handleDayClick = (day : number, dayData: any) => {
    if (!dayData || dayData.items.length === 0) return;
    const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    setPopupData({
      date,
      transactions: dayData.items,
      totalExpense: dayData.totalExpense,
      expenseCount: dayData.expenseCount,
    });
  };


  // 페이지 렌더
  const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date();

  return (
    <div className="monthly-page">
      <header className="main-header">
        <div className="header-title-group">
          <h1>Monthly</h1>
          <div className="month-selector">
            <div className="date-part year" onClick={(e) => handleSelectDatePart(e, 'year')}>
              {selectedDate.getFullYear()}
            </div>
            <span className="separator">년</span>
            <div className="date-part month" onClick={(e) => handleSelectDatePart(e, 'month')}>
              {selectedDate.getMonth() + 1}
            </div>
            <span className="separator">월</span>
            <div className="header-actions">
              <span className="status-text">{status}</span>
            </div>
          </div>
        </div>
        
      </header>
      <div className="content-area">
        <div className="calendar-wrapper">
          <div className="calendar-header-grid">
            {daysOfWeek.map(day => <div key={day} className="calendar-header">{day}</div>)}
          </div>
          <div className="calendar-body-scroll-container">
            <div className="calendar-body-grid">
              {calendarData.daysInGrid.map((dayInfo, index) => {
                const day = dayInfo.day;
                const isCurrentMonth = dayInfo.isCurrentMonth;
                const dayData = isCurrentMonth ? calendarData.transactionsByDay[day] : undefined;
                const totalExpense = dayData?.totalExpense ?? 0;
                const expenseCount = dayData?.expenseCount ?? 0;
                const isToday = isCurrentMonth && day === today.getDate() && selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear();
                return (
                  <div key={index} className={`calendar-cell ${isCurrentMonth ? '' : 'not-current-month'} ${dayData ? 'has-data' : ''}`}>
                    <div className="day-header" onClick={() => isCurrentMonth && handleDayClick(day, dayData)}>
                      <span className={`day-number ${isToday ? 'today' : ''}`}>{day}</span>
                    </div>
                    <div className="day-body">
                      {isCurrentMonth && dayData && (
                        <div className="transactions-list">
                          {dayData.items.map(t => (
                            <div key={t.id} className="transaction-item">
                              <span className="merchant">{t.merchant}</span>
                              <span className={`amount ${t.amount && t.amount > 0 ? 'income' : 'expense'}`}>
                                {t.amount?.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {isCurrentMonth && (
                      <div className="day-footer">
                        <div className={`daily-total ${totalExpense >= 0 ? 'empty-total' : ''}`}>
                          {expenseCount > 0 ? (
                            <>
                              <span className='transaction-count'>{expenseCount}건</span>
                              <span>{totalExpense.toLocaleString()}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <FloatingSelectPopup ref={floatingSelectRef} />
      {popupData && <DateDetailPopup data={popupData} onClose={() => setPopupData(null)} />}
    </div>
  );
};

export default Monthly;