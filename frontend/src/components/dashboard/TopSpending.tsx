import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, CartesianGrid } from 'recharts';
import './TopSpending.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

// --- 타입 정의 ---
interface TopSpendingDetailItem {
  name: string;
  value: number;
}

interface TopSpendingDetails {
  items: TopSpendingDetailItem[];
  total_count: number;
}

interface TopSpendingItem {
  name: string;
  value: number;
  details?: TopSpendingDetails;
}

interface TopSpendingItem {
  name: string;
  value: number;
}

interface TopSpendingData {
  by_amount: TopSpendingItem[];
  by_frequency: TopSpendingItem[];
}

interface TopSpendingProps {
  months: string[];
  range: [number, number];
}

// --- 커스텀 툴팁 컴포넌트 ---
const CustomTooltip = ({ active, payload, label, viewMode, monthCount, amountData, frequencyData }: any) => {
  if (active && payload && payload.length) {
    const { dataKey, value, fill, payload: itemPayload } = payload[0];
    const isAmount = dataKey === 'amount_value';
    const data = isAmount ? amountData : frequencyData;
    const rank = data.findIndex((item: any) => item.name === label) + 1;
    const solidColor = fill.replace('-transparent9', '');
    if (!data) return null;

    const rawValue = Math.abs(value);
    const displayValue = viewMode === 'average' ? rawValue / monthCount : rawValue;

    let tooltipLabel = isAmount ? '지출액' : '지출 횟수';
    let tooltipValue = '';

    if (viewMode === 'average') {
      tooltipLabel = `월 평균 ${tooltipLabel}`;
      tooltipValue = displayValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    } else {
      tooltipLabel = `총 ${tooltipLabel}`;
      tooltipValue = displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    
    tooltipValue += isAmount ? '원' : '회';

    const details = itemPayload.details;
    const remainingCount = details ? details.total_count - details.items.length : 0;

    return (
      <div className="custom-tooltip-top-spending">
        <p className="tooltip-label-top-spending" style={{ color: solidColor }}>
          {`${rank}위 ${label}`}
        </p>
        <p className="tooltip-item-top-spending">
          <span>{tooltipLabel}</span>
          <span>{tooltipValue}</span>
        </p>
        {details && details.items.length > 0 && (
          <>
            <div className="tooltip-divider-top-spending"></div>
            <div className="tooltip-details-list-top-spending">
              {details.items.map((item: TopSpendingDetailItem, index: number) => {
                const detailValue = viewMode === 'average' ? (item.value / monthCount) : item.value;
                let formattedDetailValue = '';
                if (viewMode === 'average') {
                  formattedDetailValue = detailValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
                } else {
                  formattedDetailValue = detailValue.toLocaleString(undefined, { maximumFractionDigits: 0 });
                }
                return (
                  <div key={index} className="tooltip-detail-item-top-spending">
                    <span>{item.name}</span>
                    <span>{`${formattedDetailValue}${isAmount ? '원' : '회'}`}</span>
                  </div>
                );
              })}
              </div>
              {remainingCount > 0 && (
                <p className="tooltip-remaining-count-top-spending">
                  (...외 {remainingCount} 건)
                </p>
              )}
          </>
        )}
      </div>
    );
  }
  return null;
};

// 커스텀 Y축 틱 컴포넌트
const CustomizedYAxisTick = (props: any) => {
  const { x, y, payload, commonCategories, colorMap, orientation } = props;
  const categoryName = payload.value;
  const isCommon = commonCategories.has(categoryName);

  if (isCommon) {
    const colorClass = colorMap.get(categoryName);
    // SVG의 <text> 요소 안에서는 직접 HTML/CSS 클래스를 적용할 수 없으므로,
    // <foreignObject>를 사용해 HTML 컨텐츠를 렌더링합니다.
    const isLeftChart = orientation === 'left';
    const foreignObjectX = isLeftChart ? -105 : 5; // Y축 위치에 따라 조정
    const textAlign = isLeftChart ? 'right' : 'left';
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x={foreignObjectX} y={-11} width="100" height="24" style={{ textAlign, overflow: 'visible' }}>
          <div style={{ display: 'inline-block' }}>
            <span className={colorClass}>{categoryName}</span>
          </div>
        </foreignObject>
      </g>
    );
  }

  // 공통 카테고리가 아닐 경우 기본 텍스트 렌더링
  const textAnchor = orientation === 'left' ? 'end' : 'start';
  return (
    <text x={x} y={y} dy={4} textAnchor={textAnchor} fill="var(--color-text-primary)" fontSize={14}>
      {categoryName}
    </text>
  );
};


