import sqlite3
import os
from pathlib import Path
import shutil

APP_DIR = Path.home() / '.moneyComPiler'
DATA_PATH_DB = APP_DIR / 'data_path.db'
DEFAULT_DATA_PATH = APP_DIR
MAIN_DB_NAME = 'moneyComPiler.db'

# ****** DB 초기화 ******
def _ensure_app_dir():
    APP_DIR.mkdir(parents=True, exist_ok=True)

def init_data_path_db():
    """데이터 경로 DB 초기화 및 기본값 설정"""
    _ensure_app_dir()
    conn = sqlite3.connect(str(DATA_PATH_DB))
    cursor = conn.cursor()
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS data_path (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    # 기본값이 없으면 저장
    cur = conn.execute("SELECT value FROM data_path WHERE key = 'data_path'")
    row = cur.fetchone()
    if not row:
        conn.execute(
            "INSERT INTO data_path (key, value) VALUES (?, ?)",
            ('data_path', str(DEFAULT_DATA_PATH))
        )
    conn.commit()
    conn.close()


# ****** DB 연결 관리 ******
def get_data_path():
    init_data_path_db()
    conn = sqlite3.connect(str(DATA_PATH_DB))
    cur = conn.execute("SELECT value FROM data_path WHERE key = 'data_path'")
    row = cur.fetchone()
    conn.close()
    return row[0] if row else str(DEFAULT_DATA_PATH)

def set_data_path(path_value: str):
    init_data_path_db()
    conn = sqlite3.connect(str(DATA_PATH_DB))
    conn.execute("""
        INSERT INTO data_path (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    """, ('data_path', path_value))
    conn.commit()
    conn.close()

def get_default_data_path():
    return str(APP_DIR)

def get_db_path():
    app_data_dir = get_app_data_dir()
    app_data_dir.mkdir(parents=True, exist_ok=True)
    return str(app_data_dir / MAIN_DB_NAME)

def get_app_data_dir(base_path=None):
    base_dir = Path(base_path or get_data_path())
    return base_dir / 'moneyComPiler'

def get_main_db_path_for_base(base_path):
    app_dir = get_app_data_dir(base_path)
    return app_dir / MAIN_DB_NAME

def move_database(old_base, new_base, force=False):
    src_db = get_main_db_path_for_base(old_base)
    dst_db = get_main_db_path_for_base(new_base)

    if not src_db.exists():
        return False, "source_db_missing"

    if dst_db.exists():
        if not force:
            return False, "dest_db_exists"
        dst_db.unlink()  # 기존 DB 삭제 (주의: 데이터 손실 가능)

    dst_db.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_db), str(dst_db))

    old_app_dir = get_app_data_dir(old_base)
    if old_app_dir.exists() and not any(old_app_dir.iterdir()):
        old_app_dir.rmdir()  # 빈 디렉토리 삭제
    return True, None


def get_db_connection():
    """DB 연결 반환"""
    db_path = get_db_path()
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        print(f"DB 연결 성공: {db_path}")
        return conn
    except Exception as e:
        print(f"DB 연결 실패: {e}")
        raise





def init_db():
    """데이터베이스와 테이블들을 생성합니다."""
    DB_PATH = get_db_path()
    print(f"Initializing database at: {DB_PATH}")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # --- 1. 계좌 테이블 (accounts) ---
    # 역할: 계좌의 이름과 표시 순서를 관리합니다.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_order INTEGER NOT NULL
        )
    ''')
    # --- 2. 대분류 테이블 (major_categories) ---
    # 역할: 카테고리 그룹의 이름과 표시 순서를 관리합니다.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS major_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_order INTEGER NOT NULL
        )
    ''')
    # --- 3. 소분류 테이블 (minor_categories) ---
    # 역할: 실제 카테고리 항목의 이름, 순서, 그리고 어떤 대분류에 속해있는지를 관리합니다.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS minor_categories (
            uuid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            major_category_id INTEGER NOT NULL,
            display_order INTEGER NOT NULL,
            FOREIGN KEY (major_category_id) REFERENCES major_categories (id) ON DELETE CASCADE
        )
    ''')
    # ON DELETE CASCADE: 대분류가 삭제되면, 거기에 속한 모든 소분류도 자동으로 함께 삭제됩니다.

    # --- 4. 거래 내역 테이블 (transactions) ---
    # 역할: 모든 거래 기록을 저장합니다. 계좌와 소분류를 외래 키로 참조합니다.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_date TEXT NOT NULL,
            account_id INTEGER NOT NULL,                   
            type TEXT NOT NULL,
            minor_category_uuid TEXT NOT NULL,
            amount INTEGER NOT NULL,
            merchant TEXT NOT NULL,
            memo TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_bold INTEGER DEFAULT 0,
            flag_color_id INTEGER DEFAULT 0,
            highlight_color_id INTEGER DEFAULT 0,
            background_color_id INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE SET NULL,
            FOREIGN KEY (minor_category_uuid) REFERENCES minor_categories (uuid) ON DELETE SET NULL
        )
    ''')

    # --- 5. 카테고리 매핑 테이블 (category_mappings) ---
    # 역할: BERT 모델의 출력을 사용자의 소분류에 매핑합니다.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS category_mappings (
            bert_output_id INTEGER PRIMARY KEY,
            bert_output_name TEXT NOT NULL UNIQUE,
            minor_category_uuid TEXT,
            FOREIGN KEY (minor_category_uuid) REFERENCES minor_categories (uuid) ON DELETE SET NULL
        )
    ''')
    # ON DELETE SET NULL: 매핑된 소분류가 삭제되면, 이 테이블의 해당 항목은 NULL로 자동 변경됩니다. (매핑 해제 효과)
    # OCR 보정 규칙 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ocr_corrections(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_text TEXT NOT NULL UNIQUE,
            corrected_text TEXT NOT NULL
        )
    ''')
    # 상호명-카테고리 Rule-based 매핑 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rule_based_mappings(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_name TEXT NOT NULL UNIQUE,
            minor_category_uuid TEXT NOT NULL,
            FOREIGN KEY (minor_category_uuid) REFERENCES minor_categories (uuid) ON DELETE SET NULL
        )
    ''')

    # --- 6. 사용자 설정 테이블 (settings) ---
    # 역할: 사용자의 각종 설정을 key-value 형태로 저장합니다. (대시보드 기간, 테마 등)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # --- 7. 예산 테이블 (budgets) ---
    # 역할: 사용자가 설정한 예산 정보를 저장합니다.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            budget_type TEXT NOT NULL CHECK(budget_type IN ('major', 'minor')),
            target_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            UNIQUE(budget_type, target_id)
        )
    ''')

    conn.commit()
    conn.close()
    print(f"Database and tables created successfully created at: {DB_PATH}")

def is_account_in_use(account_id):
    """특정 계좌가 거래내역에서 사용 중인지 확인합니다."""
    conn = get_db_connection()
    count = conn.execute('SELECT COUNT(*) FROM transactions WHERE account_id = ?', (account_id,)).fetchone()[0]
    conn.close()
    return count > 0

def is_minor_category_in_use(minor_uuid):
    """특정 소분류가 거래내역에서 사용 중인지 확인합니다."""
    conn = get_db_connection()
    count = conn.execute('SELECT COUNT(*) FROM transactions WHERE minor_category_uuid = ?', (minor_uuid,)).fetchone()[0]
    conn.close()
    return count > 0

def reset_all_transactions():
    """거래내역 테이블을 초기화합니다."""
    conn = get_db_connection()
    conn.execute('DELETE FROM transactions')
    conn.execute('DELETE FROM sqlite_sequence WHERE name="transactions"')  # AUTOINCREMENT 초기화
    conn.commit()
    conn.close()
    print("All transactions have been reset.")

def get_ocr_correction(merchant):
    """OCR 자동보정 테이블에서 보정값을 반환 (없으면 None)"""
    conn = get_db_connection()
    cur = conn.execute("SELECT corrected_text FROM ocr_corrections WHERE original_text = ?", (merchant,))
    row = cur.fetchone()
    conn.close()
    return row['corrected_text'] if row else None

def get_rule_based_minor_category_uuid(merchant):
    """상호명-카테고리 룰매핑 테이블에서 소분류 uuid 반환 (없으면 None)"""
    conn = get_db_connection()
    cur = conn.execute("SELECT minor_category_uuid FROM rule_based_mappings WHERE merchant_name = ?", (merchant,))
    row = cur.fetchone()
    conn.close()
    return row['minor_category_uuid'] if row else None

def get_category_names_by_minor_uuid(minor_uuid):
    """소분류 uuid로 대분류명, 소분류명 반환"""
    conn = get_db_connection()
    cur = conn.execute("""
        SELECT mc.name as major_name, mi.name as minor_name
        FROM minor_categories mi
        JOIN major_categories mc ON mi.major_category_id = mc.id
        WHERE mi.uuid = ?
    """, (minor_uuid,))
    row = cur.fetchone()
    conn.close()
    if row:
        return row['major_name'], row['minor_name']
    return None, None

def get_minor_category_uuid_by_bert_output_id(bert_output_id):
    """bert_output_id로 소분류 uuid 반환"""
    conn = get_db_connection()
    cur = conn.execute("SELECT minor_category_uuid FROM category_mappings WHERE bert_output_id = ?", (bert_output_id,))
    row = cur.fetchone()
    conn.close()
    return row['minor_category_uuid'] if row else None

def get_setting(key):
    """설정 테이블에서 key에 해당하는 값을 반환 (없으면 None)"""
    conn = get_db_connection()
    cur = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cur.fetchone()
    conn.close()
    return row['value'] if row else None

def set_setting(key, value):
    """설정 테이블에 key-value 쌍을 삽입 또는 업데이트합니다."""
    conn = get_db_connection()
    conn.execute("""
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    """, (key, value))
    conn.commit()
    conn.close()

def get_default_consumption_pattern_settings():
    """소비 패턴 인사이트 기본 설정값 반환"""
    return {
        'weekend_ratio_threshold': 1.5,          # 주말/평일 비율
        'weekday_min_count': 3,                  # 요일별 최소 거래 횟수
        'payday_spike_threshold': 30,            # 급여일 후 증가율 (%)
        'month_period_threshold': 30,            # 월초/말 차이 (%)
        'impulse_amount_limit': 5000,           # 소액 지출 기준 (원)
        'impulse_increase_threshold': 20,        # 소액 증가율 (%)
        'category_spike_threshold': 50,         # 카테고리 급증 (%)
        'budget_alert_margin': 10,               # 예산 초과 경고 (%)
        'no_spend_min_days': 3,                  # 무지출 최소 일수
        'year_comparison_threshold': 20,         # 전년 대비 (%)
        'fixed_ratio_warning': 40                # 고정비 비중 경고 (%)
    }

def get_consumption_pattern_settings():
    """DB에서 소비 패턴 설정 불러오기 (없으면 기본값)"""
    import json
    settings_str = get_setting('consumption_pattern_settings')
    if settings_str:
        try:
            return json.loads(settings_str)
        except Exception:
            pass
    return get_default_consumption_pattern_settings()

def set_consumption_pattern_settings(settings_dict):
    """소비 패턴 설정을 DB에 저장"""
    import json
    settings_str = json.dumps(settings_dict)
    set_setting('consumption_pattern_settings', settings_str)