import database
import category_utils

# CSV 파일 내용을 하드코딩한 데이터
# (id, bertoutput, default_mapping_name) 형식의 튜플 리스트
DEFAULT_MAPPINGS = [
    (0, '가구', '가구/가전'), (1, '가발', '미용용품'), (2, '가전제품', '가구/가전'),
    (3, '가전제품 수리', '가구/가전'), (4, '가정용품 수리', '가구/가전'), (5, '가죽/가방/신발 수선', '옷'),
    (6, '가축 사료', '마트'), (7, '건강보조식품', '건강/보조식품'), (8, '건설 자재', '생필품'),
    (9, '건어물/젓갈', '식재료'), (10, '건축 서비스', '가구/가전'), (11, '결혼 상담 서비스', '서비스'),
    (12, '경영 컨설팅', '서비스'), (13, '고용 알선 및 인력 공급업', '서비스'), (14, '곡물/곡분', '식재료'),
    (15, '광고업', '서비스'), (16, '구내식당', '외식'), (17, '기계 및 장비 대여', '가구/가전'),
    (18, '기념품점', '기념품'), (19, '기숙사/고시원', '월세'), (20, '기타 개인/가정용품 대여', '가구/가전'),
    (21, '기타 운송장비 대여', '렌터카'), (22, '기타 음식점', '외식'), (23, '김밥/만두/분식', '외식'),
    (24, '꽃집', '선물'), (25, '네일숍', '미용관리'), (26, '담배/전자담배', '생필품'),
    (27, '독서실/스터디 카페', '수업료'), (28, '동남아식 음식점엄', '외식'), (29, '동물병원', '병원'),
    (30, '디자인 서비스', '서비스구독'), (31, '떡/한과', '디저트/빵'), (32, '마사지/안마', '미용관리'),
    (33, '만화방', '만화방'), (34, '목욕탕/사우나', '미용관리'), (35, '문구/회화용품', '문구류'),
    (36, '미용실', '헤어샵'), (37, '반찬/식료품', '식재료'), (38, '버거', '외식'),
    (39, '법무 서비스', '서비스구독'), (40, '병원', '병원'), (41, '복사업', '문구류'),
    (42, '부동산 중개/대리', '월세'), (43, '뷔페', '외식'), (44, '빵/도넛', '베이커리'),
    (45, '사무 지원 서비스', '기타'), (46, '사무기기', '전자제품'), (47, '사업시설 관리 서비스', '전자제품'),
    (48, '사진기/기타 광학기기', '전자제품'), (49, '사진촬영업', '서비스'), (50, '생맥주 전문점', '주점'),
    (51, '생수/음료', '커피/음료'), (52, '서점', '도서'), (53, '세탁소', '세탁'),
    (54, '셀프 빨래방', '세탁'), (55, '수산물', '식재료'), (56, '숙박', '숙박비'),
    (57, '슈퍼마켓', '마트'), (58, '스포츠 서비스', '운동'), (59, '스포츠/레크리에이션 용품 대여', '운동'),
    (60, '시계/귀금속', '액세서리'), (61, '시계/귀금속/악기 수리', '서비스'), (62, '시장 조사 및 여론 조사업', '서비스'),
    (63, '실/섬유제품', '옷'), (64, '아이스크림 할인점', '아이스크림/빙수'), (65, '아이스크림/빙수', '아이스크림/빙수'),
    (66, '악기', '취미'), (67, '안경렌즈', '생필품'), (68, '애완동물/애완용품', '생필품'),
    (69, '액세서리/잡화', '액세서리'), (70, '약국', '약국'), (71, '양식 음식점', '외식'),
    (72, '얼음', '식재료'), (73, '여행 보조 서비스', '서비스'), (74, '예술품', '취미'),
    (75, '예식장업', '축의금'), (76, '오락 서비스', '게임'), (77, '요리 주점', '주점'),
    (78, '우유', '식재료'), (79, '운동용품', '운동'), (80, '유흥 주점', '주점'),
    (81, '음반/비디오물', '도서'), (82, '음반/비디오물 대여', '도서'), (83, '의료기기', '병원'),
    (84, '의류', '옷'), (85, '의류 대여', '옷'), (86, '의류/이불 수선', '옷'),
    (87, '일식 음식점', '외식'), (88, '자동차 대여', '렌터카'), (89, '자동차 세차장', '세차'),
    (90, '자동차 정비', '정비/수리'), (91, '자동차 정비소', '정비/수리'), (92, '자전거', '운동'),
    (93, '장난감', '취미'), (94, '장례식장', '부조금'), (95, '전문 상품 판매', '마트'),
    (96, '전문 서비스', '서비스'), (97, '정육점', '식재료'), (98, '조명장치', '가구/가전'),
    (99, '종합 소매점', '마트'), (100, '주류', '주점'), (101, '주방/가정용품', '생필품'),
    (102, '주유소', '주유'), (103, '중고 상품', '생필품'), (104, '중식 음식점', '외식'),
    (105, '채소/과일', '식재료'), (106, '철물/공구', '생필품'), (107, '체형/비만 관리', '미용관리'),
    (108, '치킨', '배달'), (109, '침구류/커튼', '가구/가전'), (110, '카페', '커피/음료'),
    (111, '캠핑/글램핑', '숙박비'), (112, '컴퓨터/노트북/프린터 수리', '전자제품'), (113, '컴퓨터/소프트웨어', '전자제품'),
    (114, '토스트/샌드위치/샐러드', '베이커리'), (115, '편의점', '편의점'), (116, '피부 관리실', '미용관리'),
    (117, '피자', '배달'), (118, '학원', '수업료'), (119, '한식 음식점', '외식'),
    (120, '핸드폰', '휴대폰'), (121, '핸드폰/통신장비 수리', '서비스'), (122, '화장터/묘지/납골당', '서비스'),
    (123, '화장품', '화장품'), (124, '회계/세무 서비스', '서비스')
]

