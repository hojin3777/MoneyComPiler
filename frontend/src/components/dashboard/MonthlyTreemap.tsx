import React, { useEffect, useState } from 'react';
import { Treemap, ResponsiveContainer } from 'recharts';
import './MonthlyTreemap.css';

const API_BASE_URL = 'http://127.0.0.1:5050';
interface TreemapDataType {
  name: string;
  size?: number;
  children?: TreemapDataType[];
}

interface MonthlyTreemapProps {
  selectedYear: number | null;
  selectedMonth: number | null;
}

const COLOR_LIST = [
  'var(--color-highlight-2-transparent9)',
  'var(--color-highlight-3-transparent9)',
  'var(--color-highlight-4-transparent9)',
  'var(--color-highlight-5-transparent9)',
  'var(--color-highlight-6-transparent9)',
  'var(--color-highlight-1-transparent9)',
  'var(--color-highlight-2-transparent7)',
  'var(--color-highlight-3-transparent7)',
  'var(--color-highlight-4-transparent7)',
  'var(--color-highlight-5-transparent7)',
  'var(--color-highlight-6-transparent7)',
  'var(--color-highlight-1-transparent7)'
];
const TEXT_COLOR_LIST = [
  'var(--color-highlight-2)',
  'var(--color-highlight-3)',
  'var(--color-highlight-4)',
  'var(--color-highlight-5)',
  'var(--color-highlight-6)',
  'var(--color-highlight-1)',
  'var(--color-highlight-2)',
  'var(--color-highlight-3)',
  'var(--color-highlight-4)',
  'var(--color-highlight-5)',
  'var(--color-highlight-6)',
  'var(--color-highlight-1)',
]
const TEXT_COLOR_LIST_CHILD = [
  'var(--color-highlight-2-transparent9)',
  'var(--color-highlight-3-transparent9)',
  'var(--color-highlight-4-transparent9)',
  'var(--color-highlight-5-transparent9)',
  'var(--color-highlight-6-transparent9)',
  'var(--color-highlight-1-transparent9)',
  'var(--color-highlight-2-transparent9)',
  'var(--color-highlight-3-transparent9)',
  'var(--color-highlight-4-transparent9)',
  'var(--color-highlight-5-transparent9)',
  'var(--color-highlight-6-transparent9)',
  'var(--color-highlight-1-transparent9)',
]

const findParentInfo = (
  data: TreemapDataType[],
  childName: string,
  childValue: number
): { parentName: string; parentValue: number; allChildren: TreemapDataType[]; parentIndex: number} | null => {
  // 전체 데이터(대분류 목록)를 순회합니다.
  for (const [index, parent] of data.entries()) {
    if (parent.children) {
      // 각 대분류의 자식(소분류) 중에 일치하는 항목이 있는지 찾습니다.
      const foundChild = parent.children.find(
        (child) => child.name === childName && child.size === childValue
      );

      if (foundChild) {
        // 일치하는 자식을 찾았다면, 해당 부모의 이름과 전체 값을 계산하여 반환합니다.
        const parentTotalValue = parent.children.reduce(
          (sum, c) => sum + (c.size || 0),
          0
        );
        return {
          parentName: parent.name,
          parentValue: parentTotalValue,
          allChildren: parent.children,
          parentIndex: index,
        };
      }
    }
  }
  // 부모를 찾지 못하면 null을 반환합니다.
  return null;
};

