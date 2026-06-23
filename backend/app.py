import os
import sys
from pathlib import Path
# ****** 현재 스크립트 경로를 sys.path에 추가 (모듈 import 해결) ******
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)
    print(f"Added to sys.path: {CURRENT_DIR}")

import sqlite3
import uuid
import torch
import time
import json
import threading
import queue
from flask import Flask, jsonify, request, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from datetime import datetime
from werkzeug.utils import secure_filename

# 유틸리티 모듈
import ocr_service
import classification_service
import database
import category_utils
import account_utils
import transaction_utils
import mapping_utils
import dashboard_utils
import pandas as pd
import ssl



# ****** 디바이스 선택 헬퍼 ******
ssl._create_default_https_context = ssl._create_unverified_context
def get_preferred_torch_device():
    """CUDA가 있으면 CUDA, 그다음 MPS, 마지막에 CPU를 사용합니다."""
    if torch.cuda.is_available():
        return torch.device('cuda')
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


# ****** 모델 경로 헬퍼 ******
def get_model_path(filename):
    """개발/패키징 환경에서 공통 models 폴더의 파일 경로를 반환합니다."""
    if IS_PACKAGED:
        models_dir = Path(RESOURCE_PATH) / 'models'
    else:
        models_dir = Path(__file__).resolve().parents[1] / 'models'

    model_path = models_dir / filename
    print(f"Model path for '{filename}': {model_path}")
    return str(model_path)



# SSE: OCR 비동기 작업 저장소
OCR_JOBS = {}
OCR_JOBS_LOCK = threading.Lock()

# SSE: 진행률 가중치 (이미지 1장 기준)
OCR_STAGE_WEIGHTS = {
    "yolo": 1.0,
    "ocr": 5.0,
    "missing": 7.0,
    "bert": 1.0,
}
OCR_STAGE_TOTAL = sum(OCR_STAGE_WEIGHTS.values())

def _sse_event(event, data):
    # SSE 표준 포맷
    payload = json.dumps(data, ensure_ascii=True)
    return f"event: {event}\ndata: {payload}\n\n"

def _get_job(job_id):
    with OCR_JOBS_LOCK:
        return OCR_JOBS.get(job_id)

def _create_job(file_paths):
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "status": "queued",
        "progress": 0.0,
        "eta_ms": None,
        "results": [],
        "error": None,
        "events": queue.Queue(),
        "created_at": time.time(),
        "total_files": len(file_paths),
        "file_paths": file_paths,
        "canceled": False,
    }
    with OCR_JOBS_LOCK:
        OCR_JOBS[job_id] = job
    return job_id

def _push_event(job, event, payload):
    payload["job_id"] = job["id"]
    job["events"].put((event, payload))

def _estimate_eta_ms(job):
    # 단순 ETA: 완료 이미지 수 기반
    total = max(1, job["total_files"])
    done = int(job["progress"] * total)
    elapsed = time.time() - job["created_at"]
    if done <= 0:
        return None
    per_image = elapsed / done
    remaining = max(0, total - done)
    return int(per_image * remaining * 1000)

