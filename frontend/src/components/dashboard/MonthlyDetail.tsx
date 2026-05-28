import { useState, useEffect, useRef } from 'react';
import { PiChartDonutFill } from 'react-icons/pi';
import { PieChart, Pie, Cell, Label, Tooltip as RechartsTooltip } from 'recharts';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import './MonthlyDetail.css';

const API_BASE_URL = 'http://127.0.0.1:5050';
// --- 타입 정의 (변경 없음) ---
interface MonthlySummary {
  fixed_income: number;
  variable_income: number;
  fixed_expense: number;
  semi_fixed_expense: number;
  variable_expense: number;
}
interface CategorySpending {
  name: string;
  value: number;
  percentage: number;
}
interface MonthlyDetailProps {
  selectedYear: number | null;
  selectedMonth: number | null;
}
interface AccountBalance {
  account_name: string;
  balance: number;
}

// --- 범례 컴포넌트 (월별 추이와 동일) ---
const CustomLegend = (props: any) => {
  const { payload, chartData } = props;
  if (!chartData || chartData.length === 0) return null;
  const data = chartData[0];

  const filteredPayload = payload.filter((entry: any) => {
    if (entry.value === '초과지출') return data.deficit > 0;
    if (entry.value === '잉여금') return data.surplus > 0;
    // 0원인 항목은 범례에서 제외
    if (data[entry.dataKey] === 0) return false;
    return true;
  });

  return (
    <ul className="custom-legend-mdetail">
      {filteredPayload.map((entry: any, index: number) => (
        <li key={`item-${index}`} style={{ color: entry.color }}>
          <span className="legend-icon-mdetail" style={{ backgroundColor: entry.color }}></span>
          {entry.value}
        </li>
      ))}
    </ul>
  );
};