const MonthlyTreemap: React.FC<MonthlyTreemapProps> = ({ selectedYear, selectedMonth }) => {
  const [data, setData] = useState<TreemapDataType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [tooltipData, setTooltipData] = useState<{
    visible: boolean;
    x: number;
    y: number;
    parent: string;
    child: string;
    value: number;
    parentValue: number;
    allChildren: TreemapDataType[];
    parentColor: string;
    childColor: string;
  } | null>(null);

  // 데이터 로드
  useEffect(() => {
    if (!selectedYear || !selectedMonth) return;
    setIsLoading(true);
    fetch(`${API_BASE_URL}/api/statistics/category_treemap?year=${selectedYear}&month=${selectedMonth}`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          // 백엔드 데이터를 recharts 형식으로 변환
          const formattedData: TreemapDataType[] = json.data.map((item: any) => ({
            name: item.name,
            children: item.children?.map((child: any) => ({
              name: child.name,
              size: child.value
            })) || []
          }));
          setData(formattedData);
        } else {
          setData([]);
        }
      })
      .catch(error => {
        console.error('Failed to fetch treemap data:', error);
        setData([]);
      })
      .finally(() => setIsLoading(false));
  }, [selectedYear, selectedMonth]);


  // 커스텀 컨텐츠
  const CustomizedContent = (props: any) => {
    const { depth, x, y, width, height, index, name, value } = props;

    const handleMouseEnter = (e: React.MouseEvent) => {
      // 소분류(depth=2) 위에서만 툴팁을 표시합니다.
      if (depth === 2) {
        // 헬퍼 함수를 호출하여 부모 정보를 가져옵니다.
        const parentInfo = findParentInfo(data, name, value);

        if (parentInfo) {
          const parentColor = TEXT_COLOR_LIST[parentInfo.parentIndex % COLOR_LIST.length];
          setTooltipData({
            visible: true,
            x: e.clientX + 15,
            y: e.clientY + 15,
            parent: parentInfo.parentName,
            child: name,
            value: value,
            parentValue: parentInfo.parentValue,
            allChildren: parentInfo.allChildren,
            parentColor: parentColor,
            childColor: TEXT_COLOR_LIST_CHILD[parentInfo.parentIndex % COLOR_LIST.length],
          });
          setIsTooltipOpen(true);
        }
      }
    };
    
    return (
      <g onMouseEnter={handleMouseEnter}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: depth < 2 ? COLOR_LIST[index % COLOR_LIST.length] : 'transparent',
            stroke: 'var(--color-bg-app)',
            strokeWidth: 2 / (depth + 1e-10),
            strokeOpacity: 1 / (depth + 1e-10),
          }}
        />
        {depth === 1 ? (
          <text
            x={x + width / 2}
            y={y + height / 2 + 7}
            textAnchor="middle"
            fill="var(--color-text-header)"
            fontSize={16}
            fontWeight="500"
            className="monthly-treemap-mtreemap-major"
          >
            {name}
            {/* {index} */}
          </text>
        ) : null}
        {depth === 2 && width > 60 && height > 40 ? (
          <text
            x={x + 8}
            y={y + 18}
            fill="var(--color-text-tertiary)"
            fontSize={14}
            fontWeight="400"
            className="monthly-treemap-mtreemap-minor"
          >
            {name.length > 8 ? `${name.substring(0, 8)}...` : name}
          </text>
        ) : null}
      </g>
    );
  };

  const formatMonthLabel = () => {
    if (!selectedYear || !selectedMonth) return '';
    return `${selectedYear}년 ${selectedMonth}월 기준`;
  };




  return (
    <div className="dashboard-card monthly-treemap-mtreemap-card" onMouseOut={() => setIsTooltipOpen(false)}>
      <div className="monthly-treemap-mtreemap-header">
        <div className="dashboard-card-title">대분류별 지출 비율</div>
        <div className="dashboard-card-subtitle">{formatMonthLabel()}</div>
      </div>
      {isLoading ? (
        <div className="monthly-treemap-mtreemap-loading">
          <div className="loading-spinner"></div>
          <span>데이터를 불러오는 중...</span>
        </div>
      ) : data.length === 0 ? (
        <div className="monthly-treemap-mtreemap-empty">
          <span>해당 기간의 지출 데이터가 없습니다.</span>
        </div>
      ) : (
        <div className="dashboard-card-content" >
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data as any}
              dataKey="size"
              stroke="var(--color-border)"
              fill="var(--color-highlight-1)"
              content={<CustomizedContent colors={COLOR_LIST} />}
              animationBegin={0}
              animationDuration={0}
              isAnimationActive={false}
            />
          </ResponsiveContainer>
        </div>
      )}

      {/* 커스텀 툴팁 */}
      {isTooltipOpen && tooltipData && (
        <div
          className="treemap-tooltip-mtreemap"
          style={{
            position: 'fixed',
            left: tooltipData.x,
            top: tooltipData.y,
            zIndex: 2000,
            pointerEvents: 'none',
          }}
        >
          <div className="treemap-tooltip-mtreemap-content">
            {/* 부모 섹션 */}
            <div className="treemap-tooltip-mtreemap-item parent">
              <span style={{ color:tooltipData.parentColor, fontWeight: 700 }}>{tooltipData.parent}</span>
              <span>{tooltipData.parentValue.toLocaleString()}원</span>
            </div>
            {/* 자식 섹션 */}
            <div className="treemap-tooltip-mtreemap-children-list">
              {tooltipData.allChildren.map((child, index) => (
                <div
                  key={index}
                  // 현재 hover된 자식 요소에 'active' 클래스를 부여합니다.
                  className={`treemap-tooltip-mtreemap-item child ${
                    child.name === tooltipData.child ? 'active' : ''
                  }`}
                >
                  <span style={{ color: child.name === tooltipData.child ? tooltipData.childColor : undefined }}>
                    {child.name}
                  </span>
                  <span>{(child.size || 0).toLocaleString()}원</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyTreemap;