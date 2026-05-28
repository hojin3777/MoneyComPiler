import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FaPlusCircle, FaPen, FaTrash } from 'react-icons/fa';
import ConfirmPopup from '../ConfirmPopup';
import FloatingSelectPopup, { type FloatingSelectHandle } from '../FloatingSelectPopup';
import './BudgetManagement.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

// ******************** 타입 정의 ********************
interface MajorCategory { id: number; name: string; }
interface MinorCategory { uuid: string; name: string; major_category_id: number; }
interface BudgetRow {
  id: number | string;  // DB: number, 임시: string (temp-xxx)
  major_category_id: number;
  major_category_name?: string;  // DB 저장된 경우에만
  minor_category_uuid?: string;
  budget_type?: 'major' | 'minor';  // DB 저장된 경우에만
  target_id?: string;  // DB 저장된 경우에만
  target_name?: string;  // DB 저장된 경우에만
  amount: number;
  spent_amount?: number;  // DB 저장된 경우에만
}

interface BudgetManagementProps {
  selectedYear: number | null;
  selectedMonth: number | null;
}
interface TreemapMajor {
  name: string;
  value: number;
  children: TreemapMinor[];
}
interface TreemapMinor {
  name: string;
  value: number;
}

interface ConfirmPopupState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  onConfirm: () => void;
}

