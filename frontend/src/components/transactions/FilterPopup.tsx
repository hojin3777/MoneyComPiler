import React, { useState, useEffect, useMemo } from 'react';
import { FaSortAlphaDown, FaSortAlphaUp, FaFilter } from 'react-icons/fa';
import type { Transaction } from '../../pages/Transactions'; // Transaction 타입 import
import './FilterPopup.css';

import DatePicker, { registerLocale } from 'react-datepicker';
// import 'react-datepicker/dist/react-datepicker.css';
// import "./DatePickerOverrides.css";
import { ko } from 'date-fns/locale';

registerLocale('ko', ko);

type FilterPopupProps<T> = {
  columnKey: string;
  columnName: string;
  allValues: T[];
  appliedFilters: T[];
  onApply: (columnKey: string, selectedValues: any[]) => void;
  onClose: () => void;
  // 정렬, 필터해제, 위치 props 추가
  onSort: (columnKey: keyof Transaction, direction: 'asc' | 'desc') => void; // ✨ 2. 타입 명시
  onClearFilter: (columnKey: string) => void;
  position: { top: number; left: number };
};

const FilterPopup = <T extends React.ReactNode>({
  columnKey,
  allValues,
  appliedFilters,
  onApply,
  onClose,
  onSort,
  onClearFilter,
  position,
}: FilterPopupProps<T>) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedValues, setSelectedValues] = useState<any[]>(appliedFilters);
  // 범위 필터링 state
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [useRangeFilter, setUseRangeFilter] = useState(false);
  const isRangeFilterColumn = columnKey === 'transaction_date' || columnKey === 'amount';

  useEffect(() => {
    if (isRangeFilterColumn && appliedFilters.length > 0) {
      const allValuesSet = new Set(allValues);
      const isRangeFiltered = appliedFilters.every(value => allValuesSet.has(value));

      if (isRangeFiltered && appliedFilters.length < allValues.length) {
        setUseRangeFilter(true);

        if (columnKey === 'transaction_date') {
          const dates = appliedFilters.map(String).sort();
          setRangeFrom(dates[0] || '');
          setRangeTo(dates[dates.length - 1] || '');
        } else if (columnKey === 'amount') {
          const numbers = appliedFilters.map(Number).sort((a, b) => a - b);
          setRangeFrom(String(numbers[0] || ''));
          setRangeTo(String(numbers[numbers.length - 1] || ''));
        }
      }
    }
  }, [appliedFilters, allValues, columnKey, isRangeFilterColumn]);

  const uniqueValues = useMemo(() => {
    return Array.from(new Set(allValues)).sort((a, b) => {
      const strA = a === null || a === undefined ? '' : String(a);
      const strB = b === null || b === undefined ? '' : String(b);
      return strA.localeCompare(strB);
    });
  }, [allValues]);

  const filteredOptions = useMemo(() => {
    return uniqueValues.filter(value => {
      const stringValue = String(value ?? '').toLowerCase();
      return stringValue.includes(searchTerm.toLowerCase());
    });
  }, [uniqueValues, searchTerm]);

  const dateRange = useMemo(() => {
    if (columnKey !== 'transaction_date') return { minDate: null, maxDate: null };

    const validDates = allValues
      .filter(v => v !== null && v !== undefined)
      .map(v => new Date(String(v)))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      minDate: validDates.length > 0 ? validDates[0] : null,
      maxDate: validDates.length > 0 ? validDates[validDates.length - 1] : null,
    };
  }, [allValues, columnKey]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedValues(uniqueValues);
    } else {
      setSelectedValues([]);
    }
  };

  const handleValueChange = (value: any) => {
    setSelectedValues(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleApplyClick = () => {
    if (useRangeFilter && isRangeFilterColumn) {
      // 범위 필터가 활성화된 경우
      const filtered = uniqueValues.filter(value => {
        if (value === null || value === undefined) return false;

        if (columnKey === 'transaction_date') {
          const dateStr = String(value);
          const fromMatch = !rangeFrom || dateStr >= rangeFrom;
          const toMatch = !rangeTo || dateStr <= rangeTo;
          return fromMatch && toMatch;
        }

        if (columnKey === 'amount') {
          const numValue = Number(value);
          const fromMatch = !rangeFrom || numValue >= Number(rangeFrom);
          const toMatch = !rangeTo || numValue <= Number(rangeTo);
          return fromMatch && toMatch;
        }

        return false;
      });
      onApply(columnKey, filtered);
    } else {
      // 일반 체크박스 필터
      onApply(columnKey, selectedValues);
    }
    onClose();
  };

  const handleClearAndClose = () => {
    onClearFilter(columnKey);
    onClose();
  };

  return (
    <div className="filter-popup-overlay" onClick={onClose}>
      <div className="filter-popup-content" onClick={(e) => e.stopPropagation()} style={position}>
        <div className="filter-popup-header">
          {/* ✨ 4. 정렬 및 필터 해제 onClick 이벤트 연결 */}
          <button title="오름차순 정렬" onClick={() => onSort(columnKey as keyof Transaction, 'asc')}><FaSortAlphaUp /></button>
          <button title="내림차순 정렬" onClick={() => onSort(columnKey as keyof Transaction, 'desc')}><FaSortAlphaDown /></button>
          <button title="필터 해제" onClick={handleClearAndClose}><FaFilter /></button>
        </div>
        <div className="filter-popup-body">
          {isRangeFilterColumn && (
            <div className='filter-range-setion'>
              <label className='range-toggle'>
                <input
                  type="checkbox"
                  checked={useRangeFilter}
                  onChange={(e) => setUseRangeFilter(e.target.checked)}
                />
                범위 필터 사용{columnKey === 'transaction_date' ? '' : <span className='range-separator'>(지출은 음수임에 유의)</span>}
              </label>
              {useRangeFilter && (
                <>
                  <div className="range-inputs">
                    {columnKey === 'transaction_date' ? (
                      <DatePicker
                        selected={rangeFrom ? new Date(rangeFrom) : null}
                        onChange={(date: Date | null) => {
                          if (date) {
                            const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            setRangeFrom(formatted);
                          } else {
                            setRangeFrom('');
                          }
                        }}
                        dateFormat="yyyy - MM - dd"
                        placeholderText='시작 날짜'
                        className='filter-search-input'
                        locale={ko}
                        popperClassName='dp-popper'
                        calendarClassName='dp-calender'
                        showYearDropdown
                        showMonthDropdown
                        dropdownMode='scroll'
                        scrollableYearDropdown
                        // yearDropdownItemNumber={10}
                        minDate={dateRange.minDate ?? undefined}
                        maxDate={dateRange.maxDate ?? undefined}
                      />
                    ) : (
                      <input
                        type='number'
                        className="filter-search-input"
                        placeholder='최소 금액'
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value)}
                      />
                    )}
                    <span className='range-separator'>부터</span>
                  </div>
                  <div className="range-inputs">
                    {columnKey === 'transaction_date' ? (
                      <DatePicker
                        selected={rangeTo ? new Date(rangeTo) : null}
                        onChange={(date: Date | null) => {
                          if (date) {
                            const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            setRangeTo(formatted);
                          } else {
                            setRangeTo('');
                          }
                        }}
                        dateFormat="yyyy - MM - dd"
                        placeholderText="종료 날짜"
                        className="filter-search-input"
                        locale={ko}
                        popperClassName="dp-popper"
                        calendarClassName="dp-calendar"
                        showYearDropdown
                        showMonthDropdown
                        dropdownMode='scroll'
                        scrollableYearDropdown
                        // yearDropdownItemNumber={10}
                        minDate={dateRange.minDate ?? undefined}
                        maxDate={dateRange.maxDate ?? undefined}
                      />
                    ) : (
                      <input
                        type="number"
                        className="filter-search-input"
                        placeholder="최대 금액"
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value)}
                      />
                    )}
                    <span className="range-separator">까지</span>
                  </div>
                </>
              )}
            </div>
          )}
          {(!isRangeFilterColumn || !useRangeFilter) && (
            <>
              <input
                type="text"
                className="filter-search-input"
                placeholder="목록 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="filter-options-list">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedValues.length === uniqueValues.length}
                    onChange={handleSelectAll}
                  />
                  (모두 선택)
                </label>
                {filteredOptions.map((value, index) => (
                  <label key={index}>
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(value)}
                      onChange={() => handleValueChange(value)}
                    />
                    {value?.toString() || '(비어 있음)'}
                  </label>
                ))}
              </div>
            </>
          )}

        </div>
        <div className="filter-popup-footer">
          <button onClick={handleApplyClick} className="primary">확인</button>
          <button onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  );
};

export default FilterPopup;