def initialize_default_mappings():
    """
    앱 최초 실행 시, category_mappings 테이블이 비어있으면
    하드코딩된 데이터를 기반으로 초기 매핑 데이터를 생성합니다.
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()

    try:
        # 테이블이 비어있는지 확인 (최초 실행 감지)
        cursor.execute("SELECT COUNT(*) FROM category_mappings")
        if cursor.fetchone()[0] > 0:
            return # 이미 데이터가 있으므로 함수 종료

        print("Initializing default category mappings...")
        
        # 모든 소분류의 이름과 UUID를 미리 메모리에 로드 (DB 조회 최소화)
        minor_categories_map = {row['name']: row['uuid'] for row in cursor.execute("SELECT uuid, name FROM minor_categories").fetchall()}

        mappings_to_insert = []
        for bert_id, bert_name, default_mapping_name in DEFAULT_MAPPINGS:
            # 하드코딩된 매핑 이름에 해당하는 UUID 찾기
            minor_uuid = minor_categories_map.get(default_mapping_name) # 없으면 None
            mappings_to_insert.append((bert_id, bert_name, minor_uuid))

        # 데이터 일괄 삽입
        cursor.executemany(
            "INSERT INTO category_mappings (bert_output_id, bert_output_name, minor_category_uuid) VALUES (?, ?, ?)",
            mappings_to_insert
        )
        conn.commit()
        print(f"{len(mappings_to_insert)} default category mappings have been initialized.")

    except Exception as e:
        print(f"An error occurred during mapping initialization: {e}")
        conn.rollback() # 오류 발생 시 롤백
    finally:
        conn.close()

def load_mappings():
    """
    매핑 페이지 렌더링에 필요한 모든 데이터를 DB에서 조회하여 반환합니다.
    """
    conn = database.get_db_connection()
    
    # 1. 전체 카테고리 구조 가져오기 (기존 유틸 함수 재사용)
    categories = category_utils.load_categories()

    # 2. 모든 BERT 출력 목록 가져오기
    bert_outputs_cursor = conn.execute("SELECT bert_output_id, bert_output_name FROM category_mappings ORDER BY bert_output_id").fetchall()
    bert_outputs = [{"id": row['bert_output_id'], "name": row['bert_output_name']} for row in bert_outputs_cursor]

    # 3. 현재 매핑 상태 가져오기 (key: bert_output_id, value: minor_category_uuid)
    mappings_cursor = conn.execute("SELECT bert_output_id, minor_category_uuid FROM category_mappings WHERE minor_category_uuid IS NOT NULL").fetchall()
    mappings = {str(row['bert_output_id']): row['minor_category_uuid'] for row in mappings_cursor}
    
    conn.close()

    # 프론트엔드가 필요로 하는 최종 데이터 구조로 조립하여 반환
    return {
        "categories": categories,
        "bertOutputs": bert_outputs,
        "mappings": mappings
    }

def update_all_mappings(mappings: dict):
    """
    프론트엔드에서 받은 전체 매핑 정보로 DB를 업데이트합니다.
    ✨ 변경된 레코드만 효율적으로 업데이트하도록 로직 개선
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()
    try:
        # 1. DB에 저장된 현재 매핑 상태를 가져옵니다.
        db_mappings_cursor = cursor.execute("SELECT bert_output_id, minor_category_uuid FROM category_mappings").fetchall()
        db_mappings = {str(row['bert_output_id']): row['minor_category_uuid'] for row in db_mappings_cursor}

        # 2. 프론트에서 받은 데이터와 비교하여 변경/추가/삭제할 목록을 만듭니다.
        updates = []
        for bert_id_str, new_uuid in mappings.items():
            bert_id = int(bert_id_str)
            # DB 상태와 다를 경우에만 업데이트 목록에 추가
            if db_mappings.get(bert_id_str) != new_uuid:
                updates.append((new_uuid, bert_id))

        # 3. 매핑이 해제된 항목(프론트 데이터에는 없지만 DB에는 있는)을 찾아 NULL로 업데이트합니다.
        for bert_id_str, old_uuid in db_mappings.items():
            if old_uuid is not None and bert_id_str not in mappings:
                updates.append((None, int(bert_id_str)))

        # 4. 변경 사항이 있을 경우에만 DB에 적용합니다.
        if updates:
            cursor.executemany(
                "UPDATE category_mappings SET minor_category_uuid = ? WHERE bert_output_id = ?",
                updates
            )
            conn.commit()
            return {"status": "success", "message": f"{len(updates)} mappings updated."}
        
        return {"status": "success", "message": "No changes to update."}

    except Exception as e:
        conn.rollback()
        print(f"Error updating all mappings: {e}")
        raise e
    finally:
        conn.close()

# def reset_mappings_to_default():
#     """
#     모든 매핑을 하드코딩된 기본값으로 재설정합니다.
#     """
#     conn = database.get_db_connection()
#     cursor = conn.cursor()
#     try:
#         # 1. 테이블 비우기
#         cursor.execute("DELETE FROM category_mappings")
#         cursor.execute("DELETE FROM ocr_corrections")
#         cursor.execute("DELETE FROM sqlite_sequence WHERE name='ocr_corrections'")
#         cursor.execute("DELETE FROM rule_based_mappings")
#         cursor.execute("DELETE FROM sqlite_sequence WHERE name='rule_based_mappings'")
#         conn.commit() # DELETE 먼저 커밋

#         # 2. 초기화 함수 재호출
#         initialize_default_mappings()
        
#         return {"status": "success", "message": "Mappings have been reset to default."}
#     except Exception as e:
#         print(f"Error resetting mappings: {e}")
#         raise e
#     finally:
#         # initialize_default_mappings에서 conn을 닫았을 수 있으므로 안전하게 처리
#         if conn:
#             conn.close()
def get_default_mappings():
    """소분류 UUID를 조회하여 기본 매핑 데이터를 반환합니다."""
    conn = database.get_db_connection()
    minor_categories_map = {row['name']: row['uuid'] for row in conn.execute("SELECT uuid, name FROM minor_categories").fetchall()}
    conn.close()

    default_mappings = {}
    for bert_id, bert_name, default_minor_name in DEFAULT_MAPPINGS:
        if default_minor_name in minor_categories_map:
            default_mappings[str(bert_id)] = minor_categories_map[default_minor_name]
    
    return { "mappings": default_mappings }


# 딥러닝 mapping 외 함수들
def get_all_ocr_corrections():
    """OCR 보정 규칙 전체를 조회합니다."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT id, original_text, corrected_text FROM ocr_corrections ORDER BY id").fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_ocr_corrections(corrections_data):
    """OCR 보정 규칙 저장"""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    try:
        db_cursor = cursor.execute("SELECT id, original_text, corrected_text FROM ocr_corrections").fetchall()
        db_corrections = {row['original_text']: {'id': row['id'], 'corrected_text': row['corrected_text']} for row in db_cursor}
        frontend_corrections = {item['original_text']: item for item in corrections_data if item.get('original_text')}
        
        to_insert, to_update, to_delete = [], [], []
        for original, item in frontend_corrections.items():
            if original not in db_corrections:
                to_insert.append((item['original_text'], item['corrected_text']))
            elif db_corrections[original]['corrected_text'] != item['corrected_text']:
                to_update.append((item['corrected_text'], db_corrections[original]['id']))
        for original, item in db_corrections.items():
            if original not in frontend_corrections:
                to_delete.append((item['id'],))

        if to_insert:
            cursor.executemany("INSERT INTO ocr_corrections (original_text, corrected_text) VALUES (?, ?)", to_insert)
        if to_update:
            cursor.executemany("UPDATE ocr_corrections SET corrected_text = ? WHERE id = ?", to_update)
        if to_delete:
            cursor.executemany("DELETE FROM ocr_corrections WHERE id = ?", to_delete)
        conn.commit()
        return {"status": "success", "message": f"Inserted: {len(to_insert)}, Updated: {len(to_update)}, Deleted: {len(to_delete)}"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def add_ocr_correction(original_text, corrected_text):
    """새로운 OCR 보정 규칙 추가"""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT OR REPLACE INTO ocr_corrections (original_text, corrected_text) VALUES (?, ?)", (original_text, corrected_text))
        conn.commit()
        return {"status": "success", "message": "OCR correction added."}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_all_rule_based_mappings():
    """상호명-카테고리 Rule-based 매핑 전체를 조회합니다."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute('''
        SELECT rbm.id, rbm.merchant_name, rbm.minor_category_uuid, mc.name AS minor_category_name
        FROM rule_based_mappings rbm
        LEFT JOIN minor_categories mc ON rbm.minor_category_uuid = mc.uuid
        ORDER BY rbm.id
    ''').fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_rule_based_mappings(rules_data):
    """상호명 기반 매핑 규칙을 저장합니다. (추가/수정/삭제 처리)"""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    try:
        # DB의 현재 데이터 (merchant_name을 key로 하는 딕셔너리)
        db_cursor = cursor.execute("SELECT id, merchant_name, minor_category_uuid FROM rule_based_mappings").fetchall()
        db_rules = {row['merchant_name']: {'id': row['id'], 'uuid': row['minor_category_uuid']} for row in db_cursor}

        # 프론트에서 받은 데이터 (merchant_name을 key로 하는 딕셔너리)
        frontend_rules = {item['merchant_name']: item for item in rules_data if item.get('merchant_name')}

        to_insert = []
        to_update = []
        to_delete = []

        # 추가 또는 수정할 항목 찾기
        for name, item in frontend_rules.items():
            if name not in db_rules:
                to_insert.append((item['merchant_name'], item['minor_category_uuid']))
            elif db_rules[name]['uuid'] != item['minor_category_uuid']:
                to_update.append((item['minor_category_uuid'], db_rules[name]['id']))

        # 삭제할 항목 찾기
        for name, item in db_rules.items():
            if name not in frontend_rules:
                to_delete.append((item['id'],))

        if to_insert:
            cursor.executemany("INSERT INTO rule_based_mappings (merchant_name, minor_category_uuid) VALUES (?, ?)", to_insert)
        if to_update:
            cursor.executemany("UPDATE rule_based_mappings SET minor_category_uuid = ? WHERE id = ?", to_update)
        if to_delete:
            cursor.executemany("DELETE FROM rule_based_mappings WHERE id = ?", to_delete)

        conn.commit()
        return {"status": "success", "message": f"Inserted: {len(to_insert)}, Updated: {len(to_update)}, Deleted: {len(to_delete)}"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def add_rule_based_mapping(merchant_name, minor_category_uuid):
    """새로운 상호명-카테고리 매핑 규칙 추가"""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT OR REPLACE INTO rule_based_mappings (merchant_name, minor_category_uuid) VALUES (?, ?)", (merchant_name, minor_category_uuid))
        conn.commit()
        return {"status": "success", "message": "Rule-based mapping added."}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()