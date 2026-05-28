import React, { useState, useEffect } from 'react';
import {  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, Legend } from 'recharts';
import './AssetPortfolio.css';

const API_BASE_URL = 'http://127.0.0.1:5050';

// ****** 타입 정의 ******
interface MonthlyAccountData {
    month: string;
    accounts: {
        account_id: number;
        account_name: string;
        balance: number;
    }[];
    total: number;
}

interface AssetPortfolioProps {
    // props 없음 (전체 기간 독립적으로 동작)
}

// ****** 메인 컴포넌트 ******
const AssetPortfolio: React.FC<AssetPortfolioProps> = () => {
    const [monthlyData, setMonthlyData] = useState<MonthlyAccountData[]>([]);
    const [loading, setLoading] = useState(true);

    // ****** 데이터 로딩 ******
    useEffect(() => {
        loadAssetData();
    }, []);

    const loadAssetData = async () => {
        setLoading(true);
        try {
            const monthlyRes = await fetch(`${API_BASE_URL}/api/statistics/asset_portfolio_monthly`);
            const monthlyDataRaw = await monthlyRes.json();
            setMonthlyData(monthlyDataRaw);
        } catch (error) {
            console.error('Error loading asset data:', error);
        } finally {
            setLoading(false);
        }
    };

    // ****** 영역 차트 데이터 변환 ******
    const areaChartData = monthlyData.map(monthData => {
        const dataPoint: any = { month: monthData.month };
        monthData.accounts.forEach(acc => {
            dataPoint[acc.account_name] = acc.balance;
        });
        dataPoint.total = monthData.total;
        return dataPoint;
    });

    // 모든 계좌명 목록 (범례용)
    const allAccountNames = monthlyData.length > 0
        ? monthlyData[0].accounts
            .sort((a, b) => a.account_id - b.account_id)  // account_id 오름차순 정렬
            .map(acc => acc.account_name)
        : [];

    // ****** 색상 팔레트 ******
    const COLORS = [
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

    // ****** 커스텀 툴팁 (영역 차트용) ******
    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload || payload.length === 0) return null;

        const month = payload[0].payload.month;
        const total = payload[0].payload.total;
        const formattedMonth = month.substring(0, 4) + '년 ' + month.substring(5) + '월';

        // 전월 대비 증감 계산
        const currentIndex = areaChartData.findIndex(d => d.month === month);
        let changeAmount = 0;
        let changePercent = 0;

        if (currentIndex > 0) {
            const prevTotal = areaChartData[currentIndex - 1].total;
            changeAmount = total - prevTotal;
            changePercent = prevTotal !== 0 ? (changeAmount / prevTotal) * 100 : 0;
        }

        return (
            <div className="asset-tooltip-aportfolio">
                <div className="tooltip-header-aportfolio">{formattedMonth}</div>
                <div className="tooltip-total-aportfolio">
                    총 자산: {total.toLocaleString()}원
                </div>
                {currentIndex > 0 && (
                    <div className={`tooltip-change-aportfolio ${changeAmount >= 0 ? 'positive' : 'negative'}`}>
                        전월 대비: {changeAmount >= 0 ? '+' : ''}{changeAmount.toLocaleString()}원 ({changePercent.toFixed(1)}%)
                    </div>
                )}
                <div className="tooltip-divider-aportfolio"></div>
                {payload.map((entry: any, index: number) => {
                    if (entry.dataKey === 'total') return null;
                    const percentage = total !== 0 ? (entry.value / total) * 100 : 0;
                    return (
                        <div key={index} className="tooltip-item-aportfolio">
                            <span className="tooltip-item-name-aportfolio" style={{ color: entry.color }}>
                                {entry.name}
                            </span>
                            <span className="tooltip-item-value-aportfolio">
                                {entry.value.toLocaleString()}원
                            </span>
                            <span className="tooltip-item-percent-aportfolio">
                                ({percentage.toFixed(0)}%)
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ****** 커스텀 범례 추가 ******
    const CustomLegend = (props: any) => {
        const { payload } = props;
        // account_id 순서대로 정렬된 payload
        const sortedPayload = [...payload].sort((a, b) => {
            const indexA = allAccountNames.indexOf(a.value);
            const indexB = allAccountNames.indexOf(b.value);
            return indexA - indexB;
        });

        return (
            <ul style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                listStyle: 'none',
                padding: 0,
                margin: 0,
                fontSize: '12px'
            }}>
                {sortedPayload.map((entry: any, index: number) => {
                    // const accountBalance = areaChartData.length > 0 ? areaChartData[areaChartData.length - 1][entry.value] : 0;
                    // let opacity = 1;
                    // if (accountBalance === 0) {
                    //     opacity = 0.5;
                    // } else if (lastMonthTotal > 0 && (accountBalance / lastMonthTotal) <= 0.2) {
                    //     opacity = 0.7;
                    // }
                    return (
                        <li key={`legend-${index}`} style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginRight: '16px',
                            marginTop: '8px'
                        }}>
                            <span style={{
                                display: 'inline-block',
                                width: '14px',
                                height: '14px',
                                backgroundColor: entry.color,
                                marginRight: '4px'
                            }}></span>
                            <span style={{ color: entry.color }}>{entry.value}</span>
                        </li>
                    );
                })}
            </ul>
        );
    };

    // ****** 이중 X축 렌더링 함수 ******
    // 월 표시 (숫자만)
    // const monthTickFormatter = (tick: string) => {
    //     return tick.substring(2, 4) + '-' + tick.substring(5); // "2024-08" → "24-08"
    //     // return tick.substring(5); // "2024-08" → "08"
    // };
    const renderMonthTick = (props: any) => {
        const { x, y, payload } = props;
        const tick = payload.value;
        const month = tick.substring(5); // "MM"
        const year = tick.substring(2, 4); // "YY"

        return (
            <g transform={`translate(${x},${y})`}>
                <text
                    x={0}
                    y={0}
                    dy={8}
                    textAnchor="middle"
                    fill="var(--color-text-secondary)"
                    fontSize={12}
                >
                    <tspan x={1} dy={10}>{year}</tspan>  {/* 첫 번째 줄: YY */}
                    <tspan x={0} dy={18}>{month}</tspan>  {/* 두 번째 줄: MM */}
                </text>
                <line x1={0} y1={11} x2={0} y2={18} stroke="var(--color-text-secondary)" strokeWidth={0.5} />
            </g>
        );
    };

    const brushTickFormatter = (tick: string) => {
        const month = tick.substring(5); // "MM"
        const year = tick.substring(2, 4); // "YY"

        return `${year}-${month}`;
    };


    // ****** 렌더링 ******
    if (loading) {
        return (
            <div className="dashboard-card">
                <div className="dashboard-card-header">
                    <h3 className="dashboard-card-title">자산 포트폴리오</h3>
                </div>
                <div className="dashboard-card-content">
                    <div className="loading-message-aportfolio">데이터 로딩 중...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-card">
            <div className="dashboard-card-header">
                <h3 className="dashboard-card-title">자산 포트폴리오</h3>
                <div className="dashboard-card-subtitle">전체 기간 기준</div>
            </div>

            <div className="dashboard-card-content asset-content-aportfolio">
                <div className="area-tab-container-aportfolio">
                    <ResponsiveContainer width="100%" height={490}>
                        <AreaChart data={areaChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                            <XAxis
                                dataKey="month"
                                stroke="var(--color-text-secondary)"
                                // tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                                // tickFormatter={monthTickFormatter}
                                // height={30}
                                interval={1}
                                tick={renderMonthTick}
                                height={40}
                            />
                            <YAxis
                                stroke="var(--color-text-secondary)"
                                tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                                tickCount={7}
                                tickFormatter={(value) => `${(value / 10000).toFixed(0)}만`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {/* <Legend
                                wrapperStyle={{ fontSize: '12px', paddingTop: '30px', alignContent: 'center' }}
                                iconType="rect"
                            /> */}
                            <Legend
                                content={<CustomLegend />}
                                wrapperStyle={{ paddingTop: '30px' }}
                            />
                            {allAccountNames.map((accName, index) => (
                                <Area
                                    key={accName}
                                    type="monotone"
                                    dataKey={accName}
                                    stackId="1"
                                    stroke={COLORS[index % COLORS.length]}
                                    fill={COLORS[index % COLORS.length]}
                                    isAnimationActive={false}
                                />
                            ))}
                            <Brush
                                dataKey="month"
                                height={25}
                                stroke="var(--color-accent-blue)"
                                fill="var(--color-bg-content)"
                                tickFormatter={brushTickFormatter}
                                y={400}
                                startIndex={0}
                                endIndex={areaChartData.length - 1}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default AssetPortfolio;