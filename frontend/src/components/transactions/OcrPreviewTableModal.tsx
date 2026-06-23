import React, { useState, useRef, useEffect } from 'react';
import { FaPlus, FaArrowRight, FaTrash } from 'react-icons/fa';
import './OcrPreviewTableModal.css';

import FloatingSelectPopup, { type FloatingSelectHandle, type Opt } from '../FloatingSelectPopup';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './DatePickerOverrides.css'; // DatePicker 커스텀 CSS 재사용
import { ko } from 'date-fns/locale';
import ImagePreviewPopup from './ImagePreviewPopup';
registerLocale('ko', ko);

// Transactions.tsx와 유사한 타입 정의
type Account = { id: number; name: string; };
type MinorCategory = { uuid: string; name: string; };
type CategoryItem = { id: number; name: string; minors: MinorCategory[]; };
type AppData = {
  accounts: Account[];
  categories: CategoryItem[];
  mappings: { [key: number]: string; }; // bert_output_id -> minor_category_uuid
};
type NotificationType = 'info' | 'error';
type ImagePreviewState = {
  url: string;
  top: number;
  left: number;
  filename: string;
};
type HighlightCell = {
  rowId: string;
  column: keyof TransactionRow;
  type: 'error' | 'sync';
};
// 룰베이스 undo용 정보 추적
type NotificationData = {
  message: string;
  type: NotificationType;
  ruleType?: 'ocr-correction' | 'rule-based-mapping';
  merchantName?: string;
  minorCategoryUuid?: string | null;
}

export type TransactionRow = {
  id: string;
  transaction_date: string;
  type: string;
  amount: number | null;
  merchant: string;
  memo: string;
  original_merchant?: string; // OCR 보정 규칙을 위해 원본 거래처명 저장
  file_name?: string; // 원본 파일명 저장
  account_id: number | null;
  minor_category_uuid: string | null;
  // UI 표시용
  account_name: string | null;
  major_category_name: string | null;
  minor_category_name: string | null;
  //더치페이 기능용
  parent_id?: string | null;
};

type OcrPreviewTableModalProps = {
  open: boolean;
  rows?: any[];
  onClose: () => void;
  onInsert: (rows: TransactionRow[]) => void;
  appData: AppData;
  TRANSACTION_TYPES: string[];
};

const API_BASE_URL = 'http://127.0.0.1:5050';
const OCR_IMAGE_BASE_URL = `${API_BASE_URL}/api/ocr/image`;

