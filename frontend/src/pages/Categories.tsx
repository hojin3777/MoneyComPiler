import React, { useState, useEffect, useRef } from 'react';
import { useDirty } from '../App';
import { FaPlusCircle, FaPen, FaTrash, FaSave, FaUndo } from 'react-icons/fa';
import ConfirmPopup from '../components/ConfirmPopup';
import './Categories.css';

// 타입 정의
type Account = {id: number | string; name: string};
type MinorCategory = { uuid: string; name: string };
type CategoryItem = { id: number | string; name: string; minors: MinorCategory[]};
type CategoriesData = CategoryItem[];
type EditingState = 
  | { type: 'account'; id: number | string}
  | { type: 'major'; id: number | string }
  | { type: 'minor'; majorId: number | string; minorUuid: string };
type AlertInfo = {
  isOpen: boolean;
  type?: 'input' | 'confirm' | 'alert' | 'destructive';
  message: string;
  onConfirm: (value?: string) => void;
  onCancel?: () => void;
  title?: string;
  placeholder?: string;
}

// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5050';
const API_BASE_URL = 'http://127.0.0.1:5050'; // 개발 시
const Categories = () => {
  // vars
  const constCategories = ['고정수입', '유동수입', '이체분류'];
  //states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoriesData>([]);
  const [status, setStatus] = useState('Loading...');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [_originalEditValue, setOriginalEditValue] = useState<string>('');
  const [alertInfo, setAlertInfo] = useState<AlertInfo>({ isOpen: false, message: '', onConfirm: () => {} });
  const inputRef = useRef<HTMLInputElement>(null);
  // Dirty states
  const dirtyContext = useDirty();
  const isDirty = dirtyContext?.isDirty ?? false;
  const setIsDirty = dirtyContext?.setIsDirty ?? (() => {});
  

  // 경고 이벤트 리스너 등록
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '저장되지 않은 변경 사항이 있습니다. 정말 페이지를 떠나시겠습니까?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]); // isDirty 상태가 변경될 때마다 이 효과를 다시 실행

  // ******* 단축키 저장 이벤트 *******
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          if(isDirty){
            handleSave();
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDirty, accounts, categories]);

  // ******* 데이터 로딩 *******
  const fetchAllData = async () => {
    try {
      setStatus('Loading...');
      const accountsRes = await fetch(`${API_BASE_URL}/api/accounts`);
      const categoriesRes = await fetch(`${API_BASE_URL}/api/categories`);
      if (!accountsRes.ok || !categoriesRes.ok) { throw new Error('Failed to fetch data from server.');}

      const accountsData = await accountsRes.json();
      const categoriesData = await categoriesRes.json();

      setAccounts(accountsData); 
      setCategories(categoriesData);
      
      setIsDirty(false);
      setStatus('');
    } catch (error) {
      console.error("Failed to fetch Data:", error);
      setStatus('Failed to load Data.');
    }
  };

  useEffect(() => { fetchAllData(); }, []);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  // ******* 전체 데이터 저장 *******
  const handleSave = async () => {
    try {
      // 계좌 먼저 저장
      setStatus('Saving Accounts...');
      const accountsRes = await fetch(`${API_BASE_URL}/api/accounts`,{
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accounts),
      });
      if (!accountsRes.ok) {
        const errorText = await accountsRes.text();
        console.error('Failed to save accounts:', errorText);
        throw new Error(`계좌 저장 실패: ${accountsRes.statusText}`);
      }
      const savedAccounts = await accountsRes.json();
      setAccounts(savedAccounts);

      // 계좌 저장 후 카테고리 저장
      setStatus('Saving Categories...');
      // const categoriesToSave = categories.map(cat => ({
      //   id: cat.id,
      //   name: cat.name,
      //   minors: cat.minors
      // }));
      const categoriesRes = await fetch(`${API_BASE_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categories),
      });
      setStatus('Saved successfully.');
      if (!categoriesRes.ok) {
        const errorText = await categoriesRes.text();
        setStatus('Failed to save categories.');
        console.error('Failed to save categories:', errorText);
        throw new Error(`카테고리 저장 실패: ${categoriesRes.statusText}`);
      }
      const savedCategories = await categoriesRes.json();
      setCategories(savedCategories);
      setIsDirty(false);
      
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      console.error('Save failed:', error);
      setStatus(`Save failed: ${message}`)
      await fetchAllData(); // 저장 실패 시 데이터 다시 불러오기
    }
  };

  // ******* 편집 관련 함수 *******
  const startEditing = (state: EditingState) => {
    if (state.type === 'account') {
      const account = accounts.find(acc => acc.id === state.id);
      if (account){
        setOriginalEditValue(account.name);
      }
    } else if (state.type === 'major') {
      const category = categories.find(c => c.id === state.id);
      if (category){
        setOriginalEditValue(category.name);
      }
    } else if (state.type === 'minor') {
      const majorCategory = categories.find(c => c.id === state.majorId);
      const minorCategory = majorCategory?.minors.find(m => m.uuid === state.minorUuid);
      if (minorCategory) {
        setOriginalEditValue(minorCategory.name);
      }
    }
    setEditing(state);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCategoryEditCommit((e.target as HTMLInputElement).value);
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  };

  const handleAccountEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: number | string) => {
    if (e.key === 'Enter') {
      handleAccountEditCommit((e.target as HTMLInputElement).value, id);
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  };

  // ******* 계좌 관련 함수 *******
  // *** 계좌 추가 ***
  const addAccount = () => {
    setAlertInfo({
      isOpen: true, type: 'input', message: '새로운 계좌 이름을 입력하세요:', placeholder: '계좌 이름 입력',
      onConfirm: (newName) => {
        if (newName && !accounts.some(acc => acc.name === newName)) {
          const newAccount: Account = { id: `tmp-${crypto.randomUUID()}`, name: newName };
          setAccounts(prev => [...prev, newAccount]);
          setIsDirty(true);
      }
        setAlertInfo({ ...alertInfo, isOpen: false });
      },
      onCancel: () => {
        setAlertInfo({ ...alertInfo, isOpen: false });
      }
    });
  };

  // *** 계좌 삭제 ***
  const deleteAccount = async (id: number | string) => {
    const account = accounts.find(acc => acc.id === id);
    if (!account) return;
    // 최소 1개의 계좌는 유지
    if(accounts.length <= 1) {
      setAlertInfo({
        isOpen: true, type: 'alert', message: '최소 1개의 계좌는 유지해야 합니다.',
        onConfirm: () => setAlertInfo({ ...alertInfo, isOpen: false }),
      });
      return;
    }
    // 계좌 사용 여부 확인(id가 number인 경우 체크)
    if(typeof id === 'number'){
      const usageCheckResponse = await fetch(`${API_BASE_URL}/api/accounts/usage?id=${id}`)
      const usageData = await usageCheckResponse.json();
      if (usageData.in_use) {
      // if(false){ // 테스트용으로 항상 false 처리
        setAlertInfo({
          isOpen: true,
          type: 'alert',
          message: `계좌 '${account.name}'은(는)\n거래내역에서 사용 중이므로 삭제할 수 없습니다.`,
          onConfirm: () => setAlertInfo({ ...alertInfo, isOpen: false }),
        });
        return;
      }
    }
    
    // 위 조건들을 통과한 경우에만 삭제 확인 팝업 표시
    setAlertInfo({
      isOpen: true, type: 'confirm', message: `'${account.name}' 계좌를 정말 삭제하시겠습니까?`,
      onConfirm: () => {
        setAccounts(prev => prev.filter(acc => acc.id !== id));
        setIsDirty(true);
        setAlertInfo({ ...alertInfo, isOpen: false });
      },
      onCancel: () => setAlertInfo({ ...alertInfo, isOpen: false }),
    });
  }

  // *** 계좌 편집 완료 처리 ***
  const handleAccountEditCommit = (newValue: string, id: number | string) => {
    const trimmedValue = newValue.trim();
    const originalValue = accounts.find(acc => acc.id === id);
    if(trimmedValue && originalValue && trimmedValue !== originalValue.name && !accounts.some(acc => acc.name === trimmedValue)){
      setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, name: trimmedValue } : acc));
      setIsDirty(true);
    }
    setEditing(null);
  };

  // *** 계좌 항목 렌더링 ***
  const renderAccountItem = (account: Account) => {
    const isEditing = editing?.type === 'account' && editing.id === account.id;
    return isEditing ? (
      <input
        key={`editing-${account.id}`}
        ref={inputRef}
        type="text"
        defaultValue={account.name}
        onBlur={(e) => handleAccountEditCommit(e.target.value, account.id)}
        onKeyDown={(e) => handleAccountEditKeyDown(e, account.id)}
        className="inline-edit-input"
      />
    ) : (
      <div key={account.id} className='category-item' onDoubleClick={() => startEditing({ type: 'account', id: account.id })}>
        <span>{account.name}</span>
        <div className="item-actions">
          <FaPen className="action-icon edit" onClick={() => startEditing({ type: 'account', id: account.id })} />
          <FaTrash className="action-icon delete" onClick={() => deleteAccount(account.id)} />
        </div>
      </div>
    );
  }

  // ******* 카테고리 관련 함수 *******
  // *** 카테고리 초기화 ***
  const handleReset = () => {
    setAlertInfo({
      isOpen: true,
      type: 'destructive',
      title: '카테고리 초기화 경고',
      message: '모든 계좌와 카테고리를 기본값으로 초기화하시겠습니까?\n초기화 전 거래내역 엑셀 백업을 권장합니다.',
      onConfirm: async () => {
        setAlertInfo({ ...alertInfo, isOpen: false });
        setStatus('Resetting...');
        try {
          const response = await fetch(`${API_BASE_URL}/api/categories/defaults`);
          const defaultData = await response.json();
          setCategories(defaultData);
          setIsDirty(true);
          setStatus('Reset successfully!');
        } catch (error) {
          console.error('Failed to reset categories:', error);
          setStatus('Failed to reset categories.');
        }
        setTimeout(() => setStatus(''), 3000);
      },
      // onConfirm: async () => {
      //   setAlertInfo({ ...alertInfo, isOpen: false });
      //   setStatus('Resetting...');
      //   await fetch(`${API_BASE_URL}/api/initialize-defaults`, { method: 'POST' });
      //   await fetchAllData(); // 초기화 후 데이터 다시 불러오기

      //   setIsDirty(false);
      //   setStatus('Reset successfully!');
      //   setTimeout(() => setStatus(''), 3000);
      // },
      onCancel: () => setAlertInfo({ ...alertInfo, isOpen: false }),
    });
  };

  // *** 대분류 추가 ***
  const addMajorCategory = () => {
    if (categories.length >= 30) return;
    setAlertInfo({
      isOpen: true,  
      type: 'input',
      message: '새로운 대분류 이름을 입력하세요:',
      placeholder: '대분류 이름 입력',
      onConfirm: (newMajorName) => {
        if (newMajorName && !categories.find(c => c.name === newMajorName)) {
          const newMajorCategory: CategoryItem = { id: `tmp-${crypto.randomUUID()}`, name: newMajorName, minors: [] };
          setCategories(prev => [...prev, newMajorCategory]);
          setIsDirty(true);
        }
        setAlertInfo({ ...alertInfo, isOpen: false });
      },
      onCancel: () => setAlertInfo({ ...alertInfo, isOpen: false }),
    });
  }

  // *** 소분류 추가 ***
  const addMinorCategory = (majorid: number | string) => {
    const category = categories.find(c => c.id === majorid);
    if (!category || category.minors.length >= 20) return;
    setAlertInfo({
      isOpen: true,
      type: 'input',
      message: `${category.name}에 추가할 소분류 이름을 입력하세요:`,
      placeholder: '소분류 이름 입력',
      onConfirm: (newMinorName) => {
        if (newMinorName) {
          const newMinor: MinorCategory = { name: newMinorName, uuid: `tmp-${crypto.randomUUID()}` };
          setCategories(prev => prev.map(c =>
            c.id === majorid ? { ...c, minors: [...c.minors, newMinor] } : c
          ));
          setIsDirty(true);
        }
        setAlertInfo({ ...alertInfo, isOpen: false });
      },
      onCancel: () => setAlertInfo({ ...alertInfo, isOpen: false }),
    });
  };

  // *** 대분류 삭제 ***
  const deleteMajorCategory = async (majorid: number | string) => {
    const category = categories.find(c => c.id === majorid);
    if (!category || constCategories.includes(category.name)) return;
    const isTempMajor = typeof majorid === 'string' && majorid.startsWith('tmp-'); // 임시 대분류는 사용 여부 확인 없이 바로 삭제
    if (!isTempMajor) {
      // 기존 소분류가 있는 경우: 사용 중인 항목이 하나라도 있는지 검증
      const existingMinors = category.minors.filter(minor => !minor.uuid.startsWith('tmp-')); // 임시 항목 제외
      if (existingMinors.length > 0) {
        try {
          const usageChecks = await Promise.all(
            existingMinors.map(minor => fetch(`${API_BASE_URL}/api/categories/usage?uuid=${minor.uuid}`)
            .then(res => res.json())
            .then(data => ({ minor, in_use: data.in_use })))
          );
          const usedMinorObj = usageChecks.find(usage => usage.in_use);
          if(usedMinorObj) {
            setAlertInfo({
              isOpen: true,
              type: 'alert',
              message: `대분류 '${category.name}' 하위에 거래내역에서 사용 중인\n소분류 '${usedMinorObj.minor.name}' 항목이 있어 삭제할 수 없습니다.`,
              onConfirm: () => setAlertInfo(prev => ({ ...prev, isOpen: false })),
            });
            return;
          }
        } catch (error) {
          console.error('Failed to check category usage:', error);
          return;
        }
      }
    }
    // 검증을 통과하거나 임시 대분류인 경우
    setAlertInfo({
      isOpen: true,
      type: 'destructive',
      title: '대분류 삭제',
      message: `'${category.name}' 대분류와 모든 하위 항목을 삭제하시겠습니까?`,
      onConfirm: () => {
        setCategories(prev => prev.filter(c => c.id !== majorid));
        setIsDirty(true);
        setAlertInfo({ ...alertInfo, isOpen: false });
      },
      onCancel: () => setAlertInfo({ ...alertInfo, isOpen: false }),
    });
  };

  // *** 소분류 삭제 ***
  const deleteMinorCategory = async (majorId: number | string, minorUuid: string) => {
    const majorCategory = categories.find(c => c.id === majorId);
    const minorCategory = majorCategory?.minors.find(m => m.uuid === minorUuid);
    if (!majorCategory || !minorCategory) return;
    // 최소 1개의 소분류는 유지
    if(majorCategory.minors.length <= 1) {
      setAlertInfo({
        isOpen: true, type: 'alert', message: '최소 1개의 소분류는 유지해야 합니다.',
        onConfirm: () => setAlertInfo({ ...alertInfo, isOpen: false }),
      });
      return;
    }
    // 소분류 사용 여부 확인(uuid가 있는 경우에만 체크), 임시항목은 API호출 없이 바로 삭제
    if(!minorUuid.startsWith('tmp-')) {
      const usageCheckResponse = await fetch(`${API_BASE_URL}/api/categories/usage?uuid=${minorUuid}`);
      const usageData = await usageCheckResponse.json();
      if (usageData.in_use) {
        setAlertInfo({
          isOpen: true,
          type: 'alert',
          message: `카테고리 '${majorCategory?.name}-${minorCategory.name}'은(는)\n거래내역에서 사용 중이므로 삭제할 수 없습니다.`,
          onConfirm: () => setAlertInfo({ ...alertInfo, isOpen: false }),
        });
        return;
      }
    }

    setAlertInfo({
      isOpen: true,
      type: 'confirm',
      message: `'${minorCategory.name}' 항목을 정말 삭제하시겠습니까?`,
      onConfirm: () => {
        setCategories(prev => prev.map(c => {
          if (c.id !== majorId) return c;
          const updatedMinors = c.minors.filter(m => m.uuid !== minorUuid);
          return { ...c, minors: updatedMinors };
      }));
        setIsDirty(true);
        setAlertInfo({ ...alertInfo, isOpen: false });
      },
      onCancel: () => setAlertInfo({ ...alertInfo, isOpen: false }),
    });
  };

  // *** 카테고리 편집 완료 처리 ***
  const handleCategoryEditCommit = (newValue: string) => {
    if (!editing || !newValue) {
      setEditing(null);
      return;
    }
    const trimmedValue = newValue.trim();
    let isChanged = false;
    if (editing.type === 'major') {
      const originalCategory = categories.find(c => c.id === editing.id);
      if (trimmedValue && originalCategory && trimmedValue !== originalCategory.name && !categories.some(c => c.name === trimmedValue)) {
        setCategories(prev => prev.map(c => c.id === editing.id ? { ...c, name: trimmedValue } : c));
        isChanged = true;
      }
    } else if (editing.type === 'minor') {
      const majorCategory = categories.find(c => c.id === editing.majorId);
      const originalMinor = majorCategory?.minors.find(m => m.uuid === editing.minorUuid);
      if (trimmedValue && originalMinor && trimmedValue !== originalMinor.name) {
        setCategories(prev => prev.map(c => {
          if (c.id !== editing.majorId) return c;
          const newMinors = c.minors.map(m => m.uuid  === editing.minorUuid ? { ...m, name: trimmedValue } : m);
          return { ...c, minors: newMinors };
        }));
        isChanged = true;
      }
    }
    if (isChanged) setIsDirty(true);
    setEditing(null);
  };

  // *** 소분류 항목 렌더링 ***
  const renderItem = (majorId: number | string, minor: MinorCategory) => {
    const isEditing = editing?.type === 'minor' && editing.majorId === majorId && editing.minorUuid === minor.uuid;
    return isEditing ? (
      <input
        ref={inputRef}
        type="text"
        defaultValue={minor.name}
        onBlur={(e) => handleCategoryEditCommit(e.target.value)}
        onKeyDown={handleEditKeyDown}
        className="inline-edit-input"
      />
    ) : (
      <div key={minor.uuid} className="category-item" onDoubleClick={() => startEditing({ type: 'minor', majorId, minorUuid: minor.uuid })}>
        <span>{minor.name}</span>
        <div className="item-actions">
          <FaPen className="action-icon edit" onClick={() => startEditing({ type: 'minor', majorId, minorUuid: minor.uuid })} />
          <FaTrash className="action-icon delete" onClick={() => deleteMinorCategory(majorId, minor.uuid)} />
        </div>
      </div>
    );
  };

  // *** 대분류 헤더 렌더링 ***
  const renderHeader = (category: CategoryItem) => {
    const isEditing = editing?.type === 'major' && editing.id === category.id;
    const isProtected = constCategories.includes(category.name);
    return isEditing ? (
      <input
        ref={inputRef}
        type="text"
        defaultValue={category.name}
        onBlur={(e) => handleCategoryEditCommit(e.target.value)}
        onKeyDown={handleEditKeyDown}
        className='inline-edit-input header-edit'
      />
    ) : (
      <div className="card category-header" onDoubleClick={() => !isProtected && startEditing({ type: 'major', id: category.id })}>
        <span>{category.name}</span>
        {!isProtected && (
          <div className="item-actions">
            <FaPen className="action-icon edit" onClick={() => startEditing({ type: 'major', id: category.id })} />
            <FaTrash className="action-icon delete" onClick={() => deleteMajorCategory(category.id)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className='categories-page-wrapper'>      
      <header className="main-header">
        <div className="header-title-group">
          <h1>Categories</h1>
          <div className="header-actions">
            <span className="status-text">{status}</span>
            <button className={`icon-button-round ${isDirty ? 'active' : ''}`} onClick={handleSave} title="Save Changes" disabled={!isDirty}><FaSave /></button>
            <button className="icon-button-round" onClick={handleReset} title="Reset to Default"><FaUndo /></button>
          </div>
        </div>
      </header>
      <div className="content-area categories-page">
        <div className="categories-grid-container">
          <div className="categories-grid">
            {/* Accounts Column */}
            <div className="category-column-wrapper">
              <div className='card category-header'>계좌</div>
              <div className="card category-column">
                {accounts.map((account) => <React.Fragment key={account.id}>{renderAccountItem(account)}</React.Fragment>)}
                {accounts.length < 20 && (
                  <div className="category-item add-item" onClick={addAccount}>
                    <FaPlusCircle />
                  </div>
                )}
              </div>
            </div>
            <div className="vertical-divider"></div>
            {/* Categories Columns */}
            {categories.map((category) => (
              <div className="category-column-wrapper" key={category.id}>
              {renderHeader(category)}
              <div className="card category-column">
                {category.minors.map((minor) => <React.Fragment key={minor.uuid}>{renderItem(category.id, minor)}</React.Fragment>)}
                {category.minors.length < 20 && (
                  <div className="category-item add-item" onClick={() => addMinorCategory(category.id)}>
                    <FaPlusCircle />
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Add Major Category Button */}
          {categories.length < 27 && (
            <div className="category-column-wrapper add-major-wrapper" onClick={addMajorCategory}>
              <div className="card add-major-card">
                <FaPlusCircle />
                <span>Add Major Category</span>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      <ConfirmPopup {...alertInfo} />
    </div>
  );
};


export default Categories;