const TopSpending: React.FC<TopSpendingProps> = ({ months, range }) => {
  const [data, setData] = useState<TopSpendingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'total' | 'average'>('total');

  // ******************** 데이터 로드 ********************
  useEffect(() => {
    const fetchData = async () => {
      if (months.length === 0) {
        setData(null);
        setIsLoading(false);
        return;
      }
      const [startIndex, endIndex] = range;
      const startMonth = months[startIndex];
      const endMonth = months[endIndex];
      if (!startMonth || !endMonth) return;

      try {
        setIsLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/api/statistics/top_spending?start_month=${startMonth}&end_month=${endMonth}`
        );
        const result: TopSpendingData = await response.json();
        setData(result);
      } catch (error) {
        console.error('Error fetching top spending data:', error);
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [months, range]);

  // ******************** 차트 데이터 가공 ********************
  const monthCount = useMemo(() => {
    return range[1] - range[0] + 1;
  }, [range]);

  const amountChartData = useMemo(() => {
    if (!data?.by_amount) return [];
    return data.by_amount.map(item => ({ name: item.name, amount_value: item.value, details: item.details }));
  }, [data]);

  const frequencyChartData = useMemo(() => {
    if (!data?.by_frequency) return [];
    return data.by_frequency.map(item => ({ name: item.name, frequency_value: item.value, details: item.details }));
  }, [data]);

  // 공통 카테고리 및 색상 매핑
  const { commonCategories, colorMap } = useMemo(() => {
    if (!data?.by_amount || !data?.by_frequency) {
      return { commonCategories: new Set(), colorMap: new Map() };
    }
    const amountNames = new Set(data.by_amount.map(d => d.name));
    const frequencyNames = new Set(data.by_frequency.map(d => d.name));
    const common = new Set([...amountNames].filter(name => frequencyNames.has(name)));

    const map = new Map<string, string>();
    // MonthlyTreemap.tsx의 색상 순서 참조 (2->6, 1)
    const colorOrder = [2, 3, 4, 5, 6, "2-transparent7", "3-transparent7", "4-transparent7", "5-transparent7", "6-transparent7"]; 
    let colorIndex = 0;
    common.forEach(name => {
      const colorId = colorOrder[colorIndex % colorOrder.length];
      map.set(name, `top-spending-highlight color-${colorId}`);
      colorIndex++;
    });

    return { commonCategories: common, colorMap: map };
  }, [data]);

  // 기간 표시 텍스트 생성
  const rangeText = useMemo(() => {
    if (months.length > 0 && range[1] < months.length) {
      const start = months[range[0]];
      const end = months[range[1]];
      return `${start.substring(0, 4)}년 ${parseInt(start.substring(5), 10)}월 ~ ${end.substring(0, 4)}년 ${parseInt(end.substring(5), 10)}월`;
    }
    return '';
  }, [months, range]);

  const generateVerticalCoordinates = (props : { width: number, offset?: { left?: number, right?: number}}, chartType: 'amount' | 'frequency' ) => {
    const { width, offset } = props;
    const sectionCount = width > 350 ? 10 : 5;

    if (chartType === 'amount') {
      const yAxisWidth = offset?.right || 0;
      const plotAreaWidth = width - yAxisWidth;
      const interval = plotAreaWidth / sectionCount;
      return Array.from({ length: sectionCount - 1 }, (_, i) => interval * (i + 1));
    }

    if (chartType === 'frequency') {
      const yAxisWidth = offset?.left || 0;
      const plotAreaWidth = width - yAxisWidth;
      const interval = plotAreaWidth / sectionCount;
      return Array.from({ length: sectionCount - 1 }, (_, i) => yAxisWidth + interval * (i + 1));
    }
    return [];
  };

  const handleToogleViewMode = () => setViewMode(prev => (prev === 'total' ? 'average' : 'total'));
  const formatValue = (value: any, _isAmount: boolean = false) => {
    const rawValue = Math.abs(value);
    const displayValue = viewMode === 'average' ? rawValue / monthCount : rawValue;
    if (viewMode === 'average') {
      return displayValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1});
    }
    return displayValue.toLocaleString(undefined, {maximumFractionDigits: 0});
  }

  // ******************** 렌더링 ********************
  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h3 className="dashboard-card-title">기간 내 소비 TOP 10
          <span
            className="dashboard-cart-title subtle"
            style={{ color: viewMode === 'total' ? 'var(--color-highlight-5)' : 'var(--color-highlight-4)' }}>
            {viewMode === 'total' ? ` (${monthCount}개월 합산)` : ` (${monthCount}개월 평균)`}
          </span>
          <label className="switch top-spending-switch">
            <input type="checkbox" onChange={handleToogleViewMode} checked={viewMode === 'average'} />
            <span className="slider round"></span>
          </label>
        </h3>
        <span className="dashboard-card-subtitle">{rangeText}</span>
        
      </div>
      <div className="dashboard-card-content top-spending-content">
        {isLoading ? (
          <div className="top-spending-loading">데이터를 불러오는 중입니다...</div>
        ) : !data || (amountChartData.length === 0 && frequencyChartData.length === 0) ? (
          <div className="top-spending-no-data">표시할 데이터가 없습니다.</div>
        ) : (
          <>
            <div className="top-spending-header">
              <div>지출액</div>
              <div>카테고리</div>
              <div>지출 횟수</div>
            </div>
            <div className='top-spending-chart-wrapper'>
              {/* --- 중앙 구분선 ---  */}
              <div className='center-divider'></div>
              <div className="top-spending-chart-container">
              {/* 왼쪽 차트: 지출액 */}
              <div className="chart-half left">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={amountChartData} layout="vertical" margin={{ top: -5, right: 0, left: 65, bottom: -10 }} barCategoryGap="30%">
                    <CartesianGrid
                      vertical={true}
                      horizontal={false}
                      verticalCoordinatesGenerator={(props) => generateVerticalCoordinates(props, 'amount')}
                      stroke='var(--color-border-subtle)'
                      strokeDasharray="3 3"/>
                    <XAxis type="number" reversed={true} hide/>
                    <YAxis
                      type="category"
                      dataKey="name"
                      orientation="right"
                      axisLine={true}
                      tickLine={false}
                      width={100}
                      // tick={{ fill: 'var(--color-text-primary)', fontSize: 14 }}
                      tick={<CustomizedYAxisTick commonCategories={commonCategories} colorMap={colorMap} orientation="right"/>}
                      interval={0}
                    />
                    <Tooltip
                      content={<CustomTooltip
                        viewMode={viewMode}
                        monthCount={monthCount}
                        amountData={amountChartData}
                      />} cursor={{ fill: 'var(--color-bg-overlay-light)' }} />
                    <Bar dataKey="amount_value" fill="var(--color-highlight-5-transparent9)" isAnimationActive={false}>
                      <LabelList
                        dataKey="amount_value"
                        position="right"
                        formatter={(value: any) => formatValue(value, true)}
                        fill="var(--color-text-primary)"
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* 오른쪽 차트: 지출 횟수 */}
              <div className="chart-half right">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={frequencyChartData} layout="vertical" margin={{ top: -5, right: 10, left: 0, bottom: -10 }} barCategoryGap="30%">
                    <CartesianGrid
                      vertical={true}
                      horizontal={false}
                      verticalCoordinatesGenerator={(props) => generateVerticalCoordinates(props, 'frequency')}
                      stroke='var(--color-border-subtle)'
                      strokeDasharray="3 3"/>
                    <XAxis type="number" hide tickCount={9} tick={{ fill: 'var(--color-border-subtle)' }}/>
                    <YAxis
                      type="category"
                      dataKey="name"
                      orientation="left"
                      axisLine={true}
                      tickLine={false}
                      width={100}
                      // tick={{ fill: 'var(--color-text-primary)', fontSize: 14 }}
                      tick={<CustomizedYAxisTick commonCategories={commonCategories} colorMap={colorMap} orientation="left"/>}
                      interval={0}
                    />
                    <Tooltip
                      content={<CustomTooltip
                        viewMode={viewMode}
                        monthCount={monthCount}
                        frequencyData={frequencyChartData}
                      />} cursor={{ fill: 'var(--color-bg-overlay-light)' }} />
                    <Bar dataKey="frequency_value" fill="var(--color-highlight-4-transparent9)" isAnimationActive={false}>
                      <LabelList
                        dataKey="frequency_value"
                        position="right"
                        formatter={(value: any) => `${formatValue(value)}회`}
                        fill="var(--color-text-primary)"
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TopSpending;