const OcrPreviewTableModal: React.FC<OcrPreviewTableModalProps> = ({
  open, rows = [], onClose, onInsert, appData, TRANSACTION_TYPES
}) => {
  const [editedRows, setEditedRows] = useState<TransactionRow[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: keyof TransactionRow } | null>(null);
  const [highlightCell, setHighlightCell] = useState<HighlightCell[]>([]);
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [selectedDutchSources, setSelectedDutchSources] = useState<string[]>([]); // 더치페이 원본 행 ID 목록
  const [checkedOcrRows, setCheckedOcrRows] = useState<Set<string>>(new Set()); // OCR 선택된 행 ID 목록

  const editingCellRef = useRef<HTMLInputElement>(null);
  const floatingSelectRef = useRef<FloatingSelectHandle | null>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 컴포넌트 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    }
  }, []);

  // ******************** 백엔드에서 데이터 로드 및 자동 보정 규칙 관련 핸들러 ********************
  useEffect(() => {
    if (!open || !rows || rows.length === 0) {
      setEditedRows([]);
      setCheckedOcrRows(new Set());
      return;
    }

    const newRows = rows.map(backendRow => {
      const rawDate = backendRow.date || new Date().toISOString().split('T')[0];
      const formattedDate = rawDate.replace(/\./g, '-');

      const newRow: TransactionRow = {
        id: `tmp-ocr-${crypto.randomUUID()}`,
        transaction_date: formattedDate,
        type: '유동지출', // 기본값
        amount: backendRow.amount ? Number(String(backendRow.amount).replace(/,/g, '')) : null,
        merchant: backendRow.merchant || '',
        memo: '',
        original_merchant: backendRow.original_merchant || backendRow.merchant || '',
        file_name: backendRow.file_name || '',
        account_id: null,
        account_name: null,

        minor_category_uuid: backendRow.minor_category_uuid || null,
        major_category_name: backendRow.major_category || null,
        minor_category_name: backendRow.minor_category || null,
        parent_id: null,
      };

      // 백엔드가 보내준 대분류 이름에 따라 '유형'을 설정
      if (newRow.major_category_name) {
        if (['고정수입', '유동수입'].includes(newRow.major_category_name)) {
          newRow.type = '수입';
        } else if (newRow.major_category_name === '이체분류') {
          newRow.type = '이체';
        }
      }
      return newRow;
    });
    setEditedRows(newRows);
    setCheckedOcrRows(new Set());
  }, [open, rows, appData.categories]);

  // 4. 자동 규칙 생성 및 알림 표시
  const showNotification = (message: string, type: NotificationType, ruleData?: { ruleType: 'ocr-correction' | 'rule-based-mapping', merchantName?: string, minorCategoryUuid?: string|null }) => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current); // 이전 timeout 정리하고
    setNotification({ message, type, ...ruleData });  // 새로운 알림 설정
    const duration = type === 'error' ? 3000 : 5000; // 에러는 3초, 정보는 5초
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimeoutRef.current = null;
    }, duration);
  };

  // 셀 값 변경 핸들러 (Transactions.tsx와 거의 동일)
  const handleCellChange = (rowId: string, column: keyof TransactionRow, value: any) => {
    setEditedRows(prev => {
      let newRows = [...prev];
      const rowIndex = newRows.findIndex(r => r.id === rowId);
      if (rowIndex === -1) return prev;

      const oldRow = { ...newRows[rowIndex] };
      const updatedRow = { ...newRows[rowIndex], [column]: value };

      // 계좌 변경 시 동일 파일명 계좌 동기화
      if (column === 'account_id') {
        const acc = appData.accounts.find(a => a.id === value);
        const targetFileName = updatedRow.file_name;
        if (targetFileName) {
          const cellsToHighlight: HighlightCell[] = [];
          newRows = newRows.map(r => {
            if (r.file_name === targetFileName) {
              cellsToHighlight.push({ rowId: r.id, column: 'account_name', type: 'sync' });
              return { ...r, account_id: value, account_name: acc ? acc.name : null };
            }
            return r;
          });
          setHighlightCell(cellsToHighlight);
          setTimeout(() => setHighlightCell([]), 3000);
          return newRows;
        }
        updatedRow.account_name = acc ? acc.name : null;
      }

      // 유형, 대분류, 소분류 편집 시 자동 보정 규칙 생성
      if (column === 'type' || column === 'major_category_name') {
        if (column === 'type') updatedRow.major_category_name = null;
        updatedRow.minor_category_uuid = null;
        updatedRow.minor_category_name = null;
      } else if (column === 'minor_category_uuid') {
        for (const major of appData.categories) {
          const minor = major.minors.find(m => m.uuid === value);
          if (minor) {
            updatedRow.minor_category_name = minor.name;
            updatedRow.major_category_name = major.name;
            if (oldRow.minor_category_uuid !== updatedRow.minor_category_uuid && updatedRow.merchant) {
              fetch(`${API_BASE_URL}/api/rule-based-mappings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ merchant_name: updatedRow.merchant, minor_category_uuid: updatedRow.minor_category_uuid }),
              });
              showNotification(`룰베이스 매핑 추가:     ${updatedRow.merchant}     →     ${major.name}-${minor.name}    `,
                'info',
              { ruleType: 'rule-based-mapping', merchantName: updatedRow.merchant, minorCategoryUuid: updatedRow.minor_category_uuid });
            }
            break;
          }
        }
      } else if (column === 'merchant') {
        if (oldRow.original_merchant && oldRow.merchant !== updatedRow.merchant) {
          fetch(`${API_BASE_URL}/api/ocr-corrections`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original_text: oldRow.original_merchant, corrected_text: updatedRow.merchant }),
          });
          showNotification(`OCR 보정 규칙 추가:     ${oldRow.original_merchant}     →     ${updatedRow.merchant}    `,
            'info',
          { ruleType: 'ocr-correction', merchantName: updatedRow.merchant });
        }
      } else if (column === 'amount') {
        const strValue = String(value);
        const isIncome = strValue.startsWith('+');
        const num = parseInt(strValue.replace(/[+,]/g, ''), 10) || 0;
        updatedRow.amount = isIncome ? num : -Math.abs(num);
      }
      newRows[rowIndex] = updatedRow;
      return newRows;
    });
  };

  // 규칙 삭제 핸들러
  const handleUndoRule = async () => {
    if (!notification) return;
    try {
      if (notification.ruleType === 'ocr-correction') {
        // OCR 보정 규칙 삭제
        await fetch(`${API_BASE_URL}/api/ocr-corrections/${notification.merchantName}`, {
          method: 'DELETE',
        });
      } else if (notification.ruleType === 'rule-based-mapping') {
        // 룰베이스 매핑 규칙 삭제
        await fetch(`${API_BASE_URL}/api/rule-based-mappings/${notification.merchantName}`, {
          method: 'DELETE',
        });
      }
      showNotification('규칙이 삭제되었습니다.', 'error');
    } catch (error) {
      console.error('규칙 삭제 실패:', error);
      showNotification('규칙 삭제에 실패했습니다. 매핑 메뉴에서 시도해주세요.', 'error');
    }
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
  // 삽입 버튼 클릭 (유효성 검사 추가)
  const handleInsert = () => {
    const finalRowsToInsert = editedRows.filter(row => !row.parent_id).map(row => {
      const children = editedRows.filter(child => child.parent_id === row.id);
      if (children.length > 0) {
        const totalAmount = children.reduce((sum, child) => sum + (child.amount || 0), row.amount || 0);
        const dutchPayMemo = children
          .map(child => `${child.merchant} ${(child.amount || 0).toLocaleString()}원`)
          .join(', ') + ' 정산처리';
        const newMemo = row.memo ? `${dutchPayMemo} | ${row.memo}` : dutchPayMemo;
        return { ...row, amount: totalAmount, memo: newMemo };
      }
      return row; // 자식이 없으면 원래 행 그대로 반환
    });

    const rowsWithEmptyCells = finalRowsToInsert.filter(row => !row.account_id || !row.minor_category_uuid || !row.merchant || row.amount === null);
    if (rowsWithEmptyCells.length > 0) {
      const highlights = rowsWithEmptyCells.flatMap(row => {
        const missingColumns: (keyof TransactionRow)[] = [];
        if (!row.account_id) missingColumns.push('account_name');
        if (!row.minor_category_uuid) missingColumns.push('minor_category_name');
        if (!row.merchant) missingColumns.push('merchant');
        if (row.amount === null) missingColumns.push('amount');
        return missingColumns.map(col => ({ rowId: row.id, column: col, type: 'error' as const }));
      });
      setHighlightCell(highlights);
      showNotification('비어있는 셀을 확인하십시오.', 'error');
      setTimeout(() => setHighlightCell([]), 3000);
      return;
    }
    onInsert(finalRowsToInsert);
    setImagePreview(null);
    handleCloseModal();
  };

  const handleCloseModal = () => {
    setImagePreview(null);
    onClose();
  };

  // 셀 강조 애니메이션
  useEffect(() => {
    if (highlightCell.length > 0) {
      const firstCell = highlightCell[0];
      const cellId = `ocr-cell-${firstCell.rowId}-${firstCell.column}`;
      const el = document.getElementById(cellId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }, [highlightCell]);


  // ******************** 더치페이 관련 핸들러 ********************
  // '정산 입금' 체크박스 핸들러
  const handleDutchSourceCheck = (rowId: string, isChecked: boolean) => {
    setSelectedDutchSources(prev =>
      isChecked ? [...prev, rowId] : prev.filter(id => id !== rowId)
    );
  };

  // '정산 대상' 체크박스 핸들러 (정산 시작)
  const handleDutchTargetCheck = (targetRowId: string) => {
    if (selectedDutchSources.length === 0) return;
    setEditedRows(prev => {
      const newRows = [...prev];
      selectedDutchSources.forEach(sourceId => {
        const sourceRowIndex = newRows.findIndex(r => r.id === sourceId);
        if (sourceRowIndex > -1) {
          newRows[sourceRowIndex].parent_id = targetRowId;
        }
      });
      return newRows;
    });
    setSelectedDutchSources([]);
  };

  // '원래대로' 버튼 핸들러 (정산 취소)
  const handleDutchRevert = (childRowId: string) => {
    setEditedRows(prev => {
      const newRows = [...prev];
      const childRowIndex = newRows.findIndex(r => r.id === childRowId);
      if (childRowIndex > -1) {
        newRows[childRowIndex].parent_id = null;
      }
      return newRows;
    });
  };

  // ********************* 행 추가/삭제 및 체크박스 관련 핸들러 *********************
  const handleAddRow = () => {
    const newRow: TransactionRow = {
      id: `tmp-ocr-${crypto.randomUUID()}`,
      transaction_date: new Date().toISOString().split('T')[0],
      type: '유동지출',
      amount: null,
      merchant: '',
      memo: '',
      account_id: null,
      account_name: null,
      minor_category_uuid: null,
      major_category_name: null,
      minor_category_name: null,
      parent_id: null,
    };

    let lastCheckedIndex = -1;
    if (checkedOcrRows.size > 0) {
      const visibleRows = editedRows.filter(r => !r.parent_id);
      for (let i = visibleRows.length - 1; i >= 0; i--) {
        if (checkedOcrRows.has(visibleRows[i].id)) {
          const actualIndex = editedRows.findIndex(r => r.id === visibleRows[i].id);
          lastCheckedIndex = actualIndex;
          break;
        }
      }
    }

    setEditedRows(prev => {
      const newRows = [...prev];
      if (lastCheckedIndex === -1) {
        newRows.push(newRow);
      } else {
        newRows.splice(lastCheckedIndex + 1, 0, newRow);
      }
      return newRows;
    });
  };

  const handleDeleteRows = () => {
    if (checkedOcrRows.size === 0) return;
    setEditedRows(prev => prev.filter(row => !checkedOcrRows.has(row.id)));
    setCheckedOcrRows(new Set());
  };

  const handleToggleCheck = (rowId: string) => {
    setCheckedOcrRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) newSet.delete(rowId);
      else newSet.add(rowId);
      return newSet;
    });
  };

  const handleToggleCheckAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setCheckedOcrRows(new Set(editedRows.map(r => r.id)));
    } else {
      setCheckedOcrRows(new Set());
    }
  };


  if (!open) return null;
  return (
    <>
      <div className="ocr-preview-modal-bg">
        <div className="ocr-preview-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ocr-preview-header-row">
            <div className='ocr-modal-toolbar'>
              <button onClick={handleAddRow}>
                {checkedOcrRows.size > 0 ? <FaArrowRight /> : <FaPlus />}
                {checkedOcrRows.size > 0 ? ' 행 삽입' : ' 행 추가'}
              </button>
              <button onClick={handleDeleteRows} disabled={checkedOcrRows.size === 0}>
                <FaTrash /> 행 삭제
              </button>
            </div>
            <div className="ocr-preview-title">거래내역 추출결과</div>
            <button className="ocr-preview-close" onClick={handleCloseModal}>×</button>
          </div>
          <div className="ocr-preview-table-wrap" ref={modalBodyRef}>
            <table className="ocr-preview-table">
              <thead>
                <tr>
                  <th className="ocr-actions-header">
                    <input
                      type="checkbox"
                      onChange={handleToggleCheckAll}
                      checked={editedRows.length > 0 && checkedOcrRows.size === editedRows.length}
                    />
                  </th>
                  <th>파일명</th>
                  <th>날짜</th>
                  <th>계좌</th>
                  <th>유형</th>
                  <th>대분류</th>
                  <th>소분류</th>
                  <th>금액</th>
                  <th>거래처</th>
                  <th className="dutch-header dutch-income" title="정산 입금">→</th>
                  <th className="dutch-header dutch-expense" title="정산 대상">←</th>
                </tr>
              </thead>
              <tbody>
                {/* 1. 렌더링 로직을 부모-자식 구조로 변경 */}
                {editedRows.filter(row => !row.parent_id).map((row) => {
                  const children = editedRows.filter(child => child.parent_id === row.id);
                  let totalAmount = row.amount || 0;
                  children.forEach(child => {
                    totalAmount += child.amount || 0;
                  });

                  return (
                    <React.Fragment key={row.id}>
                      {/* 부모 행 */}
                      <tr className={children.length > 0 ? 'dutch-parent-row' : ''}>
                        <td>
                          <input type='checkbox' checked={checkedOcrRows.has(row.id)} onChange={() => handleToggleCheck(row.id)} />
                        </td>
                        {renderCell(row, 'file_name')}
                        {renderCell(row, 'transaction_date')}
                        {renderCell(row, 'account_name')}
                        {renderCell(row, 'type')}
                        {renderCell(row, 'major_category_name')}
                        {renderCell(row, 'minor_category_name')}
                        {/* 금액 셀 특별 처리 */}
                        {renderCell(row, 'amount', { isParent: children.length > 0, totalAmount })}
                        {renderCell(row, 'merchant')}
                        {renderDutchCells(row, 'parent')}
                      </tr>
                      {/* 자식 행 */}
                      {children.map(child => (
                        <tr key={child.id} className="dutch-child-row">
                          <td>
                            <input type='checkbox' checked={checkedOcrRows.has(child.id)} onChange={() => handleToggleCheck(child.id)} />
                          </td>
                          {renderCell(child, 'file_name', { isChild: true })}
                          {renderCell(child, 'transaction_date', { isChild: true })}
                          {renderCell(child, 'account_name', { isChild: true })}
                          {renderCell(child, 'type', { isChild: true })}
                          {renderCell(child, 'major_category_name', { isChild: true })}
                          {renderCell(child, 'minor_category_name', { isChild: true })}
                          {renderCell(child, 'amount', { isChild: true })}
                          {renderCell(child, 'merchant', { isChild: true })}
                          {renderDutchCells(child, 'child')}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="ocr-preview-footer">
            {notification && (
              <div className={`ocr-preview-notification ${notification.type}`}>
                <span>{notification.message}</span>
                {notification.ruleType && (
                  <span
                    className="notification-undo-link"
                    onClick={handleUndoRule}
                    title="undo"
                  >
                    되돌리기  
                  </span>
                )}
              </div>
            )}
            <div style={{ flex: 1 }}></div>
            <button className="primary ocr-preview-insert-btn" onClick={handleInsert}>삽입</button>
            <button className="ocr-preview-cancel-btn" onClick={onClose}>취소</button>
          </div>
        </div>
      </div>
      <FloatingSelectPopup ref={floatingSelectRef} />
      <ImagePreviewPopup preview={imagePreview} onClose={() => setImagePreview(null)} />
    </>
  );

  // 더치페이 관련 셀 렌더링
  function renderDutchCells(row: TransactionRow, type: 'parent' | 'child') {
    if (type === 'child') {
      return (
        <>
          <td colSpan={2} className='align-center'>
            <button className='dutch-revert-btn' onClick={() => handleDutchRevert(row.id)} title='정산 취소'>⤺</button>
          </td>
        </>
      );
    }
    // type === 'parent'
    return (
      <>
        <td className='align-center'>
          <input
            type="checkbox"
            checked={selectedDutchSources.includes(row.id)}
            onChange={(e) => handleDutchSourceCheck(row.id, e.target.checked)}
          />
        </td>
        <td className='align-center'>
          <input
            type="checkbox"
            disabled={selectedDutchSources.length === 0 || selectedDutchSources.includes(row.id)}
            // 2. 정산 적용 후 체크 해제를 위해 checked 상태를 제어
            checked={false}
            onChange={() => handleDutchTargetCheck(row.id)}
          />
        </td>
      </>
    );
  }



  // 셀 렌더링 로직 - 정산기능 때문에 funciton으로 이동
  function renderCell(row: TransactionRow, column: keyof TransactionRow, options?: { isParent?: boolean, totalAmount?: number, isChild?: boolean }) {
    if (column === 'amount' && options?.isParent) {
      return (
        <td className={`align-right ${options.totalAmount! >= 0 ? 'amount-income' : 'amount-expense'}`}>
          <del className='dutch-cancel-amount'>{row.amount?.toLocaleString()}</del>
          <span className="dutch-final-amount"> {options.totalAmount?.toLocaleString()}</span>
        </td>
      );
    }

    const cellId = `ocr-cell-${row.id}-${column}`;
    if (column === 'file_name') {
      const content = (
        <span
          className={options?.isChild ? 'filename-text' : 'filename-cell'}
          onClick={(e) => {
            if (row.file_name) {
              const rect = e.currentTarget.getBoundingClientRect();
              const POPUP_WIDTH = 400;
              const MARGIN = 15;
              const windowHeight = window.innerHeight;
              let left = rect.left - POPUP_WIDTH - MARGIN;
              if (left < MARGIN) left = MARGIN;
              let top = rect.top;
              const estimatedPopupHeight = windowHeight * 0.95;
              if (top + estimatedPopupHeight > windowHeight - MARGIN) {
                top = windowHeight - estimatedPopupHeight - MARGIN;
              }
              if (top < MARGIN) top = MARGIN;
              setImagePreview({
                url: `${OCR_IMAGE_BASE_URL}/${row.file_name}`,
                top: top,
                left: left,
                filename: row.file_name
              });
            }
          }}
        >
          {row.file_name}
        </span>
      );

      if (options?.isChild) {
        return <td id={cellId}><span className='dutch-child-prefix'></span>{content}</td>;
      }
      return <td id={cellId}>{content}</td>;
    }
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
              selected={new Date(row.transaction_date)}
              onChange={(date: Date | null) => {
                if (date) handleCellChange(row.id, 'transaction_date', date.toISOString().split('T')[0]);
                setEditingCell(null);
              }}
              dateFormat="yyyy-MM-dd"
              onCalendarClose={() => setEditingCell(null)}
              onClickOutside={() => setEditingCell(null)}
              autoFocus
              locale={ko}
              popperClassName='dp-popper'
              calendarClassName='dp-calendar'
              portalId='root'
              showYearDropdown
              showMonthDropdown
              dropdownMode='scroll'
              scrollableYearDropdown
              yearDropdownItemNumber={10}
            // minDate={new Date(2020, 0, 1)}
            // maxDate={new Date(2030, 12, 31)}
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
          floatingSelectRef.current?.open(opts, row.type, pos, (v) => handleCellChange(row.id, 'type', v), '-- 유형 --');
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
        // 일반 텍스트/숫자 편집
        setEditingCell({ rowId: row.id, column });
      }
    };
    let displayValue: React.ReactNode = row[column];
    let className = '';
    const highlightInfo = highlightCell.find(cell => cell.rowId === row.id && cell.column === column);
    if (highlightInfo) {
      className = highlightInfo.type === 'error' ? 'highlight-error' : 'highlight-sync';
    }
    if (options?.isChild) {
      className = `${className} dutch-child-content-cell`.trim();
    }
    if (column === 'transaction_date') {
      className = `${className} align-center`.trim();
    } else if (column === 'amount') {
      className = `${className} align-right ${row.amount! >= 0 ? 'amount-income' : 'amount-expense'}`.trim();
      displayValue = row.amount?.toLocaleString() ?? <span className="placeholder">-- 금액 --</span>;
    } else if (!row[column] && ['account_name', 'major_category_name', 'minor_category_name', 'merchant'].includes(column)) {
      displayValue = <span className="placeholder">-- {column === 'account_name' ? '계좌' : column === 'major_category_name' ? '대분류' : column === 'minor_category_name' ? '소분류' : '거래처'} --</span>;
    }
    return <td id={cellId} className={className} onClick={onCellClick}>{displayValue}</td>;
  }
};

export default OcrPreviewTableModal;