const CustomTooltip = ({ active, payload, selectedYear, selectedMonth }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const totalIncome = data.fixed_income + data.variable_income;
    const totalExpense = data.fixed_expense + data.semi_fixed_expense + data.variable_expense;
    const difference = totalIncome - totalExpense;

    // 각 항목의 색상을 payload에서 추출하여 맵으로 만듭니다.
    const colorMap = payload.reduce((acc: any, p: any) => {
      acc[p.dataKey] = p.fill;
      return acc;
    }, {});

    return (
      // 4. 툴팁 배경/테두리 및 고유 클래스명 적용
      <div className="custom-tooltip-mdetail">
        <p className="tooltip-label-mdetail">{`${selectedYear}년 ${selectedMonth}월 상세`}</p>
        <div className="tooltip-section-mdetail">
          <p className="tooltip-item-mdetail income">
            <span>총수입</span><span>{totalIncome.toLocaleString()}원</span>
          </p>
          <p className="tooltip-item-mdetail sub-item">
            <span style={{ color: colorMap.fixed_income }}>&nbsp;&nbsp;├ 고정수입</span><span>{data.fixed_income.toLocaleString()}원</span>
          </p>
          <p className="tooltip-item-mdetail sub-item">
            <span style={{ color: colorMap.variable_income }}>&nbsp;&nbsp;└ 유동수입</span><span>{data.variable_income.toLocaleString()}원</span>
          </p>
        </div>
        <div className="tooltip-section-mdetail">
          <p className="tooltip-item-mdetail expense">
            <span>총지출</span><span>{totalExpense.toLocaleString()}원</span>
          </p>
          <p className="tooltip-item-mdetail sub-item">
            <span style={{ color: colorMap.fixed_expense }}>&nbsp;&nbsp;├ 고정지출</span><span>{data.fixed_expense.toLocaleString()}원</span>
          </p>
          <p className="tooltip-item-mdetail sub-item">
            <span style={{ color: colorMap.semi_fixed_expense }}>&nbsp;&nbsp;├ 반고정지출</span><span>{data.semi_fixed_expense.toLocaleString()}원</span>
          </p>
          <p className="tooltip-item-mdetail sub-item">
            <span style={{ color: colorMap.variable_expense }}>&nbsp;&nbsp;└ 유동지출</span><span>{data.variable_expense.toLocaleString()}원</span>
          </p>
        </div>
        <div className="tooltip-section-mdetail">
          <p className={`tooltip-item-mdetail ${difference >= 0 ? 'surplus' : 'deficit'}`}>
            {difference >= 0 ? (<span>잉여금</span>) : (<span>초과지출</span>)}
            <span>{difference.toLocaleString()}원</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const MonthlyDetail = ({ selectedYear, selectedMonth }: MonthlyDetailProps) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [_monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>([]);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [showAccountDonutChart, setShowAccountDonutChart] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const donutPopupRef = useRef<HTMLDivElement>(null);
  const donutButtonRef = useRef<HTMLButtonElement>(null);

  // --- useEffect 데이터 호출 (변경 없음) ---
  useEffect(() => {
    const fetchMonthlyDetails = async () => {
      if (!selectedYear || !selectedMonth) {
        setMonthlySummary(null);
        setCategorySpending([]);
        return;
      }
      try {
        const summaryResponse = await fetch(`${API_BASE_URL}/api/statistics/monthly_detail?year=${selectedYear}&month=${selectedMonth}`);
        const summaryData = summaryResponse.ok ? await summaryResponse.json() : null;
        setMonthlySummary(summaryData);

        const categoryResponse = await fetch(`${API_BASE_URL}/api/statistics/category_spending?year=${selectedYear}&month=${selectedMonth}`);
        if (categoryResponse.ok) setCategorySpending((await categoryResponse.json()) || []);
        else setCategorySpending([]);

        const balanceResponse = await fetch(`${API_BASE_URL}/api/statistics/account_balances`);
        if (balanceResponse.ok) setAccountBalances((await balanceResponse.json()) || []);
        else setAccountBalances([]);

        // 2. summaryData를 직접 사용해서 chartData 생성
        if (summaryData) {
          const totalIncome = summaryData.fixed_income + summaryData.variable_income;
          const totalExpense = summaryData.fixed_expense + summaryData.semi_fixed_expense + summaryData.variable_expense;
          const difference = totalIncome - totalExpense;

          const newChartData = [
            {
              name: '유형',
              totalIncome,
              totalExpense,
              ...summaryData,
              surplus: difference > 0 ? difference : 0,
              deficit: difference < 0 ? -difference : 0,
            },
          ];
          setChartData(newChartData);
        } else {
          setChartData([]);
        }
      } catch (error) {
        console.error('Error fetching monthly details:', error);
        setMonthlySummary(null);
        setCategorySpending([]);
        setAccountBalances([]);
        setChartData([]);
      }
    };
    fetchMonthlyDetails();
  }, [selectedYear, selectedMonth]);


  // ******************** 도넛 차트 관련 로직 추가 ********************
  const accountDonutData = accountBalances.map(account => ({
    name: account.account_name,
    value: account.balance,
  }));
  const totalAccountBalance = accountBalances.reduce((sum, acc) => sum + acc.balance, 0);
  const DONUT_COLORS = [
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
  ]

  const AccountDonutTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0];
    const percentage = totalAccountBalance > 0 ? (data.value / totalAccountBalance) * 100 : 0;
    return (
      <div className='asset-tooltip-mdetail'>
        <div className='tooltip-header-mdetail'>{data.name}</div>
        <div className='tooltip-total-mdetail'>
          {data.value.toLocaleString()}원
        </div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '4px' }}>
          전체의 {percentage.toFixed(1)}%
        </div>
      </div>
    );
  };

  // ****** 팝업 토글 핸들러 ******
  const toggleDonutChart = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!showAccountDonutChart && donutButtonRef.current) {
      const rect = donutButtonRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + window.scrollY + 8, // 버튼 아래에 8px 간격
        left: rect.left + window.scrollX - 150 // 가로 중앙 정렬 (팝업 너비의 절반 가정)
      });
    }
    setShowAccountDonutChart(!showAccountDonutChart);
  };

  const closeDonutChart = () => {
    setShowAccountDonutChart(false);
  };

  // ****** 외부 클릭 감지 및 스크롤 감지 (FixedExpenseManagement 방식) ******
  useEffect(() => {
    if (!showAccountDonutChart) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (donutPopupRef.current && !donutPopupRef.current.contains(e.target as Node)) {
        closeDonutChart();
      }
    };
    const handleScroll = () => {
      closeDonutChart();
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, true);  // capture 단계에서 모든 스크롤 감지
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showAccountDonutChart]);


  const currentData = chartData.length > 0 ? chartData[0] : null;
  const totalIncome = currentData?.totalIncome || 0;
  const totalExpense = currentData?.totalExpense || 0;

  const CustomBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    // 안전한 타입 체크
    if (
      !value ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !currentData
    ) {
      return null;
    }
    const dataKey = props.type; // LabelList에서 전달받은 type 사용
    if (!dataKey || typeof dataKey !== 'string') return null;

    // 비율 계산
    let percentage = 0;
    if (dataKey.includes('income') && totalIncome > 0) {
      percentage = (value / totalIncome) * 100;
    } else if (dataKey.includes('expense') && totalExpense > 0) {
      percentage = (value / totalExpense) * 100;
    }

    // 금액 포맷팅
    const amount = (value / 10000).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    return (
      <g>
        <text
          x={centerX}
          y={centerY - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-header)"
          fontSize="12"
          fontWeight="500"
        >
          {amount}
        </text>
        {percentage > 1 && (
          <text
            x={centerX}
            y={centerY + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-text-tertiary)"
            fontSize="10"
            fontWeight="400"
          >
            ({percentage.toFixed(1)}%)
          </text>
        )}
      </g>
    );
  };

  // Y축 눈금을 깔끔하게 만들기 위한 도메인 계산
  const rawMax = Math.max(totalIncome, totalExpense);
  // const maxDomain = rawMax > 0 ? Math.ceil(rawMax / 100000) * 100000 : 100000; // 10만 단위로 올림
  const getOptimalTickCount = (rawDomain: number) => {
    if (rawDomain <= 0) return { maxDomain: 500000, tickCount: 5 };

    const domainIn10K = rawDomain / 100000;
    const possibleSteps = [3, 2, 2.5, 1.5, 5, 1, 10, 15, 20, 25, 50, 100];

    for (const step of possibleSteps) {
      const adjustedDomain = Math.ceil(domainIn10K / step) * step;
      const tickCount = adjustedDomain / step + 1;

      if (tickCount >= 7 && tickCount <= 12) { // 조건 범위 조정
        return {
          tickCount: Math.round(tickCount),
          maxDomain: adjustedDomain * 100000
        };
      }
    }

    return {
      maxDomain: domainIn10K * 100000,
      tickCount: domainIn10K + 1
    };
  };
  const initialDomain = rawMax > 0 ? Math.ceil(rawMax / 100000) * 100000 : 100000;
  const { tickCount, maxDomain } = getOptimalTickCount(initialDomain);
  const formatYAxis = (tick: number) => `${tick / 10000}`;

  // 총지출 계산
  const totalCategorySpending = categorySpending.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h3 className="dashboard-card-title">월간 상세 분석<span className='dashboard-card-title subtle'> (단위:만)</span></h3>
        <div className="dashboard-card-subtitle">
          {selectedYear && selectedMonth ? `${selectedYear}년 ${selectedMonth}월 기준` : '데이터를 선택하세요'}
        </div>
      </div>
      <div className="dashboard-card-content monthly-details-grid">
        <div className='chart-area-wrapper'>
          <div className="chart-container-single">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 0, left: -10, bottom: 0 }} barCategoryGap="10%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-subtle)" />
                <XAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={false} />
                <YAxis type="number" domain={[0, maxDomain]} tickFormatter={formatYAxis} tick={{ fill: 'var(--color-text-secondary)' }} tickCount={tickCount} />
                <Tooltip
                  content={<CustomTooltip selectedYear={selectedYear} selectedMonth={selectedMonth} />}
                  cursor={{ fill: 'var(--color-bg-overlay-light)' }}
                  wrapperStyle={{ zIndex: 1000 }}
                />

                {/* 수입 막대 그룹 */}
                <Bar dataKey="fixed_income" name="고정수입" stackId="income" fill="var(--color-highlight-4)">
                  <LabelList dataKey="fixed_income" content={<CustomBarLabel type="fixed_income" />} />
                </Bar>
                <Bar dataKey="variable_income" name="유동수입" stackId="income" fill="var(--color-highlight-5)">
                  <LabelList dataKey="variable_income" content={<CustomBarLabel type="variable_income" />} />
                </Bar>
                <Bar dataKey="deficit" name="초과지출" stackId="income" fill="var(--color-highlight-1-transparent5)" />

                {/* 지출 막대 그룹 */}
                <Bar dataKey="fixed_expense" name="고정지출" stackId="expense" fill="var(--color-highlight-2)">
                  <LabelList dataKey="fixed_expense" content={<CustomBarLabel type="fixed_expense" />} />
                </Bar>
                <Bar dataKey="semi_fixed_expense" name="반고정지출" stackId="expense" fill="var(--color-highlight-6)">
                  <LabelList dataKey="semi_fixed_expense" content={<CustomBarLabel type="semi_fixed_expense" />} />
                </Bar>
                <Bar dataKey="variable_expense" name="유동지출" stackId="expense" fill="var(--color-highlight-3)">
                  <LabelList dataKey="variable_expense" content={<CustomBarLabel type="variable_expense" />} />
                </Bar>
                <Bar dataKey="surplus" name="잉여금" stackId="expense" fill="var(--color-highlight-1-transparent5)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <CustomLegend payload={[
            { value: '고정수입', color: 'var(--color-highlight-4)', dataKey: 'fixed_income' },
            { value: '유동수입', color: 'var(--color-highlight-5)', dataKey: 'variable_income' },
            { value: '고정지출', color: 'var(--color-highlight-2)', dataKey: 'fixed_expense' },
            { value: '반고정지출', color: 'var(--color-highlight-6)', dataKey: 'semi_fixed_expense' },
            { value: '유동지출', color: 'var(--color-highlight-3)', dataKey: 'variable_expense' },
            { value: '잉여금', color: 'var(--color-highlight-1-transparent5)', dataKey: 'surplus' },
            { value: '초과지출', color: 'var(--color-highlight-1-transparent5)', dataKey: 'deficit' },
          ]} chartData={chartData} />
        </div>

        {/* 중앙: 3열 테이블 */}
        <div className="category-spending-container">
          <h4 className="category-spending-title">대분류별 지출</h4>
          <div className="category-table-wrapper">
            <table className="category-table">
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th>금액</th>
                  <th>비율</th>
                </tr>
              </thead>
              <tbody>
                {categorySpending.length > 0 ? (
                  <>
                    {categorySpending.map((item, index) => (
                      <tr key={index}>
                        <td>{item.name}</td>
                        <td className="td-amount">{item.value.toLocaleString()}원</td>
                        <td className="td-percentage">
                          <div className="percentage-cell">
                            <div
                              className="percentage-bar-fill"
                              style={{
                                width: `${item.percentage}%`,
                                backgroundColor: `var(--color-highlight-${((index + 1) % 6) + 1})`
                              }}
                            ></div>
                            <span className="percentage-text">{item.percentage.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td className="total-label">계</td>
                      <td className="td-amount total-amount">{totalCategorySpending.toLocaleString()}원</td>
                      <td className="td-percentage">
                        {/* <div className="percentage-cell">
                          <div className="percentage-bar-fill total-bar" style={{ width: '100%' }}></div>
                          <span className="percentage-text">100.0%</span>
                        </div> */}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={3} className="no-data-message">해당 월의 지출 내역이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 계좌별 잔액 */}
        <div className="account-balance-container">
          <h4 className="account-balance-title">계좌잔고
            <button
              ref={donutButtonRef}
              className="donut-toggle-button-mdetail"
              onClick={toggleDonutChart}
              title="도넛 차트 보기"
            >
              <PiChartDonutFill />
            </button>
          </h4>

          <div className="account-balance-wrapper">
            <table className="account-balance-table">
              <thead>
                <tr>
                  <th>계좌명</th>
                  <th>잔액</th>
                </tr>
              </thead>
              <tbody>
                {accountBalances.length > 0 ? (
                  <>
                    {accountBalances.map((account, index) => (
                      <tr key={index}>
                        <td>{account.account_name}</td>
                        <td className="td-balance">
                          {account.balance === 0 ? '-' : `${account.balance.toLocaleString()}원`}
                        </td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td className="total-label">계</td>
                      <td className="td-balance total-balance">
                        {accountBalances.reduce((sum, acc) => sum + acc.balance, 0).toLocaleString()}원
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={2} className="no-data-message">계좌 정보가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showAccountDonutChart && accountBalances.length > 0 && popupPosition && (
        <div
          ref={donutPopupRef}
          className="donut-popup-container-mdetail"
          style={{ position: 'fixed', top: `${popupPosition.top}px`, left: `${popupPosition.left}px`  }}
          onClick={e => e.stopPropagation()}>
          <div className='donut-popup-header-mdetail'>
            <h4>계좌별 잔액 비율</h4>
            <button className="donut-popup-close-mdetail" onClick={closeDonutChart}>&times;</button>
          </div>
          <div className='donut-popup-chart-mdetail'>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={accountDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                >
                  {accountDonutData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                  <Label
                    value={`총 \n${totalAccountBalance.toLocaleString()}원`}
                    position="center"
                    style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      fill: 'var(--color-text-header)',
                    }}
                  />
                </Pie>
                <RechartsTooltip content={<AccountDonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyDetail;