import React, { useState, useRef, useEffect } from 'react';
import './ExcelImportModal.css';

import FloatingSelectPopup, { type FloatingSelectHandle, type Opt } from '../FloatingSelectPopup';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './DatePickerOverrides.css'; // DatePicker 커스텀 CSS 재사용

// Transactions.tsx와 유사한 타입 정의
import { type CategoryItem, type Transaction, type Appdata } from '../../pages/Transactions';

type ExcelRow = Omit<Transaction, 'id' | 'checked' | 'is_bold' | 'flag_color_id' | 'highlight_color_id' | 'background_color_id'> & {
  id: string;
  original_excel_row?: any;
};
type NotificationType = 'info' | 'error';
type HighlightCell = { rowId: string; column: keyof ExcelRow; };
type ExcelImportModalProps = {
  open: boolean;
  importedData: any[];
  onClose: () => void;
  onInsert: (rows: ExcelRow[]) => void;
  appData: Appdata;
  TRANSACTION_TYPES: string[];
};

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  open, importedData, onClose, onInsert, appData, TRANSACTION_TYPES
}) => {
  const [previewRows, setPreviewRows] = useState<ExcelRow[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: keyof ExcelRow } | null>(null);
  const [highlightCell, setHighlightCell] = useState<HighlightCell | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  const editingCellRef = useRef<HTMLInputElement | null>(null);
  const floatingSelectRef = useRef<FloatingSelectHandle | null>(null);

  // ******************** 백엔드에서 데이터 로드 및 자동 보정 규칙 관련 핸들러 ********************
  // 데이터 불러오기 및 매핑 로직
  useEffect(() => {
    if (!open || !importedData) return;

    const newRows = importedData.map(row => {
      // 2. 계좌, 유형, 카테고리 매핑
      const account = appData.accounts.find(a => a.name === row['계좌']);
      const isValidType = TRANSACTION_TYPES.includes(row['유형']);
      
      let minorCategory = null;
      let majorCategoryName = null;
      for (const major of appData.categories) {
        const foundMinor = major.minors.find(m => m.name === row['소분류']);
        if (foundMinor) {
          minorCategory = foundMinor;
          majorCategoryName = major.name;
          break;
        }
      }

      // 3. 날짜, 금액, 거래처, 메모 처리
      // Excel 날짜가 숫자로 올 경우 변환 (1900-01-01 기준)
      let transactionDateStr: string | null = null;
      const excelDate = row['날짜'];

      if (excelDate instanceof Date && !isNaN(excelDate.getTime())) {
        // 1. 유효한 Date 객체인 경우
        transactionDateStr = excelDate.toISOString().split('T')[0];
      } else if (typeof excelDate === 'number') {
        // 2. Excel 날짜 시리얼 번호(숫자)인 경우
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + excelDate * 24 * 60 * 60 * 1000);
        if (!isNaN(date.getTime())) {
          transactionDateStr = date.toISOString().split('T')[0];
        }
      } else if (typeof excelDate === 'string' && excelDate.trim() !== '') {
        // 3. 문자열인 경우, 파싱 시도
        const date = new Date(excelDate);
        if (!isNaN(date.getTime())) {
          transactionDateStr = date.toISOString().split('T')[0];
        }
      }

      return {
        id: `tmp-excel-${crypto.randomUUID()}`,
        transaction_date: transactionDateStr,
        account_id: account ? account.id : null,
        account_name: account ? account.name : null,
        type: isValidType ? row['유형'] : null,
        major_category_name: majorCategoryName,
        minor_category_uuid: minorCategory ? minorCategory.uuid : null,
        minor_category_name: minorCategory ? minorCategory.name : null,
        amount: row['금액'] ? Number(String(row['금액']).replace(/,/g, '')) : null,
        merchant: row['거래처'] || '',
        memo: row['메모'] || '',
        original_excel_row: row,
      } as ExcelRow;
    });
    setPreviewRows(newRows);
  }, [open, importedData, appData, TRANSACTION_TYPES]);

  // 셀 값 변경 핸들러
  const handleCellChange = (rowId: string, column: keyof ExcelRow, value: any) => {
    setPreviewRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const updatedRow = { ...row, [column]: value };
      // (OCR 모달과 동일한 연쇄 업데이트 로직)
      if (column === 'account_id') {
        const acc = appData.accounts.find(a => a.id === value);
        updatedRow.account_name = acc ? acc.name : null;
      } else if (column === 'type') {
        updatedRow.major_category_name = null;
        updatedRow.minor_category_uuid = null;
        updatedRow.minor_category_name = null;
      } else if (column === 'major_category_name') {
        updatedRow.minor_category_uuid = null;
        updatedRow.minor_category_name = null;
      } else if (column === 'minor_category_uuid') {
        for (const major of appData.categories) {
          const minor = major.minors.find(m => m.uuid === value);
          if (minor) {
            updatedRow.minor_category_name = minor.name;
            updatedRow.major_category_name = major.name;
            break;
          }
        }
      }
      return updatedRow;
    }));
  };

  // ESC로 편집 종료
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingCell(null);
      }
    };
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, editingCell]);


  // ******************** 삽입 버튼, 팝업 닫기, 셀 강조 애니메이션 ********************
  // 삽입 핸들러 (빈 값 검증)
  const handleInsert = () => {
    for (const row of previewRows) {
      const emptyCell = (['account_id', 'minor_category_uuid', 'merchant', 'amount'] as const)
        .find(key => row[key] === null || row[key] === '');
      
      if (emptyCell) {
        const colMap = { account_id: 'account_name', minor_category_uuid: 'minor_category_name' };
        const highlightCol = colMap[emptyCell as keyof typeof colMap] || emptyCell;
        
        setHighlightCell({ rowId: row.id, column: highlightCol as keyof ExcelRow });
        setNotification({ message: '비어있는 셀을 확인하십시오.', type: 'error' });
        setTimeout(() => setHighlightCell(null), 3000);
        return;
      }
    }
    onInsert(previewRows);
    onClose();
  };
  
  // 셀 강조 시 스크롤
  useEffect(() => {
    if (highlightCell) {
      const cellId = `excel-cell-${highlightCell.rowId}-${highlightCell.column}`;
      document.getElementById(cellId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightCell]);

// 렌더링 로직 (OCR 모달과 매우 유사)
  const renderCell = (row: ExcelRow, column: keyof ExcelRow) => {
    const cellId = `excel-cell-${row.id}-${column}`;
    const isEditing = editingCell?.rowId === row.id && editingCell?.column === column;
    
    if (isEditing) {
      const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          handleCellChange(row.id, column, e.currentTarget.value);
          setEditingCell(null);
        } else if (e.key === 'Escape') {
          setEditingCell(null);
        }
      };

      if (column === 'transaction_date') {
        return (
          <td className="editing">
            <DatePicker
              selected={row.transaction_date ? new Date(row.transaction_date) : null}
              onChange={(date: Date | null) => {
                if (date) handleCellChange(row.id, 'transaction_date', date.toISOString().split('T')[0]);
                setEditingCell(null);
              }}
              dateFormat="yyyy-MM-dd"
              onCalendarClose={() => setEditingCell(null)}
              onClickOutside={() => setEditingCell(null)}
              autoFocus
              popperClassName='dp-popper'
              calendarClassName='dp-calendar'
              portalId='root'
            />
          </td>
        );
      }
      return (
        <td className="editing">
          <input
            ref={editingCellRef}
            defaultValue={row[column] as string ?? ''}
            onKeyDown={handleKeyDown}
            onBlur={(e) => {
              handleCellChange(row.id, column, e.currentTarget.value);
              setEditingCell(null);
            }}
            autoFocus
          />
        </td>
      );
    }
    const onCellClick = (e: React.MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const pos = { top: rect.bottom + 2, left: rect.left, width: rect.width };

      if (['account_name', 'type', 'major_category_name', 'minor_category_name'].includes(column)) {
        // FloatingSelectPopup 로직
        if (column === 'account_name') {
          const opts: Opt[] = appData.accounts.map(a => ({ value: String(a.id), label: a.name }));
          floatingSelectRef.current?.open(opts, String(row.account_id ?? ''), pos, (v) => handleCellChange(row.id, 'account_id', v === '' ? null : Number(v)), '-- 계좌 --');
        } else if (column === 'type') {
          const opts: Opt[] = TRANSACTION_TYPES.map(t => ({ value: t, label: t }));
          floatingSelectRef.current?.open(opts, row.type ?? '', pos, (v) => handleCellChange(row.id, 'type', v), '-- 유형 --');
        } else if (column === 'major_category_name') {
          const INCOME_CATEGORIES = ['고정수입', '유동수입'];
          const TRANSFER_CATEGORY = '이체분류';
          const CORE_CATEGORIES = [...INCOME_CATEGORIES, TRANSFER_CATEGORY];
          let availableMajors: CategoryItem[] = [];
          if (row.type === '수입') availableMajors = appData.categories.filter(c => INCOME_CATEGORIES.includes(c.name));
          else if (row.type === '이체') availableMajors = appData.categories.filter(c => c.name === TRANSFER_CATEGORY);
          else availableMajors = appData.categories.filter(c => !CORE_CATEGORIES.includes(c.name));

          const opts: Opt[] = availableMajors.map(m => ({ value: m.name, label: m.name }));
          floatingSelectRef.current?.open(opts, row.major_category_name ?? '', pos, (v) => handleCellChange(row.id, 'major_category_name', v), '-- 대분류 --');
        } else if (column === 'minor_category_name') {
          const major = appData.categories.find(c => c.name === row.major_category_name);
          const opts: Opt[] = (major?.minors ?? []).map(m => ({ value: m.uuid, label: m.name }));
          floatingSelectRef.current?.open(opts, row.minor_category_uuid ?? '', pos, (v) => handleCellChange(row.id, 'minor_category_uuid', v === '' ? null : v), '-- 소분류 --');
        }
      } else {
        setEditingCell({ rowId: row.id, column });
      }
    };

    let displayValue: React.ReactNode = row[column as keyof typeof row];
    let className = highlightCell?.rowId === row.id && highlightCell?.column === column ? 'highlight-error' : '';
    
    if (column === 'amount') {
      className += ` align-right ${Number(row.amount) >= 0 ? 'amount-income' : 'amount-expense'}`;
      displayValue = row.amount?.toLocaleString() ?? <span className="placeholder">-- 금액 --</span>;
    } else if (!row[column as keyof typeof row] && ['transaction_date', 'account_name', 'type', 'major_category_name', 'minor_category_name', 'merchant'].includes(column)) {
      let placeholderText = '-- 입력 --';
      if (row.original_excel_row) {
        if (column === 'account_name') placeholderText = row.original_excel_row['계좌'] || '-- 계좌 --';
        else if (column === 'transaction_date') placeholderText = String(row.original_excel_row['날짜'] || '-- 날짜 --');
        else if (column === 'type') placeholderText = row.original_excel_row['유형'] || '-- 유형 --';
        else if (column === 'major_category_name') placeholderText = row.original_excel_row['대분류'] || '-- 대분류 --';
        else if (column === 'minor_category_name') placeholderText = row.original_excel_row['소분류'] || '-- 소분류 --';
        else if (column === 'merchant') placeholderText = row.original_excel_row['거래처'] || '-- 거래처 --';
      }
      displayValue = <span className="placeholder">{placeholderText}</span>;
    }
    if (column === 'memo') {
      return (
        <td id={cellId} className={className} onClick={onCellClick}>
          <div className="memo-cell-content">{displayValue}</div>
        </td>
      );
    }
    return <td id={cellId} className={className} onClick={onCellClick}>{displayValue}</td>;
  };

  if (!open) return null;

  return (
    <div className="excel-import-modal-bg">
      <div className="excel-import-modal">
        <div className="excel-import-header-row">
          <div className="excel-import-title">엑셀 데이터 미리보기</div>
        </div>
        <div className="excel-import-table-wrap">
          <table className="excel-import-table">
            <thead>
              <tr>
                <th>날짜</th><th>계좌</th><th>유형</th><th>대분류</th><th>소분류</th><th>금액</th><th>거래처</th><th>메모</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map(row => (
                <tr key={row.id}>
                  {renderCell(row, 'transaction_date')}
                  {renderCell(row, 'account_name')}
                  {renderCell(row, 'type')}
                  {renderCell(row, 'major_category_name')}
                  {renderCell(row, 'minor_category_name')}
                  {renderCell(row, 'amount')}
                  {renderCell(row, 'merchant')}
                  {renderCell(row, 'memo')}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="excel-import-footer">
          {notification && <div className={`excel-import-notification ${notification.type}`}>{notification.message}</div>}
          <div style={{ flex: 1 }}></div>
          <button className="primary" onClick={handleInsert}>삽입</button>
          <button className="cancel-btn" onClick={onClose}>취소</button>
        </div>
      </div>
      <FloatingSelectPopup ref={floatingSelectRef} />
    </div>
  );
};

export default ExcelImportModal;