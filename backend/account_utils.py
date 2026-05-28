import database

def initialize_default_accounts():
    """accounts 테이블이 비어있으면 기본값으로 초기화합니다."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    accounts_count = cursor.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]
    
    if accounts_count == 0:
        print("Initializing default accounts...")
        default_accounts = [
            {"name": '기본 계좌 1', "display_order": 0},
            {"name": '기본 계좌 2', "display_order": 1},
            {"name": '기본 계좌 3', "display_order": 2}
        ]
        cursor.executemany(
            'INSERT INTO accounts (name, display_order) VALUES (:name, :display_order)',
            default_accounts
        )
        conn.commit()
        print("Default accounts created.")
    conn.close()

def load_accounts():
    """DB에서 모든 계좌 목록을 불러와 리스트로 반환합니다."""
    conn = database.get_db_connection()
    accounts_cursor = conn.execute('SELECT id, name FROM accounts ORDER BY display_order').fetchall()
    conn.close()
    return [dict(row) for row in accounts_cursor]

def save_accounts(frontend_accounts):
    """
    프론트엔드에서 받은 계좌 리스트와 DB를 비교하여
    추가(INSERT), 수정(UPDATE), 삭제(DELETE) 작업을 개별적으로 수행합니다.
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()

    # 1. DB에 현재 저장된 계좌 ID 목록을 가져옵니다.
    cursor.execute('SELECT id FROM accounts')
    db_ids = {row['id'] for row in cursor.fetchall()}

    # 2. 프론트엔드에서 받은 계좌 ID 목록을 만듭니다. (id가 양수인 것만)
    frontend_ids = {acc['id'] for acc in frontend_accounts if isinstance(acc.get('id'), int) and acc.get('id', 0) > 0}

    # 3. 삭제할 계좌 결정: DB에는 있지만 프론트엔드에는 없는 ID
    ids_to_delete = db_ids - frontend_ids
    if ids_to_delete:
        # executemany를 사용하여 여러 항목을 한 번에 삭제
        cursor.executemany('DELETE FROM accounts WHERE id = ?', [(id,) for id in ids_to_delete])

    # 4. 추가 또는 업데이트할 계좌 처리
    for index, acc in enumerate(frontend_accounts):
        acc_id = acc.get('id')
        acc_name = acc.get('name')
        display_order = index  # 프론트엔드 순서대로 display_order 설정
        if not acc_name:
            continue
        
        if isinstance(acc_id, int):
            # 기존 계좌 업데이트
            cursor.execute(
                'UPDATE accounts SET name = ?, display_order = ? WHERE id = ?',
                (acc_name, display_order, acc_id)
            )
        elif isinstance(acc_id, str) and acc_id.startswith('tmp-'):
            # 새로운 계좌 추가
            cursor.execute(
                'INSERT INTO accounts (name, display_order) VALUES (?, ?)',
                (acc_name, display_order)
            )

    conn.commit()
    conn.close()

    return load_accounts()  # 업데이트된 전체 계좌 목록 반환