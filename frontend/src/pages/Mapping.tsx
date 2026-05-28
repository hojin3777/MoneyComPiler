import { useState, useEffect, useMemo } from 'react';
import { DndContext, type DragEndEvent, type DragStartEvent, closestCenter, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';
import { FaSave, FaUndo } from 'react-icons/fa';
import { useDirty } from '../App';

import ConfirmPopup from '../components/ConfirmPopup';
import './Mapping.css';
import DraggableBertOutput from '../components/mapping/DraggableBertOutput';
import DroppableRow from '../components/mapping/DroppableRow';
import '../components/mapping/MappingComponents.css';
import OcrCorrectionPanel, { type OcrCorrection } from '../components/mapping/OcrCorrectionPanel';
import RuleBasedMappingPanel, { type RuleBasedMapping } from '../components/mapping/RuleBasedMappingPanel';

// API로부터 받을 데이터 타입 정의
export interface MinorCategory { uuid: string; name: string; }
export interface MajorCategory { id: number; name: string; minors: MinorCategory[]; }
export interface BertOutput { id: number; name: string; }
export interface MappingData {
  categories: MajorCategory[];
  bertOutputs: BertOutput[];
  mappings: { [key: string]: string };
  ocrCorrections: OcrCorrection[];
  ruleBasedMappings: RuleBasedMapping[];
}

const API_BASE_URL = 'http://127.0.0.1:5050';

const MappingPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MappingData | null>(null);
  // data state, popup state
  const [originalData, setOriginalData] = useState<MappingData | null>(null);
  const [confirmPopup, setConfirmPopup] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: (() => {}) as (() => void) | undefined, type: 'alert' as 'alert' | 'confirm' | 'destructive' });
  const [status, setStatus] = useState('');
  const [activeItem, setActiveItem] = useState<BertOutput | null>(null);
  // Dirty State
  const dirtyContext = useDirty();
  const isDirty = dirtyContext?.isDirty ?? false;
  const setIsDirty = dirtyContext?.setIsDirty ?? (() => {});

  // 페이지 이탈 방지 로직
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '저장되지 않은 변경 사항이 있습니다. 정말 페이지를 떠나시겠습니까?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ******* 데이터 관리 *******
  // 데이터 불러오기
  const fetchData = async () => {
    setLoading(true);
    setStatus('Loading...');
    try {
      const [mappingsRes, ocrRes, rulesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/mappings`),
        fetch(`${API_BASE_URL}/api/ocr-corrections`),
        fetch(`${API_BASE_URL}/api/rule-based-mappings`),
      ]);
      if (!mappingsRes.ok) throw new Error('Failed to fetch mapping data');
      if (!ocrRes.ok) throw new Error('Failed to fetch OCR correction data');
      if (!rulesRes.ok) throw new Error('Failed to fetch rule-based mapping data');

      const mappingsData = await mappingsRes.json();
      const ocrData = await ocrRes.json();
      const rulesData = await rulesRes.json();

      
      const combinedData: MappingData = {
        ...mappingsData,
        ocrCorrections: ocrData,
        ruleBasedMappings: rulesData || [],
      }

      setData(combinedData);
      setOriginalData(JSON.parse(JSON.stringify(combinedData))); // 원본 데이터 설정
      setStatus('Loaded successfully');
      setIsDirty(false);
    } catch (err: any) {
      setError(err.message);
      setStatus('Failed to load data');
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 저장 핸들러 (통합하도록 개선)
  const handleSave = async () => {
    if (!data || !isDirty) return;
    setStatus('Saving...');
    try {
      const savePromises = [];
      if (JSON.stringify(data.mappings) !== JSON.stringify(originalData?.mappings)) {
        savePromises.push(
          fetch(`${API_BASE_URL}/api/mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.mappings),
          })
        );
      }
      if (JSON.stringify(data.ocrCorrections) !== JSON.stringify(originalData?.ocrCorrections)) {
        savePromises.push(
          fetch(`${API_BASE_URL}/api/ocr-corrections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.ocrCorrections),
          })
        );
      }
      if (JSON.stringify(data.ruleBasedMappings) !== JSON.stringify(originalData?.ruleBasedMappings)) {
        savePromises.push(
          fetch(`${API_BASE_URL}/api/rule-based-mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.ruleBasedMappings),
          })
        );
      }
      const responses = await Promise.all(savePromises);
      responses.forEach(res => {
        if (!res.ok) throw new Error(`Failed to save some data: ${res.statusText}`);
      })

      setOriginalData(JSON.parse(JSON.stringify(data))); // 저장 성공 시, 현재 상태를 새 원본으로
      setIsDirty(false);
      setStatus('Saved successfully');
    } catch (err) {
      console.error(err);
      setStatus('Save failed');
      alert('매핑 저장에 실패했습니다.');
    } finally {
      setTimeout(() => setStatus(''), 3000);
    }
  };

  // 초기화 핸들러
  const handleReset = () => {
    setConfirmPopup({
      isOpen: true,
      type: 'destructive',
      title: '매핑 초기화',
      message: '모든 매핑 정보를 기본값으로 되돌리시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      onConfirm: async () => {
        setConfirmPopup(prev => ({ ...prev, isOpen: false }));
        setStatus('Resetting...');
        try {
            const response = await fetch(`${API_BASE_URL}/api/mappings/reset`, { method: 'POST' });
            if (!response.ok) throw new Error('Failed to reset mappings');
            await fetchData(); // 초기화된 데이터를 다시 불러옴
            setStatus('Reset successfully');
        } catch (err) {
            console.error(err);
            setStatus('Reset failed');
            alert('초기화에 실패했습니다.');
        } finally {
            setTimeout(() => setStatus(''), 3000);
        }
      },
      onCancel: () => setConfirmPopup(prev => ({ ...prev, isOpen: false })),
    });
  };


  // ******* 카테고리-딥러닝 출력 매핑 *******
  // 드래그 시작 시 activeItem 설정 핸들러
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = data?.bertOutputs.find(o => `draggable-${o.id}` === active.id);
    if (item) {
      setActiveItem(item);
    }
  };
  // 드래그 앤 드롭 완료 시 실행될 핸들러
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const bertId = active.data.current?.bertId;
    if (bertId === undefined) return;

    const oldMinorUuid = data?.mappings[bertId];
    const newMinorUuid = over.data.current?.minorCategoryUuid;

    if (oldMinorUuid === newMinorUuid) return;

    setData(prevData => {
      if (!prevData) return null;
      const newMappings = {...prevData.mappings };
      if (newMinorUuid) {
        newMappings[bertId] = newMinorUuid;
      } else {
        delete newMappings[bertId];
      }
      return { ...prevData, mappings: newMappings };
    });
    setIsDirty(true);
  };

  // ******* 렌더링 *******
  // 데이터 가공
  const { unmappedOutputs, outputsByMinorCategory } = useMemo(() => {
    if (!data) return { unmappedOutputs: [], outputsByMinorCategory: new Map<string, BertOutput[]>() };

    const unmapped: BertOutput[] = [];
    const byMinor = new Map<string, BertOutput[]>();
    const mappedIds = new Set(Object.keys(data.mappings).map(Number));

    data.categories.forEach(major => major.minors.forEach(minor => byMinor.set(minor.uuid, [])));

    for (const bertIdStr in data.mappings) {
      const bertId = Number(bertIdStr);
      const minorUuid = data.mappings[bertIdStr];
      const output = data.bertOutputs.find(o => o.id === bertId);
      if (output && byMinor.has(minorUuid)) {
        byMinor.get(minorUuid)!.push(output);
      }
    }
    data.bertOutputs.forEach(output => {
      if (!mappedIds.has(output.id)) unmapped.push(output);
    });
  return { unmappedOutputs: unmapped, outputsByMinorCategory: byMinor };
  }, [data]);



  const sensors = useSensors( useSensor(PointerSensor, { activationConstraint: { distance: 5 } }) );
  if (loading && !data) return <div className="status-message">Loading...</div>;
  if (error) return <div className="status-message error">{error}</div>;
  if (!data) return <div className="status-message">No data available.</div>;

  return (
    // ✨ 7. 전체 레이아웃 구조 변경
    <div className="mapping-page-wrapper">
      <header className="main-header">
        <div className="header-title-group">
          <h1>Mapping</h1>
          <div className="header-actions">
            <span className="status-text">{status}</span>
            <button className={`icon-button-round ${isDirty ? 'active' : ''}`} onClick={handleSave} title="Save Changes" disabled={!isDirty}><FaSave /></button>
            <button className="icon-button-round" onClick={handleReset} title="Reset Mappings"><FaUndo /></button>
          </div>
        </div>
      </header>
      <div className="mapping-page">
        <div className="mapping-left-panel">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
          {/* ✨ 실제 매핑 테이블 렌더링 */}
          <table className="mapping-table">
            <colgroup>
              <col style={{ width: '120px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: 'auto' }} />
            </colgroup>
            {/* 헤더는 시각적으로 숨김 처리 */}
            <thead style={{ display: 'none' }}>
              <tr>
                <th>대분류</th>
                <th>중분류</th>
                <th>매핑된 딥러닝 출력</th>
              </tr>
            </thead>
            <tbody>
              {/* 미분류 행 */}
              <tr>
                <td colSpan={2} className="minor-category-cell" style={{textAlign: 'center', fontWeight: 'bold'}}>미분류</td>
                <td className="mapped-outputs-cell">
                  <DroppableRow id="unmapped-droppable-area" data={{ minorCategoryUuid: null }}>
                    <div className="mapped-outputs-container">
                      {unmappedOutputs.map((item: BertOutput) => <DraggableBertOutput key={item.id} item={item} />)}
                    </div>
                  </DroppableRow>
                </td>
              </tr>
              {/* 카테고리 행 */}
              {data.categories.map((major) => (
                major.minors.map((minor, minorIndex) => (
                  <tr key={minor.uuid}>
                    {minorIndex === 0 && (
                      <td rowSpan={major.minors.length} className="major-category-cell">
                        {major.name}
                      </td>
                    )}
                    <td className="minor-category-cell">{minor.name}</td>
                    <td className="mapped-outputs-cell">
                      <DroppableRow id={`droppable-${minor.uuid}`} data={{ minorCategoryUuid: minor.uuid }}>
                        <div className="mapped-outputs-container">
                          {outputsByMinorCategory.get(minor.uuid)?.map((item: BertOutput) => (
                            <DraggableBertOutput key={item.id} item={item} />
                          ))}
                        </div>
                      </DroppableRow>
                    </td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
          <DragOverlay modifiers={[restrictToFirstScrollableAncestor]}>
            {activeItem ? <DraggableBertOutput item={activeItem} isOverlay={true}/> : null}
          </DragOverlay>
          </DndContext>
        </div>

        {/* 오른쪽 패널 */}
        <div className="mapping-right-panel">
          <OcrCorrectionPanel
            data={data.ocrCorrections}
            initialData={originalData?.ocrCorrections || []}
            onUpdate={(newOcrData) => {
              setData(prevData => {
                if (!prevData) return null;
                return { ...prevData, ocrCorrections: newOcrData };
              });
              setIsDirty(true);
            }}
          />
            <RuleBasedMappingPanel
              data={data.ruleBasedMappings}
              categories={data.categories}
              initialData={originalData?.ruleBasedMappings || []}
              onUpdate={(newRuleData) => {
                setData(prevData => {
                  if (!prevData) return null;
                  return { ...prevData, ruleBasedMappings: newRuleData };
                });
                setIsDirty(true);
              }}
            />
        </div>
      </div>
      <ConfirmPopup {...confirmPopup} />
    </div>
  );
};

export default MappingPage;