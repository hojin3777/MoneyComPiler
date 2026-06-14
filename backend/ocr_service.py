import torch
from ultralytics import YOLO
from PIL import Image, ImageFont
import os
import sys
import cv2
import time
import numpy as np
import re
from collections import defaultdict
from datetime import datetime
import pandas as pd
import io
import classification_service
import database
import mapping_utils


# ****** Pororo 모듈 경로 설정 ******
def get_pororo_path():
    """패키징 여부에 따라 Pororo 경로 반환"""
    is_packaged = os.getenv('IS_PACKAGED', 'false') == 'true'
    resource_path = os.getenv('RESOURCE_PATH', os.path.dirname(os.path.abspath(__file__)))
    
    if is_packaged:
        # 패키징된 경우
        pororo_path = os.path.join(resource_path, 'pororo_easyocr_main')
    else:
        # 개발 환경
        pororo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'pororo_easyocr_main'))
    
    print(f"Pororo 경로: {pororo_path}")
    
    if not os.path.exists(pororo_path):
        print(f"WARNING: Pororo module not found at {pororo_path}")
    
    return pororo_path

# --- 로컬 Pororo 모듈 경로 설정 ---
# 이 파일의 위치를 기준으로 경로를 다시 계산해야 합니다.
# customMydataService/backend/ocr_service.py 이므로, 두 단계 위로 올라가야 합니다.
# PORORO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'pororo_easyocr_main'))
# if PORORO_PATH not in sys.path:
#     sys.path.append(PORORO_PATH)

PORORO_PATH = get_pororo_path()
if PORORO_PATH not in sys.path:
    sys.path.append(PORORO_PATH)
    print(f"Pororo 경로 추가됨: {PORORO_PATH}")

try:
    from main import EasyPororoOcr
except ImportError:
    print(f"오류: '{PORORO_PATH}' 경로에서 Pororo 모듈을 찾을 수 없습니다.")
    raise

# --- 전역 변수로 예측기(predictor)를 관리 (싱글톤 패턴) ---
# 서버가 켜질 때 한 번만 로드하여 재사용합니다.
predictor = None


def get_preferred_torch_device():
    """CUDA가 있으면 CUDA, 그다음 MPS, 마지막에 CPU를 사용합니다."""
    if torch.cuda.is_available():
        return 'cuda'
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return 'mps'
    return 'cpu'


class YOLOv8_OCR_Predictor:
    """YOLOv8로 객체를 탐지하고, 탐지된 영역에서 OCR을 수행하는 예측기 (API용)"""
    def __init__(self, model_path):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"YOLO 모델 가중치 파일을 찾을 수 없습니다: {model_path}")
        
        self.device = get_preferred_torch_device()
        self.model = YOLO(model_path)
        self.model.to(self.device)
        self.ocr_reader = EasyPororoOcr(gpu=self.device)
        print(f"[YOLO] device: {self.device}, model_path: {model_path}")

    def detect_only(self, image, conf_threshold=0.5):
        results = self.model.predict(image, conf=conf_threshold, verbose=False)
        detected_objects = []
        for res in results:
            boxes = res.boxes.cpu().numpy()
            for box in boxes:
                class_id = int(box.cls[0])
                label = self.model.names[class_id]
                confidence = float(box.conf[0])
                coords = [int(c) for c in box.xyxy[0]]
                detected_objects.append({'label': label, 'box': coords, 'confidence': confidence})
        detected_objects.sort(key=lambda obj: (obj['box'][1], obj['box'][0]))
        return detected_objects

# --- Jupyter Notebook에서 가져온 헬퍼 함수들 ---
def calculate_iou(boxA, boxB):
    """두 박스(box)의 IoU(Intersection over Union)를 계산합니다."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    if interArea == 0: return 0
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou

def is_valid_ocr_text(text):
    """OCR 결과가 유효한 텍스트인지 (UI 아이콘 등이 아닌지) 판별합니다."""
    if not text or len(text.strip()) < 1: return False
    if not re.search(r'[\uac00-\ud7a3a-zA-Z0-9,.!@#$%^&*]', text): return False
    return True


def run_hybrid_prediction(image, predictor_instance, conf_threshold=0.4, on_stage=None):
    """
    YOLO 우선 탐지 후, OCR로 텍스트를 채우고 누락된 영역을 선별적으로 재탐지하는 정교한 하이브리드 예측 로직.
    (탐지 영역 OCR 최적화 버전)
    """
    # 1. YOLO 우선 탐지
    # yolo_start = time.perf_counter()
    yolo_dets = predictor_instance.detect_only(image, conf_threshold=conf_threshold)
    # yolo_elapsed = int((time.perf_counter() - yolo_start) * 1000)
    # print(f"[YOLO] detections: {len(yolo_dets)}, elapsed: {yolo_elapsed}ms")
    if on_stage: on_stage("yolo") # yolo 완료
    if not yolo_dets: return []
    # 2. 탐지 영역 일괄 OCR
    # ocr_start = time.perf_counter()
    yolo_predictions = []
    if yolo_dets:
        cropped_images_with_info = []
        padding = 10
        for det in yolo_dets:
            box = det['box']
            crop_box = (max(0, box[0] - padding), max(0, box[1] - padding), min(image.width, box[2] + padding), min(image.height, box[3] + padding))
            cropped_img = image.crop(crop_box)
            cropped_images_with_info.append({'image': cropped_img, 'original_det': det})
        max_width = max(img.width for img in [item['image'] for item in cropped_images_with_info]) if cropped_images_with_info else 0
        total_height = sum(img.height for img in [item['image'] for item in cropped_images_with_info])
        if max_width > 0 and total_height > 0:
            composite_image = Image.new('RGB', (max_width, total_height), (0, 0, 0))
            y_offset = 0
            crop_y_boundaries = []
            for item in cropped_images_with_info:
                img = item['image']
                composite_image.paste(img, (0, y_offset))
                crop_y_boundaries.append((y_offset, y_offset + img.height))
                y_offset += img.height
            composite_cv_image = cv2.cvtColor(np.array(composite_image), cv2.COLOR_RGB2BGR)
            predictor_instance.ocr_reader.run_ocr(composite_cv_image, debug=False)
            composite_ocr_results = predictor_instance.ocr_reader.get_ocr_result()
            for i, (y_start, y_end) in enumerate(crop_y_boundaries):
                texts_for_this_crop = [res[1] for res in composite_ocr_results if y_start <= (res[0][0][1] + res[0][2][1]) / 2 < y_end] if composite_ocr_results else []
                text = ' '.join(texts_for_this_crop)
                original_det = cropped_images_with_info[i]['original_det']
                yolo_predictions.append({'label': original_det['label'], 'text': text.strip(), 'box': original_det['box'], 'confidence': f"{original_det['confidence']:.2f}", 'source': 'YOLO-Primary'})
    # ocr_elapsed = int((time.perf_counter() - ocr_start) * 1000)
    # print(f"[OCR] OCR results: {len(yolo_predictions)}, elapsed: {ocr_elapsed}ms")
    if on_stage: on_stage("ocr") # ocr 완료

    # 3. 누락된 텍스트 탐색
    # missing_start = time.perf_counter()
    cv_image_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    predictor_instance.ocr_reader.run_ocr(cv_image_bgr, debug=False)
    full_ocr_results = predictor_instance.ocr_reader.get_ocr_result()
    missed_ocr = []
    if full_ocr_results:
        for ocr_res in full_ocr_results:
            ocr_box = [int(ocr_res[0][0][0]), int(ocr_res[0][0][1]), int(ocr_res[0][2][0]), int(ocr_res[0][2][1])]
            if is_valid_ocr_text(ocr_res[1]) and not any(calculate_iou(y_pred['box'], ocr_box) > 0.01 for y_pred in yolo_predictions):
                missed_ocr.append({'text': ocr_res[1], 'box': ocr_box})
    # 4. 누락 영역 선별적 재탐지
    additional_predictions = []
    if missed_ocr:
        for ocr_info in list(missed_ocr):
            ocr_box = ocr_info['box']
            slice_height = ocr_box[3] - ocr_box[1]
            padding = int(slice_height * 0.25)
            slice_y1 = max(0, ocr_box[1] - padding)
            slice_y2 = min(image.height, ocr_box[3] + padding)
            if (slice_y2 - slice_y1) > image.height * 0.2: continue
            horizontal_slice = image.crop((0, slice_y1, image.width, slice_y2))
            slice_results = predictor_instance.model.predict(horizontal_slice, conf=0.4, verbose=False)
            best_match = None
            max_iou = 0.1
            for res in slice_results:
                for box in res.boxes.cpu().numpy():
                    original_box = [int(box.xyxy[0][0]), int(box.xyxy[0][1] + slice_y1), int(box.xyxy[0][2]), int(box.xyxy[0][3] + slice_y1)]
                    iou = calculate_iou(original_box, ocr_info['box'])
                    if iou > max_iou:
                        max_iou = iou
                        best_match = {'label': predictor_instance.model.names[int(box.cls[0])], 'text': ocr_info['text'], 'box': original_box, 'confidence': f"{box.conf[0]:.2f}", 'source': 'YOLO-補'}
            if best_match:
                additional_predictions.append(best_match)
                if ocr_info in missed_ocr: missed_ocr.remove(ocr_info)
    # 5. 최종 결과 종합
    final_predictions = sorted(yolo_predictions + additional_predictions, key=lambda p: (p['box'][1], p['box'][0]))
    # missing_elapsed = int((time.perf_counter() - missing_start) * 1000)
    # print(f"[MISSING] missed OCR: {len(missed_ocr)}, additional detections: {len(additional_predictions)}, elapsed: {missing_elapsed}ms")
    if on_stage: on_stage("missing") # 최종 결과 준비 완료
    return final_predictions

def structure_transactions_sequentially(predictions):
    """
    순차적 상태 기반 파서를 사용하여 예측 결과를 구조화된 거래 내역으로 변환합니다.
    (날짜 후처리 로직 적용, 거래처 병합 로직은 제거, y축 겹치는 날짜 보정 포함)
    """
    def parse_amount(text, label):
        if not text: return None
        try:
            cleaned_text = re.sub(r'[^\d-]', '', str(text))
            if not cleaned_text: return None
            amount = float(cleaned_text)
            if label == 'AMOUNT_OUT' and amount > 0: return -amount
            return amount
        except (ValueError, TypeError): return None

    def format_date(date_str):
        if not date_str:
            return None
        
        # "MM월 DD일" 형식 처리
        match_kor = re.match(r'(\d{1,2})월\s*(\d{1,2})일', date_str.strip())
        if match_kor:
            current_year = datetime.now().year
            month, day = map(int, match_kor.groups())
            return f"{current_year:04d}-{month:02d}-{day:02d}"

        # 모든 구분자를 '-'로 통일
        cleaned_str = re.sub(r'[./]', '-', date_str)
        
        # YYYY-MM-DD 형식
        match = re.match(r'(\d{4})-(\d{1,2})-(\d{1,2})', cleaned_str)
        if match:
            year, month, day = map(int, match.groups())
            return f"{year:04d}-{month:02d}-{day:02d}"

        # MM-DD 형식 (연도가 없는 경우)
        match = re.match(r'(\d{1,2})-(\d{1,2})', cleaned_str)
        if match:
            current_year = datetime.now().year
            month, day = map(int, match.groups())
            return f"{current_year:04d}-{month:02d}-{day:02d}"
        
        return date_str # 매칭되는 형식이 없으면 원본 반환 (예외 처리)

    all_transactions = []
    sorted_predictions = sorted(predictions, key=lambda p: (p['box'][1], p.get('box', [0,0,0,0])[0]))

    # 날짜 블록 미리 추출
    date_blocks = [
        {'text': format_date(p['text']), 'box': p['box']}
        for p in sorted_predictions if p['label'] == 'DATE'
    ]

    current_transaction = {}
    last_known_date = None

    for item in sorted_predictions:
        label, text = item['label'], item['text']

        # 1. 날짜 정보 처리
        if label == 'DATE':
            last_known_date = format_date(text)
            if current_transaction and not current_transaction.get('date'):
                current_transaction['date'] = last_known_date

        # 2. 거래처 정보 처리 (y축 겹치는 날짜 보정)
        elif label == 'MERCHANT':
            if 'merchant' in current_transaction:
                current_transaction = {}
            current_transaction['merchant'] = text

            # --- y축 겹치는 DATE 블록이 있으면 last_known_date 보정 ---
            merchant_box = item['box']
            merchant_y1, merchant_y2 = merchant_box[1], merchant_box[3]
            merchant_xc = (merchant_box[0] + merchant_box[2]) / 2

            candidate_dates = []
            for db in date_blocks:
                date_box = db['box']
                date_y1, date_y2 = date_box[1], date_box[3]
                if (merchant_y1 <= date_y2 and merchant_y2 >= date_y1):
                    date_xc = (date_box[0] + date_box[2]) / 2
                    candidate_dates.append((abs(merchant_xc - date_xc), db['text']))
            if candidate_dates:
                candidate_dates.sort()
                last_known_date = candidate_dates[0][1]
                current_transaction['date'] = last_known_date

        # 3. 금액 정보 처리
        elif label in ['AMOUNT_IN', 'AMOUNT_OUT']:
            if 'amount' in current_transaction:
                current_transaction = {}
            current_transaction['amount'] = parse_amount(text, label)

        # 4. 기타 정보 처리
        elif label == 'MEMO':
            current_transaction['memo'] = current_transaction.get('memo', '') + ' ' + text.strip()
        elif label == 'BALANCE':
            current_transaction['balance'] = text.strip()

        # 5. 거래 완성 조건 확인
        if 'merchant' in current_transaction and 'amount' in current_transaction:
            if not current_transaction.get('date'):
                current_transaction['date'] = last_known_date
            all_transactions.append(current_transaction)
            current_transaction = {}

    if not all_transactions: return pd.DataFrame()
    final_df = pd.DataFrame(all_transactions)
    final_columns = ['date', 'merchant', 'amount', 'balance', 'memo']
    existing_columns = [col for col in final_columns if col in final_df.columns]
    return final_df[existing_columns]


# --- API를 위한 메인 함수들 ---

def initialize_predictor(model_path):
    """서버 시작 시 예측기 인스턴스를 초기화합니다."""
    global predictor
    if predictor is None:
        predictor = YOLOv8_OCR_Predictor(model_path=model_path)

def process_image_to_transactions(image_bytes, on_stage=None):
    """이미지 바이트를 입력받아 최종 거래 내역(JSON)을 반환합니다."""
    if predictor is None:
        raise Exception("OCR 예측기가 초기화되지 않았습니다.")

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    predictions = run_hybrid_prediction(image, predictor, on_stage=on_stage)
    df = structure_transactions_sequentially(predictions)

    if df.empty or 'merchant' not in df.columns:
        return []

    # BERT 타이밍
    # bert_start = time.perf_counter()

    # 1. 자동보정 및 룰베이스 DB 미리 fetch (mapping_utils 사용)
    ocr_corrections = {row['original_text']: row['corrected_text'] for row in mapping_utils.get_all_ocr_corrections()}
    rule_based_mappings = {row['merchant_name']: row['minor_category_uuid'] for row in mapping_utils.get_all_rule_based_mappings()}

    results = []
    for _, row in df.iterrows():
        transaction = row.to_dict()
        original_merchant = transaction.get('merchant', '')
        
        minor_uuid = None
        bert_output_id = None
        final_merchant = original_merchant

        # 2. 자동보정 DB 탐색
        corrected_text = ocr_corrections.get(original_merchant)
        
        if corrected_text:
            # 3-2. 자동보정에 있는 경우, 최종 거래처명을 보정된 텍스트로 설정
            final_merchant = corrected_text
            # 4-2. 치환한 텍스트가 룰베이스의 'merchant_name' 키로 존재하는지 탐색
            if corrected_text in rule_based_mappings:
                minor_uuid = rule_based_mappings[corrected_text]
            else:
                # 4-1. 룰베이스에 없으면, '원본' 거래처명으로 BERT 모델 실행
                bert_output_id = classification_service.classify_merchant_category(original_merchant)
                minor_uuid = database.get_minor_category_uuid_by_bert_output_id(bert_output_id)
        else:
            # 3-1. 자동보정에 없는 경우
            # 5. '원본' 거래처명이 룰베이스의 'merchant_name' 키로 존재하는지 탐색
            if original_merchant in rule_based_mappings:
                minor_uuid = rule_based_mappings[original_merchant]
            else:
                # 룰베이스에도 없으면, '원본' 거래처명으로 BERT 모델 실행
                bert_output_id = classification_service.classify_merchant_category(original_merchant)
                minor_uuid = database.get_minor_category_uuid_by_bert_output_id(bert_output_id)

        # 최종 결과 조합
        transaction['merchant'] = final_merchant
        transaction['original_merchant'] = original_merchant
        transaction['minor_category_uuid'] = minor_uuid
        transaction['bert_output_id'] = bert_output_id
        
        major_name, minor_name = database.get_category_names_by_minor_uuid(minor_uuid) if minor_uuid else (None, None)
        transaction['major_category'] = major_name
        transaction['minor_category'] = minor_name
        
        results.append(transaction)
        # bert_elapsed = int((time.perf_counter() - bert_start) * 1000)
        # print(f"[RESULT] bert_total_ms: {bert_elapsed}ms, rows: {len(results)}, current_transaction: {transaction}")
        
    if on_stage: on_stage("bert")
    return results