import database
from datetime import datetime
from dateutil.relativedelta import relativedelta

def get_dashboard_trend_range():
    """데이터베이스에서 저장된 대시보드 기간 설정을 불러옵니다."""
    range_str = database.get_setting('dashboard_trend_range')
    if range_str:
        try:
            # "2024-01,2025-01" 같은 문자열을 ['2024-01', '2025-01'] 리스트로 변환
            parts = range_str.split(',')
            if len(parts) == 2:
                return parts
        except Exception:
            return None
    return None

def set_dashboard_trend_range(range_list):
    """대시보드 기간 설정을 데이터베이스에 저장합니다."""
    if isinstance(range_list, list) and len(range_list) == 2:
        # ['2024-01', '2025-01'] 리스트를 "2024-01,2025-01" 문자열로 변환
        range_str = f"{range_list[0]},{range_list[1]}"
        database.set_setting('dashboard_trend_range', range_str)

def get_dashboard_selected_date():
    """데이터베이스에서 저장된 대시보드 선택 년/월 설정을 불러옵니다."""
    date_str = database.get_setting('dashboard_selected_date')
    if date_str:
        try:
            import json
            # '{"year": 2025, "month": 7}' 같은 JSON 문자열을 파싱
            date_dict = json.loads(date_str)
            if 'year' in date_dict and 'month' in date_dict:
                return date_dict
        except Exception:
            return None
    return None

def set_dashboard_selected_date(year, month):
    """대시보드 선택 년/월 설정을 데이터베이스에 저장합니다."""
    import json
    if year is not None and month is not None:
        # {'year': 2025, 'month': 7}을 JSON 문자열로 변환
        date_str = json.dumps({'year': year, 'month': month})
        database.set_setting('dashboard_selected_date', date_str)
    

def get_monthly_summary(start_month_str=None, end_month_str=None):
    """
    지정된 기간 동안의 월별 상세 수입/지출을 계산합니다.
    기간이 지정되지 않으면 전체 기간을 반환합니다.
    """
    conn = database.get_db_connection()
    
    query = """
        SELECT
            strftime('%Y-%m', t.transaction_date) AS month,
            SUM(CASE WHEN mc.name = '고정수입' THEN t.amount ELSE 0 END) AS fixed_income,
            SUM(CASE WHEN mc.name = '유동수입' THEN t.amount ELSE 0 END) AS variable_income,
            SUM(CASE WHEN t.type = '고정지출' THEN ABS(t.amount) ELSE 0 END) AS fixed_expense,
            SUM(CASE WHEN t.type = '반고정지출' THEN ABS(t.amount) ELSE 0 END) AS semi_fixed_expense,
            SUM(CASE WHEN t.type = '유동지출' THEN ABS(t.amount) ELSE 0 END) AS variable_expense
        FROM transactions t
        LEFT JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        LEFT JOIN major_categories mc ON mnc.major_category_id = mc.id
    """
    
    params = []
    if start_month_str and end_month_str:
        query += " WHERE strftime('%Y-%m', t.transaction_date) BETWEEN ? AND ?"
        params.extend([start_month_str, end_month_str])

    query += " GROUP BY month ORDER BY month ASC"
    
    cursor = conn.execute(query, params)
    summary = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return summary

def get_available_months():
    """DB에 있는 모든 거래내역의 월 목록(YYYY-MM)을 반환합니다."""
    conn = database.get_db_connection()
    query = "SELECT DISTINCT strftime('%Y-%m', transaction_date) as month FROM transactions ORDER BY month ASC"
    cursor = conn.execute(query)
    months = [row['month'] for row in cursor.fetchall()]
    conn.close()
    return months

def get_monthly_detail_summary(year, month):
    """지정된 월의 상세 수입/지출 내역을 계산합니다."""
    conn = database.get_db_connection()
    month_str = f"{year}-{month:02d}"
    
    query = """--sql
        SELECT
            SUM(CASE WHEN mc.name = '고정수입' THEN t.amount ELSE 0 END) AS fixed_income,
            SUM(CASE WHEN mc.name = '유동수입' THEN t.amount ELSE 0 END) AS variable_income,
            SUM(CASE WHEN t.type = '고정지출' THEN ABS(t.amount) ELSE 0 END) AS fixed_expense,
            SUM(CASE WHEN t.type = '반고정지출' THEN ABS(t.amount) ELSE 0 END) AS semi_fixed_expense,
            SUM(CASE WHEN t.type = '유동지출' THEN ABS(t.amount) ELSE 0 END) AS variable_expense
        FROM transactions t
        LEFT JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        LEFT JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) = ?
    """
    
    cursor = conn.execute(query, (month_str,))
    # fetchone()은 결과가 없을 때 None을 반환할 수 있으므로, 기본값을 설정합니다.
    row = cursor.fetchone()
    conn.close()

    if row and any(row):
        summary = dict(row)
    else:
        # 해당 월에 데이터가 전혀 없을 경우 0으로 채워진 기본 구조를 반환합니다.
        summary = {
            "fixed_income": 0,
            "variable_income": 0,
            "fixed_expense": 0,
            "semi_fixed_expense": 0,
            "variable_expense": 0
        }
        
    return summary

def get_category_spending(year, month):
    """지정된 월의 대분류별 지출을 계산합니다."""
    conn = database.get_db_connection()
    query = """--sql
        SELECT
            mc.name,
            SUM(ABS(t.amount)) as value
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y', t.transaction_date) = ? 
          AND strftime('%m', t.transaction_date) = ?
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY mc.id, mc.name
        ORDER BY value DESC
    """
    cursor = conn.execute(query, (str(year), f'{month:02d}'))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    total_spending = sum(row['value'] for row in rows)
    if total_spending == 0:
        return []

    result = [
        {
            'name': row['name'],
            'value': row['value'],
            'percentage': (row['value'] / total_spending) * 100
        }
        for row in rows
    ]
    
    return result

def get_account_balances():
    """모든 계좌의 잔액을 계산합니다."""
    conn = database.get_db_connection()
    query = """
        SELECT 
            a.name AS account_name,
            COALESCE(SUM(t.amount), 0) AS balance
        FROM accounts a
        LEFT JOIN transactions t ON a.id = t.account_id
        WHERE a.name NOT LIKE '(exp)%' AND a.name NOT LIKE '(숨김)%'
        GROUP BY a.id, a.name, a.display_order
        ORDER BY a.display_order ASC
    """
    cursor = conn.execute(query)
    balances = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return balances

def get_account_balances_monthly():
    """
    전체 기간의 월별 계좌 잔액 추이를 반환합니다.
    각 달의 말일 기준 누적 잔액을 계산합니다.
    
    반환 구조:
    [
        {
            "month": "2024-08",
            "accounts": [
                {"account_id": 1, "account_name": "국민ONE", "balance": 1235532},
                {"account_id": 2, "account_name": "토스뱅크", "balance": -50000},
                ...
            ],
            "total": 1185532  # 해당 월 전체 계좌 합계
        },
        ...
    ]
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    # 모든 계좌 목록 가져오기
    cursor.execute("""--sql
        SELECT id, name, display_order
        FROM accounts
        WHERE name NOT LIKE '(exp)%' AND name NOT LIKE '(숨김)%'
        ORDER BY display_order
    """)
    accounts = cursor.fetchall()
    
    # 거래내역이 있는 모든 월 목록 가져오기
    cursor.execute("""--sql
        SELECT DISTINCT strftime('%Y-%m', transaction_date) as month
        FROM transactions
        ORDER BY month
    """)
    months = [row['month'] for row in cursor.fetchall()]
    
    result = []
    
    for month in months:
        # 해당 월 말일까지의 각 계좌별 누적 잔액 계산
        month_data = {
            "month": month,
            "accounts": [],
            "total": 0
        }
        
        for account in accounts:
            account_id = account['id']
            account_name = account['name']
            
            # 해당 월 말일까지의 수입 합계
            cursor.execute("""--sql
                SELECT COALESCE(SUM(amount), 0) as income
                FROM transactions
                WHERE account_id = ?
                AND strftime('%Y-%m', transaction_date) <= ?
                AND amount > 0
            """, (account_id, month))
            income = cursor.fetchone()['income']
            
            # 해당 월 말일까지의 지출 합계 (음수이므로 절댓값)
            cursor.execute("""--sql
                SELECT COALESCE(SUM(ABS(amount)), 0) as expense
                FROM transactions
                WHERE account_id = ?
                AND strftime('%Y-%m', transaction_date) <= ?
                AND amount < 0
            """, (account_id, month))
            expense = cursor.fetchone()['expense']
            
            # 누적 잔액 = 수입 - 지출
            balance = income - expense
            
            month_data["accounts"].append({
                "account_id": account_id,
                "account_name": account_name,
                "balance": balance
            })
            
            month_data["total"] += balance
        
        result.append(month_data)
    
    conn.close()
    return result

def get_category_treemap(year, month):
    """
    지정된 월의 대분류-소분류별 지출 비율을 계층 구조로 반환합니다.
    """
    conn = database.get_db_connection()
    query = """
        SELECT
            mc.id AS major_id,
            mc.name AS major_name,
            mnc.uuid AS minor_uuid,
            mnc.name AS minor_name,
            SUM(ABS(t.amount)) as value
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y', t.transaction_date) = ?
          AND strftime('%m', t.transaction_date) = ?
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY mc.id, mc.name, mnc.uuid, mnc.name
        ORDER BY mc.id, value DESC
    """
    cursor = conn.execute(query, (str(year), f'{month:02d}'))
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # 계층 구조로 변환
    major_map = {}
    for row in rows:
        major_id = row['major_id']
        if major_id not in major_map:
            major_map[major_id] = {
                'name': row['major_name'],
                'value': 0,
                'children': []
            }
        major_map[major_id]['children'].append({
            'name': row['minor_name'],
            'value': row['value']
        })
        major_map[major_id]['value'] += row['value']

    # 최상위 노드 리스트로 변환
    result = sorted(list(major_map.values()), key=lambda x: x['value'], reverse=True)
    return result

def get_top_spending_categories(start_month_str, end_month_str):
    """
    지정된 기간 동안 지출액 기준 및 지출 빈도 기준 상위 10개 소분류와
    각 소분류에 대한 상위 10개 거래처 상세 내역을 반환합니다.
    """
    conn = database.get_db_connection()
    params = (start_month_str, end_month_str)
    
    # 1. 지출액 기준 TOP 10 소분류 UUID 조회
    query_top_amount_categories = """--sql
        SELECT mnc.uuid, mnc.name, SUM(ABS(t.amount)) as value
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) BETWEEN ? AND ?
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY mnc.uuid, mnc.name
        ORDER BY value DESC
        LIMIT 10
    """
    top_amount_categories = conn.execute(query_top_amount_categories, params).fetchall()

    # 2. 지출 빈도 기준 TOP 10 소분류 UUID 조회
    query_top_freq_categories = """--sql
        SELECT mnc.uuid, mnc.name, COUNT(t.id) as value
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) BETWEEN ? AND ?
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY mnc.uuid, mnc.name
        ORDER BY value DESC
        LIMIT 10
    """
    top_freq_categories = conn.execute(query_top_freq_categories, params).fetchall()

    # 3. 각 카테고리별 상세 내역 조회 및 결과 조합
    top_by_amount = []
    for category in top_amount_categories:
        details_query = """--sql
            SELECT merchant as name, SUM(ABS(amount)) as value, COUNT(id) as count
            FROM transactions
            WHERE minor_category_uuid = ? AND strftime('%Y-%m', transaction_date) BETWEEN ? AND ?
            GROUP BY merchant
            ORDER BY value DESC
            LIMIT 10
        """
        details_cursor = conn.execute(details_query, (category['uuid'], start_month_str, end_month_str))
        details = [dict(row) for row in details_cursor.fetchall()]

        total_count_query = "SELECT COUNT(DISTINCT merchant) FROM transactions WHERE minor_category_uuid = ? AND strftime('%Y-%m', transaction_date) BETWEEN ? AND ?"
        total_count = conn.execute(total_count_query, (category['uuid'], start_month_str, end_month_str)).fetchone()[0]
        
        top_by_amount.append({
            "name": category['name'],
            "value": category['value'],
            "details": {"items": details, "total_count": total_count}
        })

    top_by_frequency = []
    for category in top_freq_categories:
        details_query = """--sql
            SELECT merchant as name, COUNT(id) as value
            FROM transactions
            WHERE minor_category_uuid = ? AND strftime('%Y-%m', transaction_date) BETWEEN ? AND ?
            GROUP BY merchant
            ORDER BY value DESC
            LIMIT 10
        """
        details_cursor = conn.execute(details_query, (category['uuid'], start_month_str, end_month_str))
        details = [dict(row) for row in details_cursor.fetchall()]

        total_count_query = "SELECT COUNT(DISTINCT merchant) FROM transactions WHERE minor_category_uuid = ? AND strftime('%Y-%m', transaction_date) BETWEEN ? AND ?"
        total_count = conn.execute(total_count_query, (category['uuid'], start_month_str, end_month_str)).fetchone()[0]

        top_by_frequency.append({
            "name": category['name'],
            "value": category['value'],
            "details": {"items": details, "total_count": total_count}
        })

    conn.close()
    
    return {
        "by_amount": top_by_amount,
        "by_frequency": top_by_frequency
    }

def get_all_budgets():
    """모든 예산 설정을 조회 (지출액 집계 없음)"""
    conn = database.get_db_connection()
    query = """--sql
        SELECT
            b.id,
            b.budget_type,
            b.target_id,
            b.amount,
            CASE
                WHEN b.budget_type = 'major' THEN mc.name
                WHEN b.budget_type = 'minor' THEN mnc.name
            END as target_name,
            COALESCE(mnc.major_category_id, CAST(b.target_id AS INTEGER)) as major_category_id,
            CASE
                WHEN b.budget_type = 'major' THEN mc.name
                WHEN b.budget_type = 'minor' THEN mc_of_mnc.name
            END as major_category_name
        FROM budgets b
        LEFT JOIN major_categories mc ON b.budget_type = 'major' AND b.target_id = CAST(mc.id AS TEXT)
        LEFT JOIN minor_categories mnc ON b.budget_type = 'minor' AND b.target_id = mnc.uuid
        LEFT JOIN major_categories mc_of_mnc ON mnc.major_category_id = mc_of_mnc.id
    """
    budgets = [dict(row) for row in conn.execute(query).fetchall()]
    conn.close()
    return budgets

def add_budget(data):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO budgets (budget_type, target_id, amount) VALUES (?, ?, ?)",
        (data['budget_type'], data['target_id'], data['amount'])
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {'id': new_id, **data}

def update_budget(budget_id, data):
    conn = database.get_db_connection()
    conn.execute(
        "UPDATE budgets SET budget_type = ?, target_id = ?, amount = ? WHERE id = ?",
        (data['budget_type'], data['target_id'], data['amount'], budget_id)
    )
    conn.commit()
    conn.close()
    return {'id': budget_id, **data}

def delete_budget(budget_id):
    conn = database.get_db_connection()
    conn.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
    conn.commit()
    conn.close()
    return {'message': 'Budget deleted successfully'}

def get_fixed_expenses(start_month_str, end_month_str):
    """
    지정된 기간 동안의 고정비(고정지출) 내역을 분석하여 반환합니다.
    
    반환 데이터 구조:
    - merchant: 거래처명
    - category: "{대분류}-{소분류}" 형태
    - major_category: 대분류명
    - minor_category: 소분류명
    - day_range: 평균 출금일 (단일 값 또는 "22일 ~ 24일" 형태)
    - amount_range: 평균 지출액 (단일 값 또는 "30,000원 ~ 34,000원" 형태)
    - amount_min: 최소 금액 (증감 계산용)
    - amount_max: 최대 금액 (증감 계산용)
    - trend: "up" | "down" | "same" | "none" (증감 상태)
    - recent_months: [bool, bool, bool] (최근 3개월 거래 여부)
    - transaction_details: [{"date": "YYYY-MM-DD", "amount": 금액}, ...]
    - total_count: 전체 거래 횟수
    - avg_count_per_month: 월평균 거래 횟수
    """
    conn = database.get_db_connection()
    
    # ***** 1. 전체 기간의 고정지출 데이터 조회 *****
    query_all = """--sql
        SELECT
            t.merchant,
            mc.name as major_category,
            mnc.name as minor_category,
            strftime('%d', t.transaction_date) as day,
            strftime('%Y-%m', t.transaction_date) as month,
            ABS(t.amount) as amount,
            t.transaction_date as date
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE t.type = '고정지출'
          AND strftime('%Y-%m', t.transaction_date) BETWEEN ? AND ?
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        ORDER BY t.merchant, mc.name, mnc.name, t.transaction_date
    """
    
    rows = [dict(row) for row in conn.execute(query_all, (start_month_str, end_month_str)).fetchall()]
    conn.close()
    
    # ***** 2. 거래처명-카테고리 조합으로 그룹화 *****
    grouped = {}
    for row in rows:
        key = f"{row['merchant']}|{row['major_category']}|{row['minor_category']}"
        if key not in grouped:
            grouped[key] = {
                'merchant': row['merchant'],
                'major_category': row['major_category'],
                'minor_category': row['minor_category'],
                'transactions': []
            }
        grouped[key]['transactions'].append({
            'date': row['date'],
            'day': int(row['day']),
            'month': row['month'],
            'amount': row['amount']
        })
    
    # ***** 3. 2개월 이상 출현한 항목만 필터링 *****
    result = []
    for key, data in grouped.items():
        unique_months = set(tx['month'] for tx in data['transactions'])
        if len(unique_months) < 2:
            continue  # 2개월 미만 제외
        
        # ***** 4. 출금일 범위 계산 *****
        days = [tx['day'] for tx in data['transactions']]
        day_min, day_max = min(days), max(days)
        if day_min == day_max:
            day_range = f"{day_min}일"
        else:
            day_range = f"{day_min}일 ~ {day_max}일"
        
        # ***** 5. 지출액 범위 계산 *****
        amounts = [tx['amount'] for tx in data['transactions']]
        amount_min, amount_max = min(amounts), max(amounts)
        if amount_min == amount_max:
            amount_range = f"{amount_min:,}원"
        else:
            amount_range = f"{amount_min:,}원 ~ {amount_max:,}원"
        
        # ***** 6. 증감 계산 (마지막 2개월 비교) *****
        sorted_months = sorted(unique_months, reverse=True)
        trend = "none"
        if len(sorted_months) >= 2:
            last_month = sorted_months[0]
            prev_month = sorted_months[1]
            
            last_month_txs = [tx for tx in data['transactions'] if tx['month'] == last_month]
            prev_month_txs = [tx for tx in data['transactions'] if tx['month'] == prev_month]
            
            if last_month_txs and prev_month_txs:
                last_avg = sum(tx['amount'] for tx in last_month_txs) / len(last_month_txs)
                prev_avg = sum(tx['amount'] for tx in prev_month_txs) / len(prev_month_txs)
                
                if last_avg > prev_avg:
                    trend = "up"
                elif last_avg < prev_avg:
                    trend = "down"
                else:
                    trend = "same"
        
        # ***** 7. 최근 3개월 거래 여부 계산 *****
        end_month_obj = datetime.strptime(end_month_str, '%Y-%m')
        last_3_months_list = [
            (end_month_obj - relativedelta(months=2)).strftime('%Y-%m'),  # 전전월
            (end_month_obj - relativedelta(months=1)).strftime('%Y-%m'),  # 전월
            end_month_str  # 마지막 달
        ]

        # 전체 기간 시작월 확인
        start_month_obj = datetime.strptime(start_month_str, '%Y-%m')

        # 각 월에 거래가 있는지 확인 (기간 밖이면 None 처리)
        recent_months = []
        for month in last_3_months_list:
            month_obj = datetime.strptime(month, '%Y-%m')
            if month_obj < start_month_obj:
                recent_months.append(None)  # 기간 밖이면 None
            else:
                recent_months.append(month in unique_months)  # 기간 내에서 거래 여부 확인
                
        # ***** 8. 거래 상세 내역 *****
        transaction_details = [
            {"date": tx['date'], "amount": tx['amount']}
            for tx in sorted(data['transactions'], key=lambda x: x['date'])
        ]
        
        # ***** 9. 전체 거래 횟수 및 월평균 계산 *****
        total_count = len(data['transactions'])
        avg_count_per_month = round(total_count / len(unique_months), 1)
        
        result.append({
            'merchant': data['merchant'],
            'category': f"{data['major_category']}-{data['minor_category']}",
            'major_category': data['major_category'],
            'minor_category': data['minor_category'],
            'day_range': day_range,
            'amount_range': amount_range,
            'amount_min': amount_min,
            'amount_max': amount_max,
            'trend': trend,
            'recent_months': recent_months,
            'transaction_details': transaction_details,
            'total_count': total_count,
            'avg_count_per_month': avg_count_per_month
        })
    
    # ***** 10. 평균 출금일 빠른 순으로 정렬 *****
    result.sort(key=lambda x: int(x['day_range'].split('일')[0]))
    
    return result






def get_consumption_pattern_insights(year, month):
    """
    지정된 월의 소비 패턴 인사이트를 생성합니다.
    반환 데이터:
    {
        "heatmap_data": [...],  # 요일별 × 카테고리별 히트맵 데이터
        "insights": [...]        # 자동 생성된 인사이트 (최대 5개)
    }
    """
    conn = database.get_db_connection()
    month_str = f"{year}-{month:02d}"
    insights = []
    settings = database.get_consumption_pattern_settings()
    
    # ***** 1. 요일별 × 카테고리별 히트맵 데이터 생성 *****
    heatmap_query = """--sql
        SELECT
            CASE CAST(strftime('%w', t.transaction_date) AS INTEGER)
                WHEN 0 THEN '일' WHEN 1 THEN '월' WHEN 2 THEN '화'
                WHEN 3 THEN '수' WHEN 4 THEN '목' WHEN 5 THEN '금'
                WHEN 6 THEN '토' END as weekday,
            mc.id as major_category_id,
            mc.name as major_category_name,
            SUM(ABS(t.amount)) as total_amount,
            COUNT(t.id) as transaction_count
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) = ?
          AND t.amount < 0
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY weekday, mc.id, mc.name
        ORDER BY total_amount DESC
    """
    heatmap_data = [dict(row) for row in conn.execute(heatmap_query, (month_str,)).fetchall()]
    
    # ***** 1-1. 각 히트맵 셀에 대한 거래내역 추가 *****
    for cell in heatmap_data:
        weekday = cell['weekday']
        category_name = cell['major_category_name']
        
        # 요일 문자열을 숫자로 변환
        weekday_map = {'일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6}
        weekday_num = weekday_map[weekday]
        
        # 해당 요일 + 카테고리 조합의 거래내역 조회
        detail_query = """--sql
            SELECT 
                t.transaction_date as date,
                t.merchant,
                ABS(t.amount) as amount
            FROM transactions t
            JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
            JOIN major_categories mc ON mnc.major_category_id = mc.id
            WHERE strftime('%Y-%m', t.transaction_date) = ?
              AND CAST(strftime('%w', t.transaction_date) AS INTEGER) = ?
              AND mc.name = ?
              AND t.amount < 0
            ORDER BY t.transaction_date DESC
        """
        transactions = conn.execute(detail_query, (month_str, weekday_num, category_name)).fetchall()
        
        cell['transactions'] = [
            {
                'date': row['date'],
                'merchant': row['merchant'],
                'amount': row['amount']
            }
            for row in transactions
        ]

    # ***** 2. 인사이트 생성 *****
    
    # 2-1. 주말/평일 소비 비교
    weekend_insight = _analyze_weekend_pattern(conn, month_str, settings)
    if weekend_insight: insights.append(weekend_insight)
    
    # 2-2. 특정 요일 집중 소비
    weekday_insight = _find_recurring_weekday_pattern(conn, month_str, settings)
    if weekday_insight: insights.append(weekday_insight)
    
    # 2-3. 급여일 기준 소비 변화
    payday_insight = _analyze_payday_spending(conn, year, month_str, settings)
    if payday_insight: insights.append(payday_insight)
    
    # 2-4. 월초/월말 소비 차이
    month_period_insight = _analyze_month_period_pattern(conn, year, month_str, settings)
    if month_period_insight: insights.append(month_period_insight)
    
    # 2-5. 소액 다빈도 지출
    impulse_insight = _detect_impulse_spending(conn, year, month_str, settings)
    if impulse_insight: insights.append(impulse_insight)
    
    # 2-6. 특정 카테고리 급증
    spike_insight = _detect_category_spike(conn, year, month_str, settings)
    if spike_insight: insights.append(spike_insight)
    
    # 2-7. 예산 소진율 경고
    budget_insight = _analyze_budget_trend(conn, year, month, settings)
    if budget_insight: insights.append(budget_insight)
    
    # 2-8. 무지출 챌린지
    no_spend_insight = _detect_no_spend_streak(conn, year, month_str, settings)
    if no_spend_insight: insights.append(no_spend_insight)
    
    # 2-9. 작년 동월 대비
    last_year_insight = _compare_with_last_year(conn, year, month_str, settings)
    if last_year_insight: insights.append(last_year_insight)
    
    # 2-10. 고정비 비중 경고
    fixed_ratio_insight = _analyze_fixed_vs_variable(conn, month_str, settings)
    if fixed_ratio_insight: insights.append(fixed_ratio_insight)
    
    conn.close()
    
    return {
        "heatmap_data": heatmap_data,
        "insights": insights[:10]
    }


# ****** 인사이트 보조 함수들 ******

def _analyze_weekend_pattern(conn, month_str, settings):
    """주말/평일 소비 비교(대분류 기준)"""
    query = """--sql
        SELECT 
            mc.name as category,
            CASE WHEN CAST(strftime('%w', t.transaction_date) AS INTEGER) IN (0, 6) 
                 THEN 'weekend' ELSE 'weekday' END as period,
            AVG(ABS(t.amount)) as avg_amount
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) = ?
          AND t.amount < 0
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY mc.name, period
        HAVING COUNT(*) >= 2
    """
    rows = conn.execute(query, (month_str,)).fetchall()
    
    # 카테고리별로 주말/평일 비율 계산
    category_ratios = {}
    for row in rows:
        cat = row['category']
        if cat not in category_ratios:
            category_ratios[cat] = {}
        category_ratios[cat][row['period']] = row['avg_amount']
    
    # 비율이 1.5배 이상 차이나는 카테고리 찾기
    threshold = settings.get('weekend_ratio_threshold', 1.5)
    for cat, data in category_ratios.items():
        if 'weekend' in data and 'weekday' in data:
            ratio = data['weekend'] / data['weekday'] if data['weekday'] > 0 else 0
            if ratio > threshold:
                return {
                    'type': 'weekend_spending',
                    'icon': '💡',
                    'message': f"주말 '{cat}'이(가) 평일보다 {ratio:.1f}배 높아요"
                }
    return None

def _find_recurring_weekday_pattern(conn, month_str, settings):
    """특정 요일 집중 소비"""
    min_count = settings.get('weekday_min_count', 3)
    query = """--sql
        SELECT 
            CASE CAST(strftime('%w', t.transaction_date) AS INTEGER)
                WHEN 0 THEN '일' WHEN 1 THEN '월' WHEN 2 THEN '화'
                WHEN 3 THEN '수' WHEN 4 THEN '목' WHEN 5 THEN '금'
                WHEN 6 THEN '토' END as weekday,
            mc.name as category,
            AVG(ABS(t.amount)) as avg_amount,
            COUNT(*) as cnt
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) = ?
          AND t.amount < 0
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY weekday, mc.name
        HAVING cnt >= ?
        ORDER BY avg_amount DESC
        LIMIT 1
    """
    row = conn.execute(query, (month_str, min_count)).fetchone()
    if row:
        return {
            'type': 'recurring_pattern',
            'icon': '💡',
            'message': f"매주 {row['weekday']}요일 {row['category']} 지출이 집중돼요"
        }
    return None

def _analyze_payday_spending(conn, year, month_str, settings):
    """급여일 기준 소비 변화 ('고정수입-정기급여' 기준)"""
    from datetime import datetime, timedelta
    
    # 정기급여 거래일 찾기
    payday_query = """--sql
        SELECT transaction_date
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE mc.name = '고정수입' 
          AND mnc.name = '정기급여'
          AND t.amount > 0
          AND strftime('%Y-%m', t.transaction_date) = ?
        ORDER BY t.transaction_date DESC
        LIMIT 1
    """
    payday_row = conn.execute(payday_query, (month_str,)).fetchone()
    if not payday_row:
        return None
    
    payday_date = datetime.strptime(payday_row['transaction_date'], '%Y-%m-%d')
    
    # D+1 ~ D+7 평균 지출
    post_query = """--sql
        SELECT AVG(ABS(amount)) as avg_amount
        FROM transactions
        WHERE amount < 0
          AND transaction_date BETWEEN ? AND ?
    """
    post_avg = conn.execute(
        post_query,
        ((payday_date + timedelta(days=1)).strftime('%Y-%m-%d'),
         (payday_date + timedelta(days=7)).strftime('%Y-%m-%d'))
    ).fetchone()['avg_amount'] or 0
    
    # D-7 ~ D-1 평균 지출
    normal_avg = conn.execute(
        post_query,
        ((payday_date - timedelta(days=7)).strftime('%Y-%m-%d'),
         (payday_date - timedelta(days=1)).strftime('%Y-%m-%d'))
    ).fetchone()['avg_amount'] or 0
    
    threshold = settings.get('payday_spike_threshold', 30)
    if normal_avg > 0:
        increase_rate = ((post_avg - normal_avg) / normal_avg * 100)
        if increase_rate > threshold:
            return {
                'type': 'payday_spike',
                'icon': '💡',
                'message': f"급여일 직후 7일간 지출이 {int(increase_rate)}% 증가해요"
            }
    return None

def _analyze_month_period_pattern(conn, year, month_str, settings):
    """월초/월말 소비 차이"""
    from calendar import monthrange
    
    year_int = int(month_str.split('-')[0])
    month_int = int(month_str.split('-')[1])
    days_in_month = monthrange(year_int, month_int)[1]
    
    # 월초 (1~10일) 평균
    early_query = """--sql
        SELECT AVG(ABS(amount)) as avg_amount
        FROM transactions
        WHERE strftime('%Y-%m', transaction_date) = ?
          AND CAST(strftime('%d', transaction_date) AS INTEGER) BETWEEN 1 AND 10
          AND amount < 0
    """
    early_avg = conn.execute(early_query, (month_str,)).fetchone()['avg_amount'] or 0
    
    # 월말 (21일~말일) 평균
    late_query = """--sql
        SELECT AVG(ABS(amount)) as avg_amount
        FROM transactions
        WHERE strftime('%Y-%m', transaction_date) = ?
          AND CAST(strftime('%d', transaction_date) AS INTEGER) >= 21
          AND amount < 0
    """
    late_avg = conn.execute(late_query, (month_str,)).fetchone()['avg_amount'] or 0
    
    threshold = settings.get('month_period_threshold', 30)
    if early_avg > 0 and late_avg > 0:
        diff_rate = abs((late_avg - early_avg) / early_avg * 100)
        if diff_rate > threshold:
            period = "월말" if late_avg > early_avg else "월초"
            return {
                'type': 'month_period',
                'icon': '💡',
                'message': f"{period} 지출이 {int(diff_rate)}% 높아요"
            }
    return None

def _detect_impulse_spending(conn, year, month_str, settings):
    """소액 다빈도 지출 (1만원 이하)"""
    # 이번 달 소액 지출 횟수
    impulse_amount_limit = settings.get('impulse_amount_limit', 5000)
    current_query = """--sql
        SELECT COUNT(*) as count
        FROM transactions
        WHERE strftime('%Y-%m', transaction_date) = ?
          AND amount < 0
          AND ABS(amount) < ?
    """
    current_count = conn.execute(current_query, (month_str, impulse_amount_limit)).fetchone()['count']
    
    # 전월 소액 지출 횟수
    prev_month = (datetime.strptime(month_str, '%Y-%m') - relativedelta(months=1)).strftime('%Y-%m')
    prev_count = conn.execute(current_query, (prev_month, impulse_amount_limit)).fetchone()['count']
    
    threshold = settings.get('impulse_increase_threshold', 20)
    if prev_count > 0:
        increase_rate = ((current_count - prev_count) / prev_count * 100)
        if increase_rate > threshold:
            return {
                'type': 'impulse_spending',
                'icon': '💡',
                'message': f"이번 달 소액 지출이 {current_count}회로 평소보다 {int(increase_rate)}% 증가했어요"
            }
    return None

def _detect_category_spike(conn, year, month_str, settings):
    """전월 대비 특정 카테고리 급증"""
    
    prev_month = (datetime.strptime(month_str, '%Y-%m') - relativedelta(months=1)).strftime('%Y-%m')
    
    query = """--sql
        SELECT 
            mc.name as category,
            SUM(ABS(t.amount)) as total
        FROM transactions t
        JOIN minor_categories mnc ON t.minor_category_uuid = mnc.uuid
        JOIN major_categories mc ON mnc.major_category_id = mc.id
        WHERE strftime('%Y-%m', t.transaction_date) = ?
          AND t.amount < 0
          AND mc.name NOT IN ('고정수입', '유동수입', '이체분류')
        GROUP BY mc.name
    """
    
    current_data = {row['category']: row['total'] for row in conn.execute(query, (month_str,)).fetchall()}
    prev_data = {row['category']: row['total'] for row in conn.execute(query, (prev_month,)).fetchall()}
    
    threshold = settings.get('category_spike_threshold', 50)
    for cat, current_amount in current_data.items():
        if cat in prev_data:
            prev_amount = prev_data[cat]
            if prev_amount > 0:
                increase_rate = ((current_amount - prev_amount) / prev_amount * 100)
                if increase_rate > threshold:
                    return {
                        'type': 'category_spike',
                        'icon': '💡',
                        'message': f"'{cat}'이(가) 지난달보다 {int(increase_rate)}% 증가했어요"
                    }
    return None

def _analyze_budget_trend(conn, year, month, settings):
    """예산 소진율 경고"""
    from datetime import datetime
    import calendar
    
    today = datetime.now()
    if today.year != year or today.month != month:
        return None  # 현재 월만 분석
    
    # 월 진행률
    days_in_month = calendar.monthrange(year, month)[1]
    month_progress = (today.day / days_in_month) * 100
    
    # 예산 대비 소비율
    month_str = f"{year}-{month:02d}"
    total_budget_query = "SELECT SUM(amount) FROM budgets"
    total_budget = conn.execute(total_budget_query).fetchone()[0] or 0
    
    if total_budget == 0:
        return None
    
    total_spent_query = """--sql
        SELECT SUM(ABS(amount))
        FROM transactions
        WHERE strftime('%Y-%m', transaction_date) = ?
          AND amount < 0
    """
    total_spent = conn.execute(total_spent_query, (month_str,)).fetchone()[0] or 0
    
    budget_used = (total_spent / total_budget * 100)
    
    threshold = settings.get('budget_alert_margin', 10)
    if budget_used > month_progress + threshold:
        return {
            'type': 'budget_alert',
            'icon': '💡',
            'message': f"월 진행률({int(month_progress)}%)보다 예산 소진율({int(budget_used)}%)이 빨라요"
        }
    return None

def _detect_no_spend_streak(conn, year, month_str, settings):
    """연속 무지출일 감지"""
    query = """--sql
        SELECT DISTINCT transaction_date
        FROM transactions
        WHERE strftime('%Y-%m', transaction_date) = ?
          AND amount < 0
        ORDER BY transaction_date
    """
    spent_dates = {row['transaction_date'] for row in conn.execute(query, (month_str,)).fetchall()}
    
    from datetime import datetime, timedelta
    from calendar import monthrange
    
    year_int = int(month_str.split('-')[0])
    month_int = int(month_str.split('-')[1])
    days_in_month = monthrange(year_int, month_int)[1]
    
    max_streak = 0
    current_streak = 0
    
    for day in range(1, days_in_month + 1):
        date_str = f"{month_str}-{day:02d}"
        if date_str not in spent_dates:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
    
    threshold = settings.get('no_spend_min_days', 3)
    if max_streak >= threshold:
        return {
            'type': 'no_spend_streak',
            'icon': '🎉',
            'message': f"{max_streak}일 연속 무지출 달성!"
        }
    return None

def _compare_with_last_year(conn, year, month_str, settings):
    """작년 동월 대비"""
    current_query = """--sql
        SELECT SUM(ABS(amount)) as total
        FROM transactions
        WHERE strftime('%Y-%m', transaction_date) = ?
          AND amount < 0
    """
    current_total = conn.execute(current_query, (month_str,)).fetchone()['total'] or 0
    
    last_year_month = f"{year-1}-{month_str.split('-')[1]}"
    last_year_total = conn.execute(current_query, (last_year_month,)).fetchone()['total'] or 0
    
    threshold = settings.get('year_comparison_threshold', 20)
    if last_year_total > 0:
        change_rate = ((current_total - last_year_total) / last_year_total * 100)
        if abs(change_rate) > threshold:
            direction = "증가" if change_rate > 0 else "감소"
            return {
                'type': 'year_comparison',
                'icon': '💡',
                'message': f"작년 {month_str.split('-')[1]}월보다 지출이 {int(abs(change_rate))}% {direction}했어요"
            }
    return None

def _analyze_fixed_vs_variable(conn, month_str, settings):
    """고정비 vs 변동비 비율"""
    query = """--sql
        SELECT 
            t.type,
            SUM(ABS(t.amount)) as total
        FROM transactions t
        WHERE strftime('%Y-%m', t.transaction_date) = ?
          AND t.amount < 0
        GROUP BY t.type
    """
    results = {row['type']: row['total'] for row in conn.execute(query, (month_str,)).fetchall()}
    
    fixed = results.get('고정지출', 0)
    variable = results.get('유동지출', 0) + results.get('반고정지출', 0)
    
    threshold = settings.get('fixed_ratio_warning', 40)
    total = fixed + variable
    if total > 0:
        fixed_ratio = (fixed / total * 100)
        if fixed_ratio > threshold:
            return {
                'type': 'fixed_ratio_warning',
                'icon': '💡',
                'message': f"고정비 비중이 {int(fixed_ratio)}%로 높아요. 변동비 절약을 고려해보세요"
            }
    return None