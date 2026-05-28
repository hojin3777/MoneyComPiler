import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, LabelList } from 'recharts';
import './MonthlyTrend.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

interface ApiSummaryData {
  month: string;
  fixed_income: number;
  variable_income: number;
  fixed_expense: number;
  semi_fixed_expense: number;
  variable_expense: number;
  deficit: number;
  surplus: number;
}

interface MonthlyTrendProps {
  months: string[];
  range: [number, number];
}

const MonthlyTrend: React.FC<MonthlyTrendProps> = ({ months, range }) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [_containerWidth, setContainerWidth] = useState(0);
  const [pixelsPerTick, setPixelsPerTick] = useState<number>(20);
  const [xAxisInterval, setXAxisInterval] = useState(0);

  const itemOrder: string[] = [
    'fixed_income',
    'variable_income',
    'fixed_expense',
    'semi_fixed_expense',
    'variable_expense',
    '차액',
  ];
  const hiddenItems = ['deficit', 'surplus'];

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries && entries.length > 0) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    if (chartContainerRef.current) {
      observer.observe(chartContainerRef.current);
    }
    return () => {
      if (chartContainerRef.current) {
        observer.unobserve(chartContainerRef.current);
      }
    };
  }, []);

  const fetchChartData = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (months.length === 0) {
        setChartData([]);
        setIsLoading(false);
        return;
      }

      const clampedStart = Math.max(0, Math.min(startIndex, months.length - 1));
      const clampedEnd = Math.max(clampedStart, Math.min(endIndex, months.length - 1));

      try {
        setIsLoading(true);
        const startMonth = months[clampedStart];
        const endMonth = months[clampedEnd];
        const response = await fetch(
          `${API_BASE_URL}/api/statistics/monthly_summary?start_month=${startMonth}&end_month=${endMonth}`
        );
        const summary: ApiSummaryData[] = await response.json();

        const formattedData = months.slice(clampedStart, clampedEnd + 1).map(fullmonth => {
          const monthData = summary.find(d => d.month === fullmonth);

          const fi = monthData?.fixed_income || 0;
          const vi = monthData?.variable_income || 0;
          const fe = monthData?.fixed_expense || 0;
          const sfe = monthData?.semi_fixed_expense || 0;
          const ve = monthData?.variable_expense || 0;

          const totalIncome = fi + vi;
          const totalExpense = fe + sfe + ve;
          const net = totalIncome - totalExpense;

          return {
            month: fullmonth.substring(5),
            fullDate: fullmonth,
            // 수입
            fixed_income: fi,
            variable_income: vi,
            // 지출 (음수로 변환)
            fixed_expense: -fe,
            semi_fixed_expense: -sfe,
            variable_expense: -ve,
            // 합계
            total_income: totalIncome,
            total_expense: -totalExpense,
            // 차액
            deficit: net < 0 ? -net : 0, // 지출이 더 많으면 양수 값으로 설정
            surplus: net > 0 ? -net : 0, // 수입이 더 많으면 음수 값으로 설정
          };
        });
        setChartData(formattedData);
      } catch (error) {
        console.error('Error fetching monthly summary:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [months]
  );

  useEffect(() => {
    if (months.length === 0) {
      setChartData([]);
      setIsLoading(false);
      return;
    }
    const [start, end] = range;
    fetchChartData(start, end);
  }, [months, range, fetchChartData]);

  const formatYAxis = (tickItem: number) => `${tickItem / 10000}`;

  const CustomBarLabel = (props: any) => {
    const { x, y, width, height, index, type } = props;
    const data = chartData[index];
    if (!data) return null;
    if (type === 'expense' && data.surplus === 0) return null;
    let total = 0;
    let labelText = '';
    let finalY = 0;
    let dy = 0;

    if (type === 'income') {
      total = data.fixed_income + data.variable_income;
      if (total === 0) return null;
      labelText = `${Math.round(total / 10000)}`;
      finalY = y;
      dy = height - 4; // 거기서 살짝 위로
    } else if (type === 'expense_with_surplus') {
      if (data.surplus === 0) return null;
      total = data.fixed_expense + data.semi_fixed_expense + data.variable_expense;
      if (total === 0) return null;
      labelText = `-${Math.round(Math.abs(total) / 10000)}`;
      finalY = y + height;
      dy = 12; // 거기서 살짝 아래로
    } else if (type === 'expense_without_surplus') {
      if (data.surplus !== 0) return null;
      total = data.fixed_expense + data.semi_fixed_expense + data.variable_expense;
      labelText = `-${Math.round(Math.abs(total) / 10000)}`;
      finalY = y;
      dy = 12;
    }

    return (
      <text
        x={x + width / 2}
        y={finalY}
        dy={dy}
        fill="var(--color-text-primary)"
        fontSize={12}
        textAnchor="middle"
      >
        {labelText}
      </text>
    );
  };

  const CustomTooltip = (props: any) => {
    const { active, payload } = props;
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const fullDate = data.fullDate;
      const dateLabel = fullDate ? `${fullDate.substring(0, 4)}년 ${fullDate.substring(5)}월` : '';

      const totalIncome = data.fixed_income + data.variable_income;
      const totalExpense = Math.abs(data.fixed_expense + data.semi_fixed_expense + data.variable_expense);
      const difference = totalIncome - totalExpense;

      // 각 항목의 색상을 payload에서 추출하여 맵으로 만듭니다.
      const colorMap = payload.reduce((acc: any, p: any) => {
        acc[p.dataKey] = p.fill;
        return acc;
      }, {});

      return (
        <div className="custom-tooltip-trend">
          <p className="tooltip-label-trend">{dateLabel}</p>

          {/* 수입 섹션 */}
          <div className="tooltip-section-trend">
            <p className="tooltip-item-trend income">
              <span>총수입</span><span>{totalIncome.toLocaleString()}원</span>
            </p>
            <p className="tooltip-item-trend sub-item">
              <span style={{ color: colorMap.fixed_income }}>&nbsp;&nbsp;├ 고정수입</span><span>{data.fixed_income.toLocaleString()}원</span>
            </p>
            <p className="tooltip-item-trend sub-item">
              <span style={{ color: colorMap.variable_income }}>&nbsp;&nbsp;└ 유동수입</span><span>{data.variable_income.toLocaleString()}원</span>
            </p>
          </div>

          {/* 지출 섹션 */}
          <div className="tooltip-section-trend">
            <p className="tooltip-item-trend expense">
              <span>총지출</span><span>{totalExpense.toLocaleString()}원</span>
            </p>
            <p className="tooltip-item-trend sub-item">
              <span style={{ color: colorMap.fixed_expense }}>&nbsp;&nbsp;├ 고정지출</span><span>{Math.abs(data.fixed_expense).toLocaleString()}원</span>
            </p>
            <p className="tooltip-item-trend sub-item">
              <span style={{ color: colorMap.semi_fixed_expense }}>&nbsp;&nbsp;├ 반고정지출</span><span>{Math.abs(data.semi_fixed_expense).toLocaleString()}원</span>
            </p>
            <p className="tooltip-item-trend sub-item">
              <span style={{ color: colorMap.variable_expense }}>&nbsp;&nbsp;└ 유동지출</span><span>{Math.abs(data.variable_expense).toLocaleString()}원</span>
            </p>
          </div>

          {/* 차액 섹션 */}
          <div className="tooltip-section-trend">
            <p className={`tooltip-item-trend ${difference >= 0 ? 'surplus' : 'deficit'}`}>
              {difference >= 0 ? (<span>잉여금</span>) : (<span>초과지출</span>)}
              <span>{difference.toLocaleString()}원</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // CustomLegend 수정: props 타입을 any로 받고, 내부에서 필요한 타입만 지정
  const CustomLegend = (props: any) => {
    const { payload } = props;
    if (!payload) return null;

    // 범례 항목을 재구성하고 '차액'을 추가합니다.
    const mainPayload = payload.filter((entry: any) => itemOrder.includes(entry.dataKey));
    const hasDiff = payload.some((entry: any) => hiddenItems.includes(entry.dataKey));

    const finalPayload = [
      ...mainPayload,
      ...(hasDiff ? [{
        value: '차액',
        color: 'var(--color-highlight-1-transparent5)', // 범례에 표시될 색상
        dataKey: '차액',
      }] : [])
    ];

    // itemOrder 기준으로 범례를 정렬합니다.
    const sortedPayload = finalPayload.sort((a: any, b: any) => {
      return itemOrder.indexOf(a.dataKey) - itemOrder.indexOf(b.dataKey);
    });

    return (
      <ul className="recharts-default-legend" style={{ padding: 0, margin: 0, textAlign: 'center' }}>
        {sortedPayload.map((entry: any, index: number) => (
          <li
            key={`legend-item-${index}`}
            className="recharts-legend-item"
            style={{ display: 'inline-block', marginRight: 10 }}
          >
            <svg className="recharts-surface" width="14" height="14" viewBox="0 0 32 32" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
              <path stroke="none" fill={entry.color} d="M0,4h32v24h-32z" className="recharts-legend-icon"></path>
            </svg>
            <span className="recharts-legend-item-text" style={{ color: 'var(--color-text-secondary)' }}>{entry.value}</span>
          </li>
        ))}
      </ul>
    );
  };


  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries && entries.length > 0) {
        const newWidth = entries[0].contentRect.width;
        setContainerWidth(newWidth);
        if (chartData.length === 0 || newWidth === 0) return;
        const pixelsPerTick = newWidth / chartData.length;
        setPixelsPerTick(pixelsPerTick);
        let newInterval = 0;
        if (pixelsPerTick < 15) {
          newInterval = 3;
        } else if (pixelsPerTick < 20) {
          newInterval = 2;
        } else if (pixelsPerTick < 30) {
          newInterval = 1;
        }
        setXAxisInterval(newInterval);
      }
    });

    if (chartContainerRef.current) {
      observer.observe(chartContainerRef.current);
    }
    return () => {
      if (chartContainerRef.current) {
        observer.unobserve(chartContainerRef.current);
      }
    };
    // 3. 의존성 배열에 chartData를 추가하여, 데이터가 변경될 때도 이 로직이 재평가되도록 합니다.
  }, [chartData]);

  const CustomXAxisTick = (props: any) => {
    const { x, y, payload, interval } = props;

    const dataEntry = chartData[payload.index];
    const index = payload.index;
    // alert(dataEntry);
    if (!dataEntry) return null;
    const month = dataEntry.month;
    const fullDate = dataEntry.fullDate;

    if (month === '01' && fullDate) {
      return (
        <g transform={`translate(${x},${y})`}>
          <text x={0} y={12} textAnchor="middle" fill="var(--color-text-primary)" fontSize={14}>{month}</text>
        </g>
      );
    }
    if (index % (interval + 1) === 0) {
      return (
        <g transform={`translate(${x},${y})`}>
          <text x={0} y={0} dy={12} textAnchor="middle" fill="var(--color-text-primary)" fontSize={14}>{month}</text>
        </g>
      );
    }
    return null;
  };

  // ****** 이중 X축 방식으로 변경 ******
  // // 월 표시 formatter
  // const monthTickFormatter = (tick: string) => {
  //   return tick; // "01", "02" 등 그대로 표시
  // };

  // 년도 표시 (이중 축)
  const renderYearTick = (tickProps: any) => {
    const { x, y, payload, index } = tickProps;
    const dataEntry = chartData[payload.index];
    if (!dataEntry) return null;

    const fullDate = dataEntry.fullDate; // "2024-01"
    const currentYear = fullDate ? fullDate.substring(0, 4) : '';

    // 해당 년도의 시작/끝 인덱스 찾기
    let yearStartIndex = -1;
    let yearEndIndex = -1;

    for (let i = 0; i < chartData.length; i++) {
      const dataYear = chartData[i].fullDate ? chartData[i].fullDate.substring(0, 4) : '';
      if (dataYear === currentYear) {
        if (yearStartIndex === -1) yearStartIndex = i;
        yearEndIndex = i;
      }
    }

    // 중간 위치 계산 (실제 측정된 간격 사용)
    const middleIndex = (yearStartIndex + yearEndIndex) / 2;
    const middleX = x + ((middleIndex - index) * pixelsPerTick);

    // 첫 데이터이거나 마지막 데이터면 끝 구분선만 표시
    if (index === 0 || index === chartData.length - 1) {
      return (
        <g>
          {index === 0 && (
            <>
              <text x={middleX} y={y - 2} textAnchor="middle" fill="var(--color-text-secondary)" fontSize={12}>
                {currentYear}
              </text>
              <line
                x1={x - pixelsPerTick / 2 + 3}
                y1={y - 2}
                x2={x - pixelsPerTick / 2 + 3}
                y2={y - 38}
                stroke="var(--color-border-subtle)"
                strokeDasharray={"3 3"}
                strokeWidth={2} />
            </>
          )}
          {index === chartData.length - 1 && (
            <line
              x1={x + pixelsPerTick / 2 - 3}
              y1={y - 2}
              x2={x + pixelsPerTick / 2 - 3}
              y2={y - 38}
              stroke="var(--color-border-subtle)"
              strokeDasharray={"3 3"}
              strokeWidth={2} />
          )}
        </g>
      );
    }

    // 현재 데이터가 해당 년도의 첫 번째가 아니면 년도 label 표시 안함
    if (index !== yearStartIndex) {
      return null;
    }

    const showDivider = index > 0;

    return (
      <g>
        {/* 구분선 (12월-1월 사이) */}
        {showDivider && (
          <line
            x1={x - pixelsPerTick / 2 + 1}
            y1={y - 2}
            x2={x - pixelsPerTick / 2 + 1}
            y2={y - 38}
            stroke="var(--color-border-subtle)"
            strokeDasharray={"3 3"}
            strokeWidth={2}
          />
        )}
        {/* 년도 텍스트 (해당 년도 구간 중간) */}
        <text
          x={middleX - pixelsPerTick / 4}
          y={y - 2}
          textAnchor="middle"
          fill="var(--color-text-secondary)"
          fontSize={12}
        >
          {currentYear}
        </text>
      </g>
    );
  };


  const formatMonthLabel = (monthStr?: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${year}년 ${parseInt(month, 10)}월`;
  };

  const [startIndex, endIndex] = range;
  const clampedStart = Math.max(0, Math.min(startIndex, months.length - 1));
  const clampedEnd = Math.max(clampedStart, Math.min(endIndex, months.length - 1));
  const rangeLabel =
    months.length > 0
      ? `${formatMonthLabel(months[clampedStart])} ~ ${formatMonthLabel(months[clampedEnd])}`
      : '데이터 없음';

  return (
    <div className="dashboard-card monthly-trend-card">
      <div className="dashboard-card-header">
        <h3 className="dashboard-card-title">월별 추이<span className='dashboard-card-title subtle'> (단위: 만)</span></h3>
        <span className="dashboard-card-subtitle">{rangeLabel}</span>
      </div>
      <div className="monthly-trend-content">
        {isLoading ? (
          <div className="monthly-trend-loading">월별 추이 데이터를 불러오는 중입니다...</div>
        ) : months.length === 0 ? (
          <div className="no-data-message">표시할 데이터가 없습니다.</div>
        ) : (
          <div className="monthly-trend-chart" ref={chartContainerRef}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                stackOffset='sign'
                margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                maxBarSize={42}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-subtle)" />
                {/* <XAxis dataKey="month" tick={{ fill: 'var(--color-text-primary)'}}/> */}
                <XAxis dataKey="month" tick={<CustomXAxisTick interval={xAxisInterval} />} interval={0} />
                {/* <XAxis
                  dataKey="month"
                  tickFormatter={monthTickFormatter}
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                  interval={xAxisInterval}
                /> */}
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={renderYearTick as any}
                  interval={0}
                  height={1}
                  xAxisId="year"
                />
                <YAxis tickFormatter={formatYAxis} tickCount={9} tick={{ fill: 'var(--color-text-secondary)' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-overlay-light)' }} />
                <Legend content={<CustomLegend />} />
                {/* 0을 가로지르는 기준선 */}
                <ReferenceLine y={0} stroke="var(--color-border-subtle)" />

                {/* 수입 스택 (양수) */}
                <Bar dataKey="fixed_income" name="고정수입" stackId="a" fill="var(--color-highlight-4)" />
                <Bar dataKey="variable_income" name="유동수입" stackId="a" fill="var(--color-highlight-5)" />
                {/* 지출 스택 (음수) */}
                <Bar dataKey="fixed_expense" name="고정지출" stackId="a" fill="var(--color-highlight-2)" />
                <Bar dataKey="semi_fixed_expense" name="반고정지출" stackId="a" fill="var(--color-highlight-6)" />
                <Bar dataKey="variable_expense" name="유동지출" stackId="a" fill="var(--color-highlight-3)">
                  <LabelList dataKey="variable_expense" content={<CustomBarLabel type="expense_without_surplus" />} />
                </Bar>

                {/* 3. 차액 막대에 레이블을 연결합니다. */}
                <Bar dataKey="deficit" name="초과지출" stackId="a" fill="var(--color-highlight-1-transparent5)">
                  {/* 초과지출이 있을 때 -> 총지출 레이블 표시 */}
                  <LabelList dataKey="deficit" content={<CustomBarLabel type="income" />} />
                </Bar>
                <Bar dataKey="surplus" name="잉여금" stackId="a" fill="var(--color-highlight-1-transparent5)">
                  {/* 잉여금이 있을 때 -> 총수입 레이블 표시 */}
                  <LabelList dataKey="surplus" content={<CustomBarLabel type="expense_with_surplus" />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonthlyTrend;
