import { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import './FloatingSelectPopup.css';

export type Opt = {
  value: string;
  label: string;
  disabled?: boolean
  unrecommended?: boolean;
};
export type FloatingSelectHandle = {
  open: (opts: Opt[], currentValue: string, pos: { top: number; left: number; width?: number }, onSelect: (v: string) => void, placeholder?: string) => void;
  close: () => void;
};

const OPTION_HEIGHT = 36;
const MAX_VISIBLE = 12;

const FloatingSelectPopup = forwardRef<FloatingSelectHandle, {}>((_props, ref) => {
  const [openState, setOpenState] = useState(false);
  const [options, setOptions] = useState<Opt[]>([]);
  const [value, setValue] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width?: number }>({ top: 0, left: 0 });
  const callbackRef = useRef<(v: string) => void>(() => {});
  // const selectRef = useRef<HTMLSelectElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    open: (opts, currentValue, position, onSelect) => {
      setOptions(opts || []);
      setValue(currentValue ?? '');
      setPos(position);
      callbackRef.current = onSelect;
      setOpenState(true);
      // focus + open after render
      setTimeout(() => {
        try {
          rootRef.current?.focus();
        } catch {}
      }, 0);
    },
    close: () => {
      setOpenState(false);
    }
  }), []);

  // 자동 스크롤 로직
  useEffect(() => {
    if (openState && listRef.current && value){
      const selectedItem = listRef.current.querySelector(`[data-value="${value}"]`) as HTMLDivElement;
      if (selectedItem){
        selectedItem.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'auto'
        });
      }
    }
  }, [value, options]);

  useEffect(() => {
    const onDocClick = (e: Event) => {
      if (!openState) return;
      const target = e.target as Node | null;
      if(!rootRef.current) return;
      if (target && !rootRef.current.contains(target)) {
        setOpenState(false);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', onDocClick, true); // 스크롤 시 닫기
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onDocClick, true);
    };
  }, [openState]);

  if (!openState) return null;

  // 높이 계산 및 위로 렌더 여부 결정
  const visibleCount = Math.min(options.length, MAX_VISIBLE);
  const dropdownHeight = visibleCount * OPTION_HEIGHT;
  const viewportY = window.innerHeight;
  const belowSpace = viewportY - (pos.top - window.scrollY);
  const openAbove = belowSpace < dropdownHeight + 12 ;
  const top = openAbove ? (pos.top - dropdownHeight - 48) : pos.top + 4;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="floating-select-root"
      style={{ position: 'fixed', top, left: pos.left, minWidth: pos.width ?? 160, zIndex: 9999 }}
      role="listbox"
      aria-activedescendant={value}
    >
      <div ref={listRef} className="floating-select-list" style={{ maxHeight: dropdownHeight, width: pos.width ?? 160 }}>
        {options.map((o) => (
          <div
            key={o.value}
            data-value={o.value}
            role="option"
            aria-selected={o.value === value}
            className={`floating-select-item ${o.value === value ? 'selected' : ''} ${o.disabled ? 'disabled' : ''} ${o.unrecommended ? 'unrecommended' : ''}`}
            onMouseDown={(ev) => {
              ev.preventDefault(); // 포커스 유지/브라우저 기본 동작 방지
              if (o.disabled) return;
              const v = o.value;
              setValue(v);
              setOpenState(false);
              try { callbackRef.current(v); } catch {}
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
});

export default FloatingSelectPopup;