def _run_ocr_job(job_id):
    job = _get_job(job_id)
    if not job:
        return

    job["status"] = "running"
    _push_event(job, "status", {"status": job["status"]})

    try:
        all_results = []
        total = job["total_files"]

        for idx, filepath in enumerate(job["file_paths"], start=1):
            if job.get("canceled"):
                job["status"] = "canceled"
                _push_event(job, "status", {"status": job["status"]})
                return

            filename = os.path.basename(filepath)
            stage_done_weight = 0.0
            
            def on_stage(stage_name):
                if job.get("canceled"):
                    raise Exception("Job canceled by user")
                
                nonlocal stage_done_weight
                stage_done_weight += OCR_STAGE_WEIGHTS.get(stage_name, 0.0)
                # 이미지 1장 진행률
                per_image_progress = stage_done_weight / OCR_STAGE_TOTAL
                overall_progress = ((idx - 1) + per_image_progress) / total

                job["progress"] = overall_progress
                job["eta_ms"] = _estimate_eta_ms(job)

                _push_event(job, "progress", {
                    "stage": stage_name,
                    "file_name": filename,
                    "index": idx,
                    "total": total,
                    "progress": overall_progress,
                    "eta_ms": job["eta_ms"],
                })

            try:
                with open(filepath, "rb") as f:
                    image_bytes = f.read()

                transactions = ocr_service.process_image_to_transactions(image_bytes, on_stage=on_stage)
            except Exception as e:
                if str(e) == "Job canceled by user":
                    job["status"] = "canceled"
                    _push_event(job, "status", {"status": job["status"]})
                    print("OCR job canceled by user.")
                    return
                raise
            

            for tx in transactions:
                tx["file_name"] = filename

            all_results.extend(transactions)

            job["progress"] = idx / total
            job["eta_ms"] = _estimate_eta_ms(job)
            _push_event(job, "progress", {
                "stage": "done_file",
                "file_name": filename,
                "index": idx,
                "total": total,
                "progress": job["progress"],
                "eta_ms": job["eta_ms"],
            })

        cleaned_results = [
            {k: (None if pd.isna(v) else v) for k, v in tx.items()}
            for tx in all_results
        ]
        job["results"] = cleaned_results
        job["status"] = "done"
        job["progress"] = 1.0

        _push_event(job, "done", {
            "status": job["status"],
            "progress": job["progress"],
            "result_count": len(cleaned_results),
        })

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        _push_event(job, "error", {
            "status": job["status"],
            "message": job["error"],
        })





# Flask 앱 초기화
app = Flask(__name__, static_folder='../frontend/dist', static_url_path='/')
CORS(app)  # 모든 도메인에서의 요청 허용 (개발 단계에서만 사용 권장)

# --- 서버 시작 시 한 번만 모델 및 DB 로드 ---
print("Starting server...")

BACKEND_PORT = int(os.getenv('BACKEND_PORT', '5050'))
print(f"BACKEND_PORT: {BACKEND_PORT}")

# ****** 헬스체크 API ******
@app.route('/api/health', methods=['GET'])
def health_check():
    """백엔드 서버 상태 확인"""
    device_str = str(device).upper()
    return jsonify({
        'status': 'ok',
        'message': f'Backend is ready! Device: {device_str}',
        'device': device_str,
        'timestamp': datetime.now().isoformat()
    }), 200

# ****** 프론트엔드 정적 파일 서빙 (Electron 빌드 시) ******
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """프론트엔드 정적 파일 제공"""
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# ****** 패키징 환경 감지 ******
IS_PACKAGED = os.getenv('IS_PACKAGED', 'false') == 'true'
RESOURCE_PATH = os.getenv('RESOURCE_PATH', os.path.dirname(os.path.abspath(__file__)))

print(f"IS_PACKAGED: {IS_PACKAGED}")
print(f"RESOURCE_PATH: {RESOURCE_PATH}")

# ****** DB 폴더 경로 설정 ******
DB_FOLDER = database.get_data_path()  # DB_FOLDER 정의
os.makedirs(DB_FOLDER, exist_ok=True)

# DB 경로 전역 변수
DB_PATH = database.get_db_path()

# ****** 리소스 경로 가져오기 ******
def get_resource_path(relative_path):
    """
    패키징 여부에 따라 리소스 절대 경로 반환
    """
    if IS_PACKAGED:
        # 패키징된 경우: RESOURCE_PATH 기준
        base_path = RESOURCE_PATH
    else:
        # 개발 환경: 현재 파일 기준
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    full_path = os.path.join(base_path, relative_path)
    print(f"Resource path for '{relative_path}': {full_path}")
    return full_path

# ****** 모델 경로 설정 ******
OCR_MODEL_PATH = get_model_path('yolov8l_e50_bs8_0828_best.pt')

print(f"YOLO Model: {OCR_MODEL_PATH}")

