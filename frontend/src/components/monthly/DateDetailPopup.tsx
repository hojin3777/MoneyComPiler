import React, { useEffect } from 'react';
import type { Transaction } from '../../pages/Transactions'; // 경로 수정
import './DateDetailPopup.css';

interface PopupData {
  date: Date;
  transactions: Transaction[];
  totalExpense: number;
  expenseCount: number;
}

interface DateDetailPopupProps {
  data: PopupData;
  onClose: () => void;
}

const DateDetailPopup: React.FC<DateDetailPopupProps> = ({ data, onClose }) => {
  const { date, transactions, totalExpense, expenseCount } = data;

  // ESC 키로 팝업 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);


  const formatDate = (d: Date) => {
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 거래내역`;
  };

  return (
    <div className="date-detail-popup-bg" onClick={onClose}>
      <div className="date-detail-popup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="date-detail-popup-header">
          <h2 className="date-detail-popup-title">{formatDate(date)}</h2>
          <button onClick={onClose} className="date-detail-popup-close">&times;</button>
        </div>
        <div className="date-detail-popup-table-wrap">
          <table className="date-detail-popup-table">
            <thead>
              <tr>
                <th>계좌</th>
                <th>유형</th>
                <th>대분류</th>
                <th>소분류</th>
                <th>금액</th>
                <th>거래처</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.account_name}</td>
                  <td>{t.type}</td>
                  <td>{t.major_category_name}</td>
                  <td>{t.minor_category_name}</td>
                  <td className={`amount ${t.amount && t.amount > 0 ? 'income' : 'expense'}`}>{t.amount?.toLocaleString()}</td>
                  <td>{t.merchant}</td>
                  <td>{t.memo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="total-label">총계</td>
                <td>
                  <div className="total-amount">
                    <span className="total-count">({expenseCount}건)</span>
                    {totalExpense.toLocaleString()}
                  </div>
                </td>
                <td colSpan={2} className="footer-note">*총계는 소비금액의 합만 계산합니다</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DateDetailPopup;