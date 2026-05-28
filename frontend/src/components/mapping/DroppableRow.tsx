import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface Props {
  id: string;
  data: any;
  children: React.ReactNode;
  className?: string;
}

const DroppableRow: React.FC<Props> = ({ id, data, children, className }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
    data: data,
  });

  return (
    <div ref={setNodeRef} className={`${className || ''} ${isOver ? 'droppable-highlight' : ''}`}>
      {children}
    </div>
  );
};

export default DroppableRow;