// ******************** 메인 컴포넌트 ********************
const BudgetManagement: React.FC<BudgetManagementProps> = ({ selectedYear, selectedMonth }) => {
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);  // 통합 state
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [minorCategories, setMinorCategories] = useState<MinorCategory[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string | number, field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [cachedTreemapData, setCachedTreemapData] = useState<TreemapMajor[]>([]); // Treemap 데이터 캐시
  const floatingSelectRef = useRef<FloatingSelectHandle>(null);
  const [confirmPopup, setConfirmPopup] = useState<ConfirmPopupState>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    onConfirm: () => { }
  });

  // ******************** 데이터 로딩 ********************
  // fetchCategories: 카테고리 목록 로드 (고정수입/유동수입/이체분류 제외)
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/categories`);
      const data = await res.json();
      const allCategories: MajorCategory[] = data.map((cat: any) => ({ id: cat.id, name: cat.name }));
      const filteredMajor = allCategories.filter((mc: MajorCategory) =>
        !['고정수입', '유동수입', '이체분류'].includes(mc.name)
      );
      setMajorCategories(filteredMajor);

      const allMinorCategories: MinorCategory[] = data.flatMap((cat: any) =>
        cat.minors.map((m: any) => ({ ...m, major_category_id: cat.id }))
      );
      setMinorCategories(allMinorCategories);
    } catch (error) {
      console.error('카테고리 로딩 실패:', error);
    }
  }, []);

  // fetchData: Treemap 데이터 + 예산 데이터를 가져와 조합
  // fetchSpendingData: Treemap 데이터(사용금액) 로드
  const fetchSpendingData = useCallback(async () => {
    if (!selectedYear || !selectedMonth) return [];

    try {
      const treemapRes = await fetch(`${API_BASE_URL}/api/statistics/category_treemap?year=${selectedYear}&month=${selectedMonth}`);
      const treemapResult = await treemapRes.json();
      const data = treemapResult.data || [];
      setCachedTreemapData(data);
      return data;
    } catch (error) {
      console.error('사용금액 로딩 실패:', error);
      return [];
    }
  }, [selectedYear, selectedMonth]);

  // fetchBudgetData: 예산 데이터 로드
  const fetchBudgetData = useCallback(async (treemapData: TreemapMajor[]) => {
    try {
      const budgetRes = await fetch(`${API_BASE_URL}/api/budgets`);
      const budgetData = await budgetRes.json();

      const dbRows: BudgetRow[] = budgetData.map((budget: any) => {
        let spent_amount = 0;

        if (budget.budget_type === 'major') {
          const majorData = treemapData.find((m) => m.name === budget.target_name);
          spent_amount = majorData?.value || 0;
        } else {
          for (const major of treemapData) {
            const minorData = major.children?.find((c) => c.name === budget.target_name);
            if (minorData) {
              spent_amount = minorData.value;
              break;
            }
          }
        }

        return {
          id: budget.id,
          major_category_id: budget.major_category_id,
          major_category_name: budget.major_category_name,
          minor_category_uuid: budget.budget_type === 'minor' ? budget.target_id : undefined,
          budget_type: budget.budget_type,
          target_id: budget.target_id,
          target_name: budget.target_name,
          amount: budget.amount,
          spent_amount
        };
      });

      setBudgetRows(prevRows => {
        const tempRows = prevRows.filter(row => {
          if (typeof row.id !== 'string') return false; // DB 행 제외

          // 임시 행과 동일한 카테고리가 DB에 있는지 확인
          const budget_type = row.minor_category_uuid ? 'minor' : 'major';
          const target_id = row.minor_category_uuid || String(row.major_category_id);

          const existsInDb = dbRows.some(dbRow =>
            dbRow.budget_type === budget_type &&
            dbRow.target_id === target_id
          );

          return !existsInDb; // DB에 없는 임시 행만 유지
        });

        return [...dbRows, ...tempRows];
      });
    } catch (error) {
      console.error('예산 데이터 로딩 실패:', error);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // fetchData: 전체 데이터 로드 (날짜 변경 시)
  const fetchData = useCallback(async () => {
    const treemapData = await fetchSpendingData();
    await fetchBudgetData(treemapData);
  }, [fetchSpendingData, fetchBudgetData]);

  // ***** useEffect: 날짜 변경 시에만 전체 데이터 로드 *****
  useEffect(() => {
    if (selectedYear && selectedMonth) {
      fetchData();
    }
  }, [selectedYear, selectedMonth, fetchData]);

  // ******************** 핸들러: 행 추가 ********************
  const handleAddRow = () => {
    if (budgetRows.length >= 30) {
      setConfirmPopup({
        isOpen: true,
        type: 'alert',
        title: '예산 개수 초과',
        message: '예산은 최대 30개까지 설정할 수 있습니다.',
        onConfirm: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    const newRow: BudgetRow = {
      id: `temp-${crypto.randomUUID()}`,  // 임시 ID
      major_category_id: 0,  // 미선택
      amount: 0
    };
    setBudgetRows(prev => [...prev, newRow]);
  };

  // ******************** 핸들러: 카테고리 편집 ********************
  // major/ minor 변경 시 중복 검증 + 상태 업데이트 + DB 저장 
  const handleCategoryChange = async (
    row: BudgetRow,
    field: 'major' | 'minor',
    value: string | number
  ) => {
    const isDb = typeof row.id === 'number';
    let newMajorId: number;
    let newMinorUuid: string | undefined;

    if (field === 'major') {
      newMajorId = Number(value);

      // ***** 중복 없는 소분류 자동 탐색 *****
      const minorOptions = getMinorOptions(newMajorId);
      const candidates = [
        { type: 'major' as const, id: String(newMajorId) },
        ...minorOptions.map(m => ({ type: 'minor' as const, id: m.uuid }))
      ];

      let foundTarget: { budget_type: 'major' | 'minor'; target_id: string } | null = null;

      for (const candidate of candidates) {
        const isDuplicate = budgetRows.some(r =>
          r.id !== row.id &&  // 자기 자신 제외
          (
            (candidate.type === 'major' && !r.minor_category_uuid && String(r.major_category_id) === candidate.id) ||
            (candidate.type === 'minor' && r.minor_category_uuid === candidate.id)
          )
        );

        if (!isDuplicate) {
          foundTarget = { budget_type: candidate.type, target_id: candidate.id };
          break;
        }
      }

      if (!foundTarget) {
        const majorName = majorCategories.find(m => m.id === newMajorId)?.name;
        setConfirmPopup({
          isOpen: true,
          type: 'alert',
          title: '중복된 예산',
          message: `'${majorName}' 대분류의 모든 항목이 이미 예산으로 설정되어 있습니다.`,
          onConfirm: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
        });
        return;
      }

      newMinorUuid = foundTarget.budget_type === 'minor' ? foundTarget.target_id : undefined;
    } else {
      // ***** 소분류 변경 *****
      newMajorId = row.major_category_id;
      newMinorUuid = value ? String(value) : undefined;

      // 중복 검증
      const isDuplicate = budgetRows.some(r =>
        r.id !== row.id &&
        (
          (!newMinorUuid && !r.minor_category_uuid && r.major_category_id === newMajorId) ||
          (newMinorUuid && r.minor_category_uuid === newMinorUuid)
        )
      );

      if (isDuplicate) {
        const categoryName = newMinorUuid
          ? minorCategories.find(m => m.uuid === newMinorUuid)?.name
          : '(대분류 전체)';

        setConfirmPopup({
          isOpen: true,
          type: 'alert',
          title: '중복된 예산',
          message: `이미 '${categoryName}'에 대한 예산이 설정되어 있습니다.`,
          onConfirm: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
        });
        return;
      }
    }

    // ***** 상태 업데이트 *****
    const updatedRow: BudgetRow = {
      ...row,
      major_category_id: newMajorId,
      minor_category_uuid: newMinorUuid
    };

    setBudgetRows(prev => prev.map(r => r.id === row.id ? updatedRow : r));

    // ***** DB 저장 처리 *****
    if (isDb) {
      // 기존 예산 수정
      await updateBudget(updatedRow);
    } else {
      // 임시 행 → DB 저장 조건 확인 (대분류 + 금액)
      if (updatedRow.major_category_id > 0 && updatedRow.amount > 0) {
        await saveBudget(updatedRow);
      }
    }
  };

  // 기존 예산 수정
  const handleEditStart = (row: BudgetRow) => {
    setEditingCell({ id: row.id, field: 'amount' });
    setEditValue(String(row.amount || ''));
  };

  const handleEditSave = async () => {
    if (!editingCell) return;

    const row = budgetRows.find(r => r.id === editingCell.id);
    if (!row) return;

    const newAmount = parseInt(editValue, 10) || 0;
    if (newAmount < 0) {
      setConfirmPopup({
        isOpen: true,
        type: 'alert',
        title: '잘못된 입력',
        message: '0보다 큰 예산 금액을 입력해주세요.',
        onConfirm: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
      });
      setEditingCell(null);
      return;
    }

    const updatedRow: BudgetRow = { ...row, amount: newAmount };
    setBudgetRows(prev => prev.map(r => r.id === row.id ? updatedRow : r));

    const isDb = typeof row.id === 'number';
    if (isDb) {
      await updateBudget(updatedRow);
    } else {
      // 임시 행 → DB 저장 조건 확인
      if (updatedRow.major_category_id > 0 && newAmount > 0) {
        await saveBudget(updatedRow);
      }
    }

    setEditingCell(null);
  };

  // ******************** DB 저장/수정/삭제 ********************
  // saveBudget: 임시 행 → DB 저장 (예산 데이터만 다시 로드)
  const saveBudget = async (row: BudgetRow) => {
    const budget_type = row.minor_category_uuid ? 'minor' : 'major';
    const target_id = row.minor_category_uuid || String(row.major_category_id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_type, target_id, amount: row.amount })
      });
      if (!response.ok) {
        const result = await response.json();
        setConfirmPopup({
          isOpen: true,
          type: 'confirm',
          title: '저장 실패',
          message: `예산 저장에 실패했습니다.\n${result.error || ''}\n해당 항목을 삭제하시겠습니까?`,
          onConfirm: () => {
            setBudgetRows(prev => prev.filter(r => r.id !== row.id));
            setConfirmPopup(prev => ({ ...prev, isOpen: false }));
          }
        });
        return;
      }
      await fetchBudgetData(cachedTreemapData);
    } catch (error) {
      console.error('예산 저장 실패:', error);
      setConfirmPopup({
        isOpen: true,
        type: 'confirm',
        title: '저장 실패',
        message: '예산 저장에 실패했습니다.\n해당 항목을 삭제하시겠습니까?',
        onConfirm: () => {
          setBudgetRows(prev => prev.filter(r => r.id !== row.id));
          setConfirmPopup(prev => ({ ...prev, isOpen: false }));
        }
      });
    }
  };

  // updateBudget: DB 예산 수정 (예산 데이터만 다시 로드)
  const updateBudget = async (row: BudgetRow) => {
    const budget_type = row.minor_category_uuid ? 'minor' : 'major';
    const target_id = row.minor_category_uuid || String(row.major_category_id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/budgets/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_type, target_id, amount: row.amount })
      });
      if (!response.ok) {
        const result = await response.json();
        setConfirmPopup({
          isOpen: true,
          type: 'alert',
          title: '수정 실패',
          message: `예산 수정에 실패했습니다.\n${result.error || ''}`,
          onConfirm: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
        });
        return;
      }
      await fetchBudgetData(cachedTreemapData);
    } catch (error) {
      console.error('예산 수정 실패:', error);
      setConfirmPopup({
        isOpen: true,
        type: 'alert',
        title: '수정 실패',
        message: '예산 수정에 실패했습니다.',
        onConfirm: () => setConfirmPopup(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  // handleDelete: 삭제 (예산 데이터만 다시 로드)
  const handleDelete = (row: BudgetRow) => {
    const isDb = typeof row.id === 'number';

    if (!isDb) {
      setBudgetRows(prev => prev.filter(r => r.id !== row.id));
      return;
    }

    setConfirmPopup({
      isOpen: true,
      type: 'confirm',
      title: '예산 삭제',
      message: '해당 예산 항목을 삭제하시겠습니까?',
      onConfirm: async () => {
        try {
          await fetch(`${API_BASE_URL}/api/budgets/${row.id}`, { method: 'DELETE' });
          await fetchBudgetData(cachedTreemapData);
        } catch (error) {
          console.error('예산 삭제 실패:', error);
        } finally {
          setConfirmPopup(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // ******************** 핸들러: FloatingSelectPopup ********************
  const openCategoryPopup = (
    e: React.MouseEvent,
    row: BudgetRow,
    type: 'major' | 'minor'
  ) => {
    const cell = e.currentTarget as HTMLElement;
    const rect = cell.getBoundingClientRect();
    const position = { top: rect.bottom, left: rect.left, width: rect.width };

    if (type === 'major') {
      const options = majorCategories.map(c => {
        const hasSpending = cachedTreemapData.some(tm => tm.name === c.name && tm.value > 0);
        return {
          value: String(c.id),
          label: c.name,
          unrecommended: !hasSpending
        }
      });
      const currentValue = row.major_category_id > 0 ? String(row.major_category_id) : '';

      floatingSelectRef.current?.open(
        options,
        currentValue,
        position,
        (value: string) => handleCategoryChange(row, 'major', Number(value)),
        '-- 대분류 --'
      );
    } else {
      if (row.major_category_id <= 0) return;

      const minorOptions = getMinorOptions(row.major_category_id);
      const majorName = getMajorCategoryName(row.major_category_id);
      const majorTreemap = cachedTreemapData.find(tm => tm.name === majorName);
      const options = [
        { value: '', label: '(대분류 전체)', unrecommended: !(majorTreemap && majorTreemap.value > 0) },
        ...minorOptions.map(c => {
          const hasSpending = majorTreemap?.children?.some(child => child.name === c.name && child.value > 0);
          return { value: c.uuid, label: c.name, unrecommended: !hasSpending };
        })
      ];
      const currentValue = row.minor_category_uuid || '';

      floatingSelectRef.current?.open(
        options,
        currentValue,
        position,
        (value: string) => handleCategoryChange(row, 'minor', value),
        '(대분류 전체)'
      );
    }
  };

  // ******************** 유틸리티 함수 ********************
  // const getProgressBarColor = (percentage: number) => {
  //   if (percentage > 100) return 'var(--color-highlight-2)'; // 빨간색
  //   else if (percentage > 80) return 'var(--color-highlight-6)';
  //   else if (percentage > 60) return 'var(--color-highlight-3)';
  //   else if (percentage > 40) return 'var(--color-highlight-4)';
  //   else if (percentage > 20) return 'var(--color-highlight-5)';
  //   else return 'var(--color-highlight-1)';
  // };
  const getProgressBarColor = (percentage: number) => {
    const colorStops = [
      { threshold: 0, color: 'var(--color-highlight-1)' },    // 0~20%
      { threshold: 20, color: 'var(--color-highlight-5)' },   // 20~40%
      { threshold: 40, color: 'var(--color-highlight-4)' },   // 40~60%
      { threshold: 60, color: 'var(--color-highlight-3)' },   // 60~80%
      { threshold: 80, color: 'var(--color-highlight-6)' },   // 80~100%
      { threshold: 100, color: 'var(--color-highlight-2)' }   // 100% 초과
    ];

    // 현재 구간 찾기
    for (let i = 0; i < colorStops.length - 1; i++) {
      const current = colorStops[i];
      const next = colorStops[i + 1];

      if (percentage >= current.threshold && percentage < next.threshold) {
        const rangeSize = next.threshold - current.threshold;  // 구간 크기 (20)
        const positionInRange = percentage - current.threshold; // 구간 내 위치

        // 구간 끝 5% 이내면 그라데이션, 아니면 단색
        if (positionInRange >= rangeSize - 5) {
          return `linear-gradient(to right, ${current.color}, 85%, ${next.color})`;
        }
        return current.color;  // 단색
      }
    }

    return colorStops[colorStops.length - 1].color;  // 100% 초과
  };

  const getMinorOptions = (majorId: number) => {
    return minorCategories.filter((mc) => mc.major_category_id === majorId);
  };

  const getMajorCategoryName = (id: number | undefined) => {
    if (!id) return null;
    return majorCategories.find((mc) => mc.id === id)?.name || null;
  };

  const getMinorCategoryName = (uuid: string | undefined) => {
    if (!uuid) return '';
    return minorCategories.find(mc => mc.uuid === uuid)?.name || '';
  };

  // ******************** 렌더링 ********************
  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h3 className="dashboard-card-title">월별 예산 관리
          <span className='dashboard-card-title subtle'>
            &nbsp;(총 예산: {budgetRows.reduce((sum, row) => sum + (row.amount || 0), 0).toLocaleString()}원)
          </span>
        </h3>
        <div className="heatmap-legend-mbudget">
          <span className="legend-item-mbudget">
            낮음
            <span className="legend-color-mbudget" style={{ backgroundColor: 'var(--color-highlight-1)' }}></span>
            <span className="legend-color-mbudget" style={{ backgroundColor: 'var(--color-highlight-5)' }}></span>
            <span className="legend-color-mbudget" style={{ backgroundColor: 'var(--color-highlight-4)' }}></span>
            <span className="legend-color-mbudget" style={{ backgroundColor: 'var(--color-highlight-3)' }}></span>
            <span className="legend-color-mbudget" style={{ backgroundColor: 'var(--color-highlight-6)' }}></span>
            <span className="legend-color-mbudget" style={{ backgroundColor: 'var(--color-highlight-2)' }}></span>
            높음
          </span>
        </div>
        <div className="dashboard-card-subtitle">
          {selectedYear && selectedMonth
            ? `${selectedYear}년 ${selectedMonth}월 기준`
            : '연도와 월을 선택하세요'}
        </div>
      </div>
      <div className="dashboard-card-content budget-card-content-mbudget">
        <div className="budget-table-container-mbudget">
          <table className="budget-table-mbudget">
            <thead>
              <tr>
                <th className="col-major-mbudget">대분류</th>
                <th className="col-minor-mbudget">소분류</th>
                <th className="col-spent-mbudget">사용금액</th>
                <th className="col-progress-mbudget">사용률</th>
                <th className="col-amount-mbudget">예산 설정</th>
              </tr>
            </thead>
            <tbody>
              {budgetRows.map((row) => {
                const isDb = typeof row.id === 'number';
                const isEditing = editingCell?.id === row.id;
                let spent_amount = 0;
                if (row.major_category_id > 0 && cachedTreemapData.length > 0) {
                  const majorName = isDb ? row.major_category_name : getMajorCategoryName(row.major_category_id);
                  if (row.minor_category_uuid) {
                    const minorName = isDb ? row.target_name : getMinorCategoryName(row.minor_category_uuid);
                    for (const major of cachedTreemapData) {
                      const minorData = major.children?.find((c) => c.name === minorName);
                      if (minorData) {
                        spent_amount = minorData.value;
                        break;
                      }
                    }
                  }
                  else {
                    const majorData = cachedTreemapData.find((m) => m.name === majorName);
                    spent_amount = majorData?.value || 0;
                  }
                }

                const percentage = row.amount > 0 && row.spent_amount
                  ? (row.spent_amount / row.amount) * 100
                  : 0;

                // 대분류/소분류 표시명
                const majorName = isDb
                  ? row.major_category_name
                  : (row.major_category_id > 0 ? getMajorCategoryName(row.major_category_id) : null);
                const minorName = isDb
                  ? (row.budget_type === 'minor' ? row.target_name : null)  // major인 경우 null 반환
                  : getMinorCategoryName(row.minor_category_uuid);

                return (
                  <tr key={row.id}>
                    {/* 대분류 */}
                    <td
                      className="clickable-cell-mbudget"
                      onClick={(e) => openCategoryPopup(e, row, 'major')}
                    >
                      {majorName || <span className="placeholder-mbudget">-- 대분류 --</span>}
                    </td>

                    {/* 소분류 */}
                    <td
                      className="clickable-cell-mbudget"
                      onClick={(e) => openCategoryPopup(e, row, 'minor')}
                    >
                      {row.major_category_id > 0 ? (
                        minorName ? (
                          minorName
                        ) : (
                          <span className="whole-category-mbudget">(대분류 전체)</span>
                        )
                      ) : (
                        <span className="placeholder-mbudget">-- 소분류 --</span>
                      )}
                    </td>

                    {/* 사용금액 */}
                    <td className="spent-cell-mbudget">
                      {row.major_category_id > 0 ? spent_amount.toLocaleString() : '-'}
                    </td>

                    {/* 사용률 */}
                    <td className="progress-cell-mbudget">
                      <div className="percentage-cell-mbudget">
                        {isDb && row.spent_amount !== undefined ? (
                          <>
                            <div
                              className="percentage-bar-fill-mbudget"
                              style={{
                                width: `${Math.min(percentage, 100)}%`,
                                background: getProgressBarColor(percentage)
                              }}
                            ></div>
                            <span className="percentage-text-mbudget">
                              {percentage.toFixed(1)}%
                            </span>
                          </>
                        ) : (
                          <span className="percentage-text-mbudget">-</span>
                        )}
                      </div>
                    </td>

                    {/* 예산 설정 */}
                    <td className={`amount-cell-mbudget ${isEditing ? 'editing-mbudget' : ''}`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-input-mbudget"
                          value={editValue}
                          onChange={(e) =>
                            setEditValue(e.target.value.replace(/[^0-9]/g, ''))
                          }
                          onBlur={handleEditSave}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave();
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className="amount-value-mbudget">
                            {row.amount > 0 ? row.amount.toLocaleString() : '0'}
                          </span>
                          <div className="cell-actions-mbudget">
                            <FaPen
                              className="action-icon-mbudget edit-icon-mbudget"
                              onClick={() => handleEditStart(row)}
                            />
                            <FaTrash
                              className="action-icon-mbudget delete-icon-mbudget"
                              onClick={() => handleDelete(row)}
                            />
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 행 추가 버튼 */}
          {budgetRows.length < 30 && (
            <div className="add-row-button-mbudget" onClick={handleAddRow}>
              <FaPlusCircle />
              <span>예산 항목 추가</span>
            </div>
          )}
        </div>
      </div>

      {/* 팝업 */}
      <ConfirmPopup
        isOpen={confirmPopup.isOpen}
        type={confirmPopup.type}
        title={confirmPopup.title}
        message={confirmPopup.message}
        onConfirm={confirmPopup.onConfirm}
        onCancel={() => setConfirmPopup(prev => ({ ...prev, isOpen: false }))}
      />
      <FloatingSelectPopup ref={floatingSelectRef} />
    </div>
  );
};

export default BudgetManagement;