# 모델 파일 존재 확인
if not os.path.exists(OCR_MODEL_PATH):
    print(f"WARNING: YOLO model not found at {OCR_MODEL_PATH}")

# 1. DB 초기화
try:
    database.init_db()
    account_utils.initialize_default_accounts() # 계좌 기본값 채우기
    category_utils.initialize_default_categories() # 카테고리 기본값 채우기
    mapping_utils.initialize_default_mappings() # 매핑 기본값 채우기
except Exception as e:
    print(f"ERROR: Database initialization failed - {e}")

# 1. OCR 서비스 초기화
print("Initializing OCR service...")
# ****** 업로드 폴더 설정 ******
UPLOAD_ROOT = str(Path.home() / '.moneyComPiler' / 'uploads')
UPLOAD_FOLDER = os.path.join(UPLOAD_ROOT)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
device = get_preferred_torch_device()
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

try:
    ocr_service.initialize_predictor(model_path=OCR_MODEL_PATH)
    print("OCR service initialized successfully.")
except Exception as e:
    print(f"ERROR: OCR service initialization failed - {e}")

# 2. 업종 분류 서비스 초기화
print("Initializing Classification service...")
try:
    classification_service.initialize_classifier()
    print("Classification service initialized successfully.")
except Exception as e:
    print(f"ERROR: Classification service initialization failed - {e}")


# -----------------------------------------
# 기본 API 엔드포인트 정의
@app.route('/')
def home():
    return jsonify({"message": "Backend server is running successfully!"})


# ------------------- 대시보드 통계 API -------------------
@app.route('/api/settings/dashboard_trend_range', methods=['GET', 'POST'])
def manage_dashboard_trend_range():
    """대시보드 월별 추이 슬라이더의 기간 설정을 관리합니다."""
    if request.method == 'GET':
        try:
            saved_range = dashboard_utils.get_dashboard_trend_range()
            return jsonify(saved_range) # 값이 없으면 null 반환
        except Exception as e:
            print(f"Error getting dashboard trend range setting: {e}")
            return jsonify({"error": "Failed to retrieve setting"}), 500
            
    if request.method == 'POST':
        data = request.get_json()
        if not data or 'range' not in data:
            return jsonify({"error": "Invalid data format, 'range' key is required."}), 400
        try:
            dashboard_utils.set_dashboard_trend_range(data['range'])
            return jsonify({"message": "Setting saved successfully."})
        except Exception as e:
            print(f"Error saving dashboard trend range setting: {e}")
            return jsonify({"error": "Failed to save setting"}), 500
        
@app.route('/api/settings/dashboard_selected_date', methods=['GET', 'POST'])
def manage_dashboard_selected_date():
    """대시보드 선택 년/월 설정을 관리합니다."""
    if request.method == 'GET':
        try:
            saved_date = dashboard_utils.get_dashboard_selected_date()
            return jsonify(saved_date)  # 값이 없으면 null 반환
        except Exception as e:
            print(f"Error getting dashboard selected date setting: {e}")
            return jsonify({"error": "Failed to retrieve setting"}), 500
            
    if request.method == 'POST':
        data = request.get_json()
        if not data or 'year' not in data or 'month' not in data:
            return jsonify({"error": "Invalid data format, 'year' and 'month' keys are required."}), 400
        try:
            dashboard_utils.set_dashboard_selected_date(data['year'], data['month'])
            return jsonify({"message": "Setting saved successfully."})
        except Exception as e:
            print(f"Error saving dashboard selected date setting: {e}")
            return jsonify({"error": "Failed to save setting"}), 500
        
@app.route('/api/statistics/monthly_summary', methods=['GET'])
def get_monthly_summary_route():
    """월별 수입/지출 요약 데이터를 반환합니다."""
    start_month = request.args.get('start_month')
    end_month = request.args.get('end_month')
    try:
        summary_data = dashboard_utils.get_monthly_summary(start_month, end_month)
        return jsonify(summary_data)
    except Exception as e:
        print(f"Error getting monthly summary: {e}")
        return jsonify({"error": "Failed to retrieve monthly summary"}), 500

@app.route('/api/statistics/available_months', methods=['GET'])
def get_available_months_route():
    """거래내역이 있는 모든 월 목록을 반환합니다."""
    try:
        months = dashboard_utils.get_available_months()
        return jsonify(months)
    except Exception as e:
        print(f"Error getting available months: {e}")
        return jsonify({"error": "Failed to retrieve available months"}), 500

@app.route('/api/statistics/monthly_detail', methods=['GET'])
def get_monthly_detail_route():
    """월별 상세 분석 데이터(수입/지출 유형별 합계)를 반환합니다."""
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    if not year or not month:
        return jsonify({"error": "year and month parameters are required."}), 400
    try:
        summary_data = dashboard_utils.get_monthly_detail_summary(year, month)
        return jsonify(summary_data)
    except Exception as e:
        print(f"Error getting monthly detail summary: {e}")
        return jsonify({"error": "Failed to retrieve monthly detail summary"}), 500

@app.route('/api/statistics/category_spending', methods=['GET'])
def get_category_spending_route():
    """월별 대분류별 지출 데이터를 반환합니다."""
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    if not year or not month:
        return jsonify({"error": "year and month parameters are required."}), 400
    try:
        spending_data = dashboard_utils.get_category_spending(year, month)
        return jsonify(spending_data)
    except Exception as e:
        print(f"Error getting category spending: {e}")
        return jsonify({"error": "Failed to retrieve category spending"}), 500
    
@app.route('/api/statistics/account_balances', methods=['GET'])
def get_account_balances_route():
    """계좌별 현재 잔액 데이터 반환(전체 기간 기준)"""
    try:
        balances = dashboard_utils.get_account_balances()
        return jsonify(balances)
    except Exception as e:
        print(f"Error getting account balances: {e}")
        return jsonify({"error": "Failed to retrieve account balances"}), 500
    
@app.route('/api/statistics/asset_portfolio_monthly', methods=['GET'])
def asset_portfolio_monthly():
    """전체 기간의 월별 계좌 잔액 추이 반환"""
    try:
        data = dashboard_utils.get_account_balances_monthly()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/statistics/category_treemap', methods=['GET'])
def get_category_treemap_route():
    """트리맵 데이터 반환 (대분류-소분류별 지출 비율)"""
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    try:
        data = dashboard_utils.get_category_treemap(year, month)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/statistics/top_spending', methods=['GET'])
def get_top_spending_route():
    """기간 내 지출액/빈도수 기준 TOP 10 소분류 데이터를 반환합니다."""
    start_month = request.args.get('start_month')
    end_month = request.args.get('end_month')
    if not start_month or not end_month:
        return jsonify({"error": "start_month and end_month parameters are required."}), 400
    try:
        top_spending_data = dashboard_utils.get_top_spending_categories(start_month, end_month)
        return jsonify(top_spending_data)
    except Exception as e:
        print(f"Error getting top spending categories: {e}")
        return jsonify({"error": "Failed to retrieve top spending categories"}), 500

# 예산 조회 API
@app.route('/api/budgets', methods=['GET'])
def api_get_budgets():
    budgets = dashboard_utils.get_all_budgets()
    return jsonify(budgets)

# 예산 추가/수정/삭제 API
@app.route('/api/budgets', methods=['POST'])
def api_add_budget():
    data = request.json
    result = dashboard_utils.add_budget(data)
    return jsonify(result)

@app.route('/api/budgets/<int:budget_id>', methods=['PUT'])
def api_update_budget(budget_id):
    data = request.json
    result = dashboard_utils.update_budget(budget_id, data)
    return jsonify(result)

@app.route('/api/budgets/<int:budget_id>', methods=['DELETE'])
def api_delete_budget(budget_id):
    result = dashboard_utils.delete_budget(budget_id)
    return jsonify(result)

# ****** 고정비 관리 API ******
@app.route('/api/statistics/fixed_expenses', methods=['GET'])
def get_fixed_expenses_api():
    """고정비(고정지출) 내역을 반환합니다."""
    start_month = request.args.get('start_month')
    end_month = request.args.get('end_month')
    
    if not start_month or not end_month:
        return jsonify({"error": "start_month and end_month are required"}), 400
    
    try:
        data = dashboard_utils.get_fixed_expenses(start_month, end_month)
        return jsonify(data)
    except Exception as e:
        print(f"Error in get_fixed_expenses_api: {e}")
        return jsonify({"error": "Failed to fetch fixed expenses"}), 500

# ****** 소비 패턴 인사이트 API ******
@app.route('/api/dashboard/consumption-pattern', methods=['GET'])
def get_consumption_pattern():
    """소비 패턴 인사이트 데이터 반환 (히트맵 + 거래내역 +  자동 인사이트)"""
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    
    if not year or not month:
        return jsonify({"error": "year and month parameters are required."}), 400
    
    try:
        data = dashboard_utils.get_consumption_pattern_insights(year, month)
        return jsonify(data)
    except Exception as e:
        print(f"Error getting consumption pattern insights: {e}")
        return jsonify({"error": "Failed to retrieve consumption pattern insights"}), 500

@app.route('/api/settings/consumption-pattern', methods=['GET', 'POST'])
def manage_consumption_pattern_settings():
    """소비 패턴 인사이트 설정 관리"""
    if request.method == 'GET':
        try:
            settings = database.get_consumption_pattern_settings()
            return jsonify(settings)
        except Exception as e:
            print(f"Error getting consumption pattern settings: {e}")
            return jsonify({"error": "Failed to retrieve settings"}), 500
    
    if request.method == 'POST':
        try:
            settings_data = request.get_json()
            if not isinstance(settings_data, dict):
                return jsonify({"error": "Invalid data format"}), 400
            
            database.set_consumption_pattern_settings(settings_data)
            return jsonify({"message": "Settings saved successfully"})
        except Exception as e:
            print(f"Error saving consumption pattern settings: {e}")
            return jsonify({"error": "Failed to save settings"}), 500




# -------------------- 설정 API -------------------
@app.route('/api/settings/data-path', methods=['GET'])
def get_data_path():
    return jsonify({"path": database.get_data_path()})

@app.route('/api/settings/data-path', methods=['POST'])
def set_data_path():
    data = request.get_json()
    if not data or 'path' not in data:
        return jsonify({"error": "path is required"}), 400
    database.set_data_path(data['path'])
    return jsonify({"message": "saved"})

@app.route('/api/settings/data-path/default', methods=['GET'])
def get_default_data_path():
    return jsonify({"path": database.get_default_data_path()})

@app.route('/api/settings/data-path/move', methods=['POST'])
def move_data_path():
    data = request.get_json()
    if not data or 'path' not in data:
        return jsonify({"error": "path is required"}), 400

    new_base = data['path']
    old_base = data.get('fromPath')
    force = bool(data.get('force'))

    if not old_base:
        return jsonify({"error": "fromPath is required"}), 400

    ok, err = database.move_database(old_base, new_base, force=force)
    if not ok:
        return jsonify({"error": err}), 400
    
    database.set_data_path(new_base) # move 성공한 경우에만 data_path 저장
    return jsonify({"message": "moved", "restart_required": True})




# ------------------- 거래내역 API -------------------
@app.route('/api/transactions', methods=['GET', 'POST'])
def manage_transactions():
    """데이터베이스에 저장된 모든 거래 내역을 JOIN하여 조회합니다. (필요시 기본값 생성)"""
    if request.method == 'GET':
        try:
            transactions = transaction_utils.load_transactions()
            return jsonify(transactions)
        except Exception as e:
            print(f"Error loading transactions: {e}")
            return jsonify({"error": "Failed to load transactions"}), 500
    
    if request.method == 'POST':
        try:
            frontend_data = request.get_json()
            updated_transactions = transaction_utils.save_transactions(frontend_data)
            return jsonify(updated_transactions)
        except Exception as e:
            print(f"Error saving transactions: {e}")
            return jsonify({"error": "Failed to save transactions"}), 500

# @app.route('/api/transactions/reset', methods=['POST'])
# def reset_transactions():
#     """거래내역 데이터를 모두 삭제하고 성공 메시지를 반환합니다."""
#     try:
#         database.reset_all_transactions()
#         return jsonify({"message": "Transactions reset successfully"})
#     except Exception as e:
#         print(f"Error resetting transactions: {e}")
#         return jsonify({"error": str(e)}), 500

# 이미지 처리를 위한 API 엔드포인트
@app.route('/api/ocr/transactions', methods=['POST'])
def api_ocr_transactions():
    if 'images' not in request.files:
        return jsonify({'error': 'No images uploaded'}), 400

    files = request.files.getlist('images')
    # total_files = len(files)
    all_results = []

    for idx, file in enumerate(files, start=1):
        # image_start = time.perf_counter() # 이미지 처리 시작 시간

        # 1. 이미지 파일을 임시 저장
        filename = secure_filename(file.filename)
        # print(f"[OCR_IMG_START] idx: {idx}/{total_files}, filename: {filename}")

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.seek(0) # 스트림 위치 초기화
        file.save(filepath)
        
        # 저장된 파일에서 바이트를 다시 읽어 처리
        with open(filepath, 'rb') as f:
            image_bytes = f.read()

        transactions = ocr_service.process_image_to_transactions(image_bytes)
        
        for tx in transactions:
            tx['file_name'] = filename
        
        all_results.extend(transactions)
        # img_elapsed = int((time.perf_counter()  s}, filename: {filename}, elapsed: {img_elapsed}ms")
        
    cleaned_results = [
        {k: (None if pd.isna(v) else v) for k, v in tx.items()}
        for tx in all_results
    ]
    
    return jsonify(cleaned_results)


# SSE: OCR 작업 시작
@app.route("/api/ocr/transactions/start", methods=["POST"])
def start_ocr_job():
    if "images" not in request.files:
        return jsonify({"error": "No images uploaded"}), 400

    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "No images uploaded"}), 400

    # 파일을 업로드 폴더에 먼저 저장하고 경로만 전달
    saved_paths = []
    for file in files:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.seek(0)
        file.save(filepath)
        saved_paths.append(filepath)

    job_id = _create_job(saved_paths)
    threading.Thread(target=_run_ocr_job, args=(job_id,), daemon=True).start()

    return jsonify({"job_id": job_id}), 200

# SSE: OCR 진행 스트림
@app.route("/api/ocr/transactions/stream/<job_id>", methods=["GET"])
def stream_ocr_job(job_id):
    job = _get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    def generate():
        # 초기 상태 1회 전송
        yield _sse_event("status", {
            "status": job["status"],
            "progress": job["progress"],
            "eta_ms": job["eta_ms"],
        })

        while True:
            try:
                event, payload = job["events"].get(timeout=10)
                yield _sse_event(event, payload)
                if event in ("done", "error"):
                    break
            except queue.Empty:
                # keep-alive ping
                yield _sse_event("ping", {"t": int(time.time())})

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(stream_with_context(generate()), headers=headers, mimetype="text/event-stream")

# SSE: OCR 결과 조회 (스트림 끊김 대비)
@app.route("/api/ocr/transactions/result/<job_id>", methods=["GET"])
def get_ocr_job_result(job_id):
    job = _get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if job["status"] != "done":
        return jsonify({
            "status": job["status"],
            "progress": job["progress"],
            "eta_ms": job["eta_ms"],
            "error": job["error"],
        }), 202

    return jsonify(job["results"]), 200

@app.route("/api/ocr/transactions/cancel/<job_id>", methods=["POST"])
def cancel_ocr_job(job_id):
    job = _get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    job["canceled"] = True
    return jsonify({"message": "Cancellation requested"}), 200


# 1. 저장된 OCR 이미지를 제공하는 엔드포인트 추가
@app.route('/api/ocr/image/<filename>')
def get_ocr_image(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)





# # -------------------- 계좌 카테고리 초기화 -------------------
# @app.route('/api/initialize-defaults', methods=['POST'])
# def initialize_defaults():
#     """계좌와 카테고리 테이블을 기본값으로 초기화합니다."""
#     try:
#         conn = database.get_db_connection()
#         cursor = conn.cursor()
#         cursor.execute('DELETE FROM accounts')
#         cursor.execute('DELETE FROM major_categories')
#         cursor.execute('DELETE FROM minor_categories')
#         conn.commit()
#         conn.close()

#         account_utils.initialize_default_accounts()
#         category_utils.initialize_default_categories()
#         return jsonify({"message": "Default accounts and categories initialized successfully."}), 200
#     except Exception as e:
#         print(f"Error initializing defaults: {e}")
#         return jsonify({"error": str(e)}), 500




# ------------------- 카테고리 API -------------------
@app.route('/api/categories', methods=['GET', 'POST'])
def manage_categories():
    if request.method == 'GET':
        categories = category_utils.load_categories()
        return jsonify(categories)
    if request.method == 'POST':
        data = request.get_json()
        updated_categories = category_utils.save_categories(data)
        return jsonify(updated_categories)


@app.route('/api/categories/usage', methods=['GET'])
def get_category_usage():
    uuid = request.args.get('uuid')
    if not uuid:
        return jsonify({"error": "UUID parameter is required."}), 400
    try:
        in_use = database.is_minor_category_in_use(uuid)
        return jsonify({"in_use": in_use})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/categories/defaults', methods=['GET'])
def get_default_categories():
    """기본 카테고리 데이터 반환(초기화 수행용)"""
    return jsonify(category_utils.get_default_categories())




# ------------------- 계좌 API -------------------
@app.route('/api/accounts', methods=['GET', 'POST'])
def manage_accounts():
    if request.method == 'GET':
        accounts = account_utils.load_accounts()
        return jsonify(accounts)
    if request.method == 'POST':
        data = request.get_json()
        updated_accounts = account_utils.save_accounts(data)
        return jsonify(updated_accounts)
    
@app.route('/api/accounts/usage', methods=['GET'])
def get_account_usage():
    account_id = request.args.get('id', type=int)
    if account_id is None:
        return jsonify({"error": "Account ID parameter is required."}), 400
    try:
        in_use = database.is_account_in_use(account_id)
        return jsonify({"in_use": in_use})
    except Exception as e:
        return jsonify({"error": str(e)}), 500






# ------------------- 매핑 API -------------------
@app.route('/api/mappings', methods=['GET', 'POST'])
def manage_mappings():
    """카테고리 매핑 데이터를 조회하거나 업데이트합니다."""
    if request.method == 'GET':
        try:
            mapping_data = mapping_utils.load_mappings()
            return jsonify(mapping_data)
        except Exception as e:
            print(f"Error loading mappings: {e}")
            return jsonify({"error": "Failed to load mappings"}), 500

    if request.method == 'POST':
        try:
            mappings_data = request.get_json()
            if not isinstance(mappings_data, dict):
                return jsonify({"error": "Invalid data format, expected a mapping object"}), 400
            
            result = mapping_utils.update_all_mappings(mappings_data)
            return jsonify(result)
        except Exception as e:
            print(f"Error updating mapping: {e}")
            return jsonify({"error": "Failed to update mapping"}), 500

# @app.route('/api/mappings/reset', methods=['POST'])
# def reset_mappings():
#     """매핑을 기본값으로 초기화합니다."""
#     try:
#         result = mapping_utils.reset_mappings_to_default()
#         return jsonify(result)
#     except Exception as e:
#         print(f"Error resetting mappings: {e}")
#         return jsonify({"error": "Failed to reset mappings"}), 500
@app.route('/api/mappings/defaults', methods=['GET'])
def get_default_mappings():
    """기본 매핑 데이터 반환(초기화 수행용)"""
    return jsonify(mapping_utils.get_default_mappings())
    
