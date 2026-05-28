import React, { useState } from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';

// 타입 정의
export interface OcrCorrection {
  id: number | string; // DB에서 올 때는 number, 새로 추가될 때는 string(uuid)
  original_text: string;
  corrected_text: string;
}

interface Props {
  data: OcrCorrection[];
  initialData: OcrCorrection[];
  onUpdate: (newData: OcrCorrection[]) => void;
}

const OcrCorrectionPanel: React.FC<Props> = ({ data, onUpdate }) => {
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ id: number | string; field: keyof Omit<OcrCorrection, 'id'>; originalValue: string } | null>(null);

  const handleInputChange = (id: number | string, field: 'original_text' | 'corrected_text', value: string) => {
    const updatedData = data.map(item =>
        item.id === id ? { ...item, [field]: value } : item
    );
    onUpdate(updatedData);
  };

  const handleKewDown = (e: React.KeyboardEvent<HTMLInputElement>, id: number | string, field: 'original_text' | 'corrected_text') => {
    if (e.key === 'Enter') {
        e.currentTarget.blur();
    } else if (e.key === 'Escape') {
        if (editingCell) {
            const revertedData = data.map(item =>
                item.id === id ? { ...item, [field]: editingCell.originalValue } : item
            );
            onUpdate(revertedData);
        }
        e.currentTarget.blur();
    }
};

  const handleAddRow = () => {
    const newId = `new-${crypto.randomUUID()}`; // 임시 고유 ID
    const updatedData = [...data, { id: newId, original_text: '', corrected_text: '' }];
    onUpdate(updatedData);
  };

  const handleDeleteRows = () => {
    const updatedData = data.filter(item => !selectedIds.has(item.id));
    onUpdate(updatedData);
    setSelectedIds(new Set());
  };

  const handleSelectRow = (id: number | string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
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
    <div className="rule-panel">
      <div className="rule-panel-header">
        <h3>OCR 결과 자동보정</h3>
        <div className="rule-panel-actions">
          {hasSelection ? (
          <>
            <button onClick={handleDeleteRows} className="icon-button-square-primary" title="선택한 항목 삭제">
              <FaTrash />
            </button>
            <button onClick={handleAddRow} className="icon-button-square" title="규칙 추가">
              <FaPlus />
            </button>
          </>
          ) : (
            <button onClick={handleAddRow} className="icon-button-square" title="규칙 추가">
              <FaPlus />
            </button>
          )}
        </div>
      </div>
      <div className="rule-panel-body">
        <table className="rule-table">
          <colgroup>
            <col style={{ width: '40px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: 'auto' }} />
          </colgroup>
          <thead>
            <tr>
              <th><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} /></th>
              <th>매핑 원본</th>
              <th>매핑 대상</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr key={item.id} className={selectedIds.has(item.id) ? 'selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => handleSelectRow(item.id)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.original_text}
                    onChange={(e) => handleInputChange(item.id, 'original_text', e.target.value)}
                    onFocus={(e) => setEditingCell({ id: item.id, field: 'original_text', originalValue: e.target.value})}
                    onKeyDown={(e) => handleKewDown(e, item.id, 'original_text')}
                    onBlur={() => setEditingCell(null)}
                    className="rule-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.corrected_text}
                    onChange={(e) => handleInputChange(item.id, 'corrected_text', e.target.value)}
                    onFocus={(e) => setEditingCell({ id: item.id, field: 'corrected_text', originalValue: e.target.value})}
                    onKeyDown={(e) => handleKewDown(e, item.id, 'corrected_text')}
                    onBlur={() => setEditingCell(null)}
                    className="rule-input"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OcrCorrectionPanel;