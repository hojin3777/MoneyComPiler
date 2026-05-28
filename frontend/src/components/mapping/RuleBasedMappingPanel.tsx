import React, { useState } from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';

export type RuleBasedMapping = {
  id: number | string;
  merchant_name: string;
  major_category_id?: number | '';
  minor_category_uuid: string;
  minor_category_name?: string;
};
export type MajorCategory = { id: number; name: string; minors: { uuid: string; name: string }[] };

interface Props {
  data: RuleBasedMapping[];
  initialData: RuleBasedMapping[];
  categories: MajorCategory[];
  onUpdate: (newData: RuleBasedMapping[]) => void;
}

const RuleBasedMappingPanel: React.FC<Props> = ({ data, categories, onUpdate }) => {
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [editingCell, setEditingCell] = useState<{
    id: number | string;
    field: 'merchant_name' | 'major_category_id' | 'minor_category_uuid';
    originalValue: string;
    originalMinor?: string;
  } | null>(null);

  // 변경을 데이터에 반영
  const handleInputChange = (id: number | string, field: 'merchant_name' | 'minor_category_uuid' | 'major_category_id', value: string | number) => {
    const updated: RuleBasedMapping[] = data.map(item => {
      if (item.id !== id) return item;
      if (field === 'major_category_id') {
        return { ...item, major_category_id: value === '' ? '' : Number(value), minor_category_uuid: '' };
      }
      return { ...item, [field]: value };
    });
    onUpdate(updated);
  };

  // 편집 중 키 이벤트 처리: Enter -> blur(확정), Escape -> 롤백 후 blur
  const handleKeyDown = (e: React.KeyboardEvent<any>, id: number | string, field: 'merchant_name' | 'major_category_id' | 'minor_category_uuid') => {
    if (e.key === 'Enter') {
      // Enter는 현재 값이 이미 onChange로 반영되어 있으므로 blur로 편집 종료
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      if (editingCell && editingCell.id === id && editingCell.field === field) {
        const origMajor: number | '' = editingCell.originalValue === '' ? '' : Number(editingCell.originalValue);
        const reverted: RuleBasedMapping[] = data.map(item => {
          if (item.id !== id) return item;
          if (field === 'major_category_id') {
            return {
              ...item,
              major_category_id: origMajor,
              minor_category_uuid: editingCell.originalMinor ?? ''
            };
          }
          return { ...item, [field]: editingCell.originalValue };
        });
        onUpdate(reverted);
      }
      (e.target as HTMLElement).blur();
    }
  };

  const handleAddRow = () => {
    const newId = `new-${crypto.randomUUID()}`;
    const newItem: RuleBasedMapping = { id: newId, merchant_name: '', major_category_id: '', minor_category_uuid: '' };
    onUpdate([...data, newItem]);
  };

  const handleDeleteRows = () => {
    const updated = data.filter(item => !selectedIds.has(item.id));
    onUpdate(updated);
    setSelectedIds(new Set());
  };

  const handleSelectRow = (id: number | string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(data.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = data.length > 0 && selectedIds.size === data.length;
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="rule-panel spaced">
      <div className="rule-panel-header">
        <h3>상호명 - 카테고리 룰베이스 매핑</h3>
        <div className="rule-panel-actions">
          {hasSelection ? (
            <>
              <button onClick={handleDeleteRows} className="icon-button-square-primary" title="선택한 항목 삭제"><FaTrash/></button>
              <button onClick={handleAddRow} className="icon-button-square" title="규칙 추가"><FaPlus/></button>
            </>
          ) : (
            <button onClick={handleAddRow} className="icon-button-square" title="규칙 추가"><FaPlus/></button>
          )}
        </div>
      </div>
      <div className="rule-panel-body">
        <table className="rule-table">
          <colgroup>
            <col style={{ width: '40px' }} />
            <col style={{ width: '40%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '30%' }} />
          </colgroup>
          <thead>
            <tr>
              <th><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} /></th>
              <th>상호명</th>
              <th>대분류</th>
              <th>소분류</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => {
              // major 우선: 데이터에 major_category_id가 있으면 사용, 없으면 minor_uuid로 유추
              const inferredMajor = categories.find(m => m.minors.some(x => x.uuid === item.minor_category_uuid));
              const majorIdForRow = item.major_category_id !== undefined && item.major_category_id !== '' ? item.major_category_id : (inferredMajor ? inferredMajor.id : '');
              const majorsSelected = categories.find(m => m.id === majorIdForRow) || null;
              const minorsForMajor = majorsSelected ? majorsSelected.minors : [];

              return (
                <tr key={String(item.id)} className={selectedIds.has(item.id) ? 'selected' : ''}>
                  <td>
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => handleSelectRow(item.id)} />
                  </td>
                  <td>
                    <input
                      className="rule-input"
                      type="text"
                      value={item.merchant_name}
                      onChange={(e) => handleInputChange(item.id, 'merchant_name', e.target.value)}
                      onFocus={() => setEditingCell({ id: item.id, field: 'merchant_name', originalValue: item.merchant_name })}
                      onBlur={() => setEditingCell(null)}
                      onKeyDown={(e) => handleKeyDown(e, item.id, 'merchant_name')}
                    />
                  </td>
                  <td>
                    <select
                      className="rule-input"
                      value={majorIdForRow === '' ? '' : String(majorIdForRow)}
                      onChange={(e) => {
                        const newMajorId = e.target.value === '' ? '' : Number(e.target.value);
                        handleInputChange(item.id, 'major_category_id', newMajorId);
                      }}
                      onFocus={() => setEditingCell({ id: item.id, field: 'major_category_id', originalValue: String(item.major_category_id ?? ''), originalMinor: item.minor_category_uuid ?? '' })}
                      onBlur={() => setEditingCell(null)}
                      onKeyDown={(e) => handleKeyDown(e as React.KeyboardEvent<HTMLSelectElement>, item.id, 'major_category_id')}
                    >
                      <option value="">{'-- 대분류 --'}</option>
                      {categories.map(major => (
                        <option key={major.id} value={String(major.id)}>{major.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="rule-input"
                      value={item.minor_category_uuid || ''}
                      onChange={(e) => handleInputChange(item.id, 'minor_category_uuid', e.target.value)}
                      disabled={!majorIdForRow}
                      onFocus={() => setEditingCell({ id: item.id, field: 'minor_category_uuid', originalValue: item.minor_category_uuid ?? '' })}
                      onBlur={() => setEditingCell(null)}
                      onKeyDown={(e) => handleKeyDown(e as React.KeyboardEvent<HTMLSelectElement>, item.id, 'minor_category_uuid')}
                    >
                      <option value="">{'-- 소분류 --'}</option>
                      {minorsForMajor.map(minor => (
                        <option key={minor.uuid} value={minor.uuid}>{minor.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 12 }}>
                  규칙이 없습니다. 오른쪽 상단의 + 버튼으로 추가하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RuleBasedMappingPanel;