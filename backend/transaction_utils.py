import sqlite3
import database
from datetime import date

def load_transactions():
    """DB에서 거래내역 로드, 계좌와 카테고리 이름 JOIN"""
    conn = database.get_db_connection()
    query = """
        SELECT
            t.id,
            t.transaction_date,
            t.type,
            t.amount,
            t.merchant,
            t.memo,
            t.is_bold,
            t.flag_color_id,
            t.highlight_color_id,
            t.background_color_id,
            t.account_id,
            a.name AS account_name,
            t.minor_category_uuid,
            mc.name AS minor_category_name,
            mjc.id as major_category_id,
            mjc.name AS major_category_name
        FROM transactions t
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN minor_categories mc ON t.minor_category_uuid = mc.uuid
        LEFT JOIN major_categories mjc ON mc.major_category_id = mjc.id
        ORDER BY t.transaction_date ASC, t.id ASC"""
    transactions_cursor = conn.execute(query)
    transactions = [dict(row) for row in transactions_cursor]
    
    if not transactions:
        print("No transactions found in DB.")
        cursor = conn.cursor()
        first_account = cursor.execute('SELECT id FROM accounts ORDER BY display_order LIMIT 1').fetchone()
        transfer_category = cursor.execute("SELECT uuid FROM minor_categories WHERE name = '내계좌이체' LIMIT 1").fetchone()

        if first_account and transfer_category:
            cursor.execute("""
                INSERT INTO transactions (transaction_date, type, amount, merchant, memo, account_id, minor_category_uuid, is_bold, flag_color_id, highlight_color_id, background_color_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
            """, (
                date.today().strftime('%Y-%m-%d'),
                '이체',
                100000,
                '계좌등록',
                '첫 계좌의 초기 잔액을 입력하세요.',
                first_account['id'],
                transfer_category['uuid']
            ))
            conn.commit()
            print("Default transaction created.")
            # 데이터 추가 후 다시 로드
            transactions_cursor = conn.execute(query)
            transactions = [dict(row) for row in transactions_cursor]
        else:
            print("Could not create default transaction: Default account or category not found.")

    conn.close()
    return transactions

def save_transactions(transactions_data):
    """프론트엔드에서 받은 거래내역 데이터를 DB에 저장합니다."""
    conn = database.get_db_connection()
    cursor = conn.cursor()

    # --- 데이터 준비 ---
    # 프론트에서 받은 데이터의 ID 집합 (신규 항목은 id가 문자열이므로 제외)
    frontend_ids = {t['id'] for t in transactions_data if isinstance(t.get('id'), int)}
    # DB에 있는 모든 거래내역 ID 집합
    db_ids = {row['id'] for row in cursor.execute('SELECT id FROM transactions').fetchall()}

    # --- 1. 삭제 처리 ---
    # DB에는 있지만 프론트에는 없는 ID를 찾아 삭제
    ids_to_delete = db_ids - frontend_ids
    if ids_to_delete:
        cursor.executemany('DELETE FROM transactions WHERE id = ?', [(id,) for id in ids_to_delete])

    # --- 2. 추가 및 수정 처리 ---
    for tx in transactions_data:
        # 필수 값이 없으면 건너뜀
        if not all(k in tx for k in ['transaction_date', 'type', 'amount', 'merchant', 'account_id', 'minor_category_uuid']):
            continue
        
        params = (
            tx['transaction_date'],
            tx['type'],
            tx['amount'],
            tx['merchant'],
            tx.get('memo', ''),
            tx['account_id'],
            tx['minor_category_uuid'],
            tx.get('is_bold', 0),
            tx.get('flag_color_id', 0),
            tx.get('highlight_color_id', 0),
            tx.get('background_color_id', 0)
        )

        tx_id = tx.get('id')
        # ID가 문자열(신규)이거나 DB에 없는 ID(복사-붙여넣기 등)이면 INSERT
        if isinstance(tx_id, str) or tx_id not in db_ids:
            cursor.execute(
                'INSERT INTO transactions (transaction_date, type, amount, merchant, memo, account_id, minor_category_uuid, is_bold, flag_color_id, highlight_color_id, background_color_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                params
            )
        # ID가 있으면 UPDATE
        else:
            cursor.execute(
                'UPDATE transactions SET transaction_date=?, type=?, amount=?, merchant=?, memo=?, account_id=?, minor_category_uuid=?, is_bold=?, flag_color_id=?, highlight_color_id=?, background_color_id=? WHERE id=?',
                params + (tx_id,)
            )

    conn.commit()
    conn.close()
    # 저장 후, 최신 데이터를 다시 로드하여 반환
    return load_transactions()