# OCR 보정 규칙    
@app.route('/api/ocr-corrections', methods=['GET', 'POST', 'PATCH'])
def manage_ocr_corrections():
    """OCR 보정 규칙을 조회하거나 저장합니다."""
    if request.method == 'GET':
        try:
            corrections = mapping_utils.get_all_ocr_corrections()
            return jsonify(corrections)
        except Exception as e:
            print(f"Error loading OCR corrections: {e}")
            return jsonify({"error": "Failed to load OCR corrections"}), 500

    if request.method == 'POST':
        try:
            corrections_data = request.get_json()
            if not isinstance(corrections_data, list):
                return jsonify({"error": "Invalid data format, expected a list of correction objects"}), 400
            
            updated_corrections = mapping_utils.save_ocr_corrections(corrections_data)
            return jsonify(updated_corrections)
        except Exception as e:
            print(f"Error saving OCR corrections: {e}")
            return jsonify({"error": "Failed to save OCR corrections"}), 500

    if request.method == 'PATCH':
            data = request.get_json()
            if not data or 'original_text' not in data or 'corrected_text' not in data:
                return jsonify({'error': 'Invalid data format'}), 400
            try:
                mapping_utils.add_ocr_correction(data['original_text'], data['corrected_text'])
                return jsonify({'message': 'OCR correction added/updated successfully'}), 201
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
@app.route('/api/rule-based-mappings', methods=['GET', 'POST', 'PATCH'])
def manage_rule_based_mappings():
    """상호명-카테고리 매핑을 조회하거나 저장합니다."""
    if request.method == 'GET':
        try:
            rules = mapping_utils.get_all_rule_based_mappings()
            return jsonify(rules)
        except Exception as e:
            print(f"Error loading merchant-category mappings: {e}")
            return jsonify({"error": "Failed to load rule-based mappings"}), 500

    if request.method == 'POST':
        try:
            mappings_data = request.get_json()
            if not isinstance(mappings_data, list):
                return jsonify({"error": "Invalid data format, expected a list of mapping objects"}), 400
            
            updated_mappings = mapping_utils.save_rule_based_mappings(mappings_data)
            return jsonify(updated_mappings)
        except Exception as e:
            print(f"Error saving merchant-category mappings: {e}")
            return jsonify({"error": "Failed to save merchant-category mappings"}), 500
        
    if request.method == 'PATCH':
        data = request.get_json()
        if not data or 'merchant_name' not in data or 'minor_category_uuid' not in data:
            return jsonify({'error': 'Invalid data format'}), 400
        try:
            mapping_utils.add_rule_based_mapping(data['merchant_name'], data['minor_category_uuid'])
            return jsonify({'message': 'Rule-based mapping added/updated successfully'}), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
@app.route('/api/ocr-corrections/<original_text>', methods=['DELETE'])
def delete_ocr_correction(original_text):
    """OCR 보정 규칙 삭제"""
    try:
        result = mapping_utils.delete_ocr_correction(original_text)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error deleting OCR correction: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/rule-based-mappings/<merchant_name>', methods=['DELETE'])
def delete_rule_based_mapping(merchant_name):
    """상호명 기반 매핑 규칙 삭제"""
    try:
        result = mapping_utils.delete_rule_based_mapping(merchant_name)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error deleting rule-based mapping: {e}")
        return jsonify({"error": str(e)}), 500






# 이 파일이 직접 실행될 때만 서버를 실행
if __name__ == '__main__':
    app.run(debug=False, port=BACKEND_PORT) # 개발 시 debug=True
    # app.run(debug=False, port=BACKEND_PORT, host='0.0.0.0') # 실제 서비스 시 debug=False 권장