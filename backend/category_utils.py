import database
import uuid

DEFAULT_CATEGORIES = {
    "고정수입": ["정기급여", "금융수입", "용돈"],
    "유동수입": ["상여금", "사업수입", "금융수입", "용돈", "기타수입"],
    "이체분류": ["내계좌이체", "이체", "저축", "현금", "투자"],
    "식비": ["외식", "식재료", "배달", "포장"],
    "카페/간식": ["커피/음료", "베이커리", "디저트/빵", "아이스크림/빙수"],
    "외출/주점": ["노래방", "PC방", "당구장", "만화방", "주점"],
    "생활": ["생필품", "편의점", "마트", "세탁", "지역화폐충전", "가구/가전", "문구류", "전자제품","서비스"],
    "온라인쇼핑": ["서비스구독", "앱스토어", "인터넷쇼핑", "수수료"],
    "패션/쇼핑": ["옷", "신발", "액세서리", "백화점"],
    "뷰티/미용": ["화장품", "헤어샵", "미용관리", "미용용품"],
    "교통": ["택시", "대중교통", "시외버스", "철도", "전동킥보드", "렌터카", "항공"],
    "자동차": ["주유", "주차", "세차", "통행료", "정비/수리", "자동차보험", "대리운전", "과태료"],
    "주거/통신": ["휴대폰", "인터넷", "월세", "관리비", "가스비", "전기세"],
    "의료/건강": ["약국", "병원", "건강/보조식품", "운동"],
    "금융": ["보험", "증권/투자", "카드", "이자/대출", "세금/과태료"],
    "문화/여가": ["영화", "도서", "게임", "공연", "전시/관람/체험", "취미", "테마파크", "기타"],
    "여행/숙박": ["숙박비", "관광", "교통비", "기념품", "여행용품"],
    "교육/학습": ["수업료", "시험료", "책"],
    "경조/선물": ["축의금", "부조금", "선물", "회비"]
}

# DB가 비어있을 때 기본값으로 채우는 함수
def initialize_default_categories():
    """accounts와 categories 테이블이 비어있으면 기본값으로 초기화합니다."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    major_count = cursor.execute('SELECT COUNT(*) FROM major_categories').fetchone()[0]
    
    if major_count == 0:
        print("Categories table is empty. Initializing default categories...")
        for major_order, (major_name, minors) in enumerate(DEFAULT_CATEGORIES.items()):
            cursor.execute(
                'INSERT INTO major_categories (name, display_order) VALUES (?, ?)',
                (major_name, major_order)
            )
            major_id = cursor.lastrowid

            # 해당 대분류에 속한 소분류 추가
            minor_list_to_insert = []
            for minor_order, minor_name in enumerate(minors):
                minor_list_to_insert.append({
                    "uuid": str(uuid.uuid4()),
                    "name": minor_name,
                    "major_category_id": major_id,
                    "display_order": minor_order
                })
            
            cursor.executemany(
                """
                INSERT INTO minor_categories (uuid, name, major_category_id, display_order)
                VALUES (:uuid, :name, :major_category_id, :display_order)
                """,
                minor_list_to_insert
            )
        conn.commit()
        print("Default categories initialization complete.")
    conn.close()

# DB에서 데이터를 불러와 프론트엔드 형식으로 변환하는 함수
def load_categories():
    """
    DB에서 모든 카테고리를 로드하여 프론트엔드 형식에 맞게 그룹화하여 반환합니다.
    """
    conn = database.get_db_connection()
    
    # 1. 모든 대분류를 순서대로 가져옵니다.
    majors_cursor = conn.execute('SELECT id, name FROM major_categories ORDER BY display_order').fetchall()
    
    # 2. 모든 소분류를 순서대로 가져옵니다.
    minors_cursor = conn.execute('SELECT uuid, name, major_category_id FROM minor_categories ORDER BY display_order').fetchall()
    conn.close()

    # 3. 대분류 ID를 키로 하는 딕셔너리를 만들어 데이터를 효율적으로 조립합니다.
    # 프론트엔드가 사용할 데이터 구조: {id: 1, name: '...', minors: [...]}
    categories_map = {
        row['id']: {"id": row['id'], "name": row['name'], "minors": []}
        for row in majors_cursor
    }

    # 4. 소분류를 순회하며 적절한 대분류의 'minors' 리스트에 추가합니다.
    for minor in minors_cursor:
        major_id = minor['major_category_id']
        if major_id in categories_map:
            categories_map[major_id]['minors'].append({
                "uuid": minor['uuid'],
                "name": minor['name']
            })
    
    # 5. 딕셔너리의 값들만 리스트로 변환하여 최종 반환합니다.
    return list(categories_map.values())

# 프론트엔드에서 받은 데이터로 DB를 업데이트하는 함수
def save_categories(frontend_data):
    """
    프론트엔드에서 받은 카테고리 리스트를 기준으로 DB를 지능적으로 업데이트합니다.
    (INSERT, UPDATE, DELETE, MOVE)
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()

    # --- 1. DB의 현재 상태 파악 ---
    db_major_ids = {row['id'] for row in cursor.execute('SELECT id FROM major_categories').fetchall()}
    db_minor_uuids = {row['uuid'] for row in cursor.execute('SELECT uuid FROM minor_categories').fetchall()}

    # --- 2. 프론트엔드의 최종 상태 파악 ---
    frontend_major_ids = {cat['id'] for cat in frontend_data if isinstance(cat.get('id'), int)}
    frontend_minor_uuids = {
        minor['uuid'] 
        for cat in frontend_data 
        for minor in cat.get('minors', []) 
        if isinstance(minor.get('uuid'), str) and not minor['uuid'].startswith('tmp-')
    }

    # --- 3. 삭제 처리 (가장 먼저 수행) ---
    # 삭제된 대분류 처리 (ON DELETE CASCADE에 의해 소속된 소분류도 함께 삭제됨)
    majors_to_delete = db_major_ids - frontend_major_ids
    if majors_to_delete:
        cursor.executemany('DELETE FROM major_categories WHERE id = ?', [(id,) for id in majors_to_delete])

    # (대분류 이동 등으로 인해) 개별적으로 삭제된 소분류 처리
    minors_to_delete = db_minor_uuids - frontend_minor_uuids
    if minors_to_delete:
        cursor.executemany('DELETE FROM minor_categories WHERE uuid = ?', [(uuid,) for uuid in minors_to_delete])

    # --- 4. 추가 / 업데이트 / 이동 처리 ---
    for major_order, major_cat in enumerate(frontend_data):
        major_id = major_cat.get('id')
        major_name = major_cat.get('name')

        # 4-1. 대분류 처리
        if isinstance(major_id, str) and major_id.startswith('tmp-'):
            # 신규 대분류 INSERT
            cursor.execute(
                'INSERT INTO major_categories (name, display_order) VALUES (?, ?)',
                (major_name, major_order)
            )
            major_id = cursor.lastrowid # 새로 생성된 실제 ID를 가져옴
        else:
            # 기존 대분류 이름 및 순서 UPDATE
            cursor.execute(
                'UPDATE major_categories SET name = ?, display_order = ? WHERE id = ?',
                (major_name, major_order, major_id)
            )
        
        # 4-2. 소분류 처리
        for minor_order, minor_cat in enumerate(major_cat.get('minors', [])):
            minor_uuid = minor_cat.get('uuid')
            minor_name = minor_cat.get('name')

            if isinstance(minor_uuid, str) and minor_uuid.startswith('tmp-'):
                # 신규 소분류 INSERT
                new_uuid = str(uuid.uuid4())
                cursor.execute(
                    '''INSERT INTO minor_categories (uuid, name, major_category_id, display_order) 
                       VALUES (?, ?, ?, ?)''',
                    (new_uuid, minor_name, major_id, minor_order)
                )
            else:
                # 기존 소분류 이름, 순서, 그리고 소속 대분류(major_category_id)까지 모두 UPDATE
                # 이를 통해 '대분류 간 이동'이 완벽하게 처리됨.
                cursor.execute(
                    '''UPDATE minor_categories 
                       SET name = ?, major_category_id = ?, display_order = ? 
                       WHERE uuid = ?''',
                    (minor_name, major_id, minor_order, minor_uuid)
                )

    conn.commit()
    conn.close()

    # ✨ 변경사항이 적용된 최신 목록을 다시 로드하여 프론트엔드에 반환합니다.
    return load_categories()