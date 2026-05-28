import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { BertOutput } from '../../pages/Mapping';

interface Props {
  item: BertOutput;
  isOverlay?: boolean; // DragOverlay에서 사용할 때 true로 설정
}

const DraggableBertOutput: React.FC<Props> = ({ item, isOverlay }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `draggable-${item.id}`,
    data: {
      bertId: item.id,
    },
  });

  const style = {
    visibility: isDragging && !isOverlay ? 'hidden' : 'visible',
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bert-output-chip ${isDragging ? 'dragging' : ''}`}
    >
      {item.name}
    </div>
  );
};

export default DraggableBertOutput;