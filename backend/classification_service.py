import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import BertTokenizerFast, BertModel
import pickle
import os
from pathlib import Path

# --- 전역 변수 ---
# 서버 시작 시 초기화될 분류기 인스턴스
classifier = None
device = None


def get_preferred_torch_device():
    """CUDA가 있으면 CUDA, 그다음 MPS, 마지막에 CPU를 사용합니다."""
    if torch.cuda.is_available():
        return torch.device('cuda')
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def get_model_path(filename):
    """개발/패키징 환경에서 공통 models 폴더의 파일 경로를 반환합니다."""
    is_packaged = os.getenv('IS_PACKAGED', 'false') == 'true'
    resource_path = os.getenv('RESOURCE_PATH', os.path.dirname(os.path.abspath(__file__)))

    if is_packaged:
        models_dir = Path(resource_path) / 'models'
    else:
        models_dir = Path(__file__).resolve().parents[1] / 'models'

    model_path = models_dir / filename
    print(f"Model path for '{filename}': {model_path}")
    return str(model_path)

# --- 노트북에서 가져온 모델 아키텍처 ---
class BertCNNModel(nn.Module):
    def __init__(self, bert_pretrained, num_classes=247, dropout_rate=0.5, kernel_sizes=[2,3,4], num_filters=128):
        super().__init__()
        self.bert = BertModel.from_pretrained(bert_pretrained)
        self.convs = nn.ModuleList([
            nn.Sequential(
                nn.Conv1d(in_channels=768, out_channels=num_filters, kernel_size=k),
                nn.BatchNorm1d(num_filters),
                nn.ReLU()
            )
            for k in kernel_sizes
        ])
        self.dropout = nn.Dropout(dropout_rate)
        self.fc = nn.Linear(num_filters * len(kernel_sizes), num_classes)

    def forward(self, input_ids, attention_mask, token_type_ids):
        outputs = self.bert(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids)
        x = outputs['last_hidden_state'].transpose(1, 2)
        conv_outs = [conv(x) for conv in self.convs]
        pooled = [F.max_pool1d(c, c.size(2)).squeeze(2) for c in conv_outs]
        cat = torch.cat(pooled, dim=1)
        cat = self.dropout(cat)
        logits = self.fc(cat)
        return logits

# --- 예측을 위한 래퍼 클래스 ---
class Predictor:
    def __init__(self, model, tokenizer, labels: dict, device):
        self.model = model
        self.tokenizer = tokenizer
        self.labels = labels
        self.device = device
        
    def predict(self, sentence: str) -> int:
        """한 개의 문장을 입력받아 예측된 카테고리명을 반환합니다."""
        if not isinstance(sentence, str) or not sentence.strip():
            return -1 # 분류 불가에 대해 -1 반환
            
        tokens = self.tokenizer(
            sentence,
            return_tensors='pt',
            truncation=True,
            padding='max_length',
            max_length=60,
            add_special_tokens=True
        )
        
        # 모든 텐서를 모델과 동일한 디바이스로 이동
        tokens = {k: v.to(self.device) for k, v in tokens.items()}
        
        with torch.no_grad():
            prediction = self.model(**tokens)
            
        prediction = F.softmax(prediction, dim=1)
        output_index = prediction.argmax(dim=1).item()
        
        # pkl 파일의 key가 문자열이므로 str()로 변환
        # result = self.labels.get(str(output_index), "분류 실패")
        # return result
        return output_index # int id 직접 반환

# --- 서비스 초기화 및 예측 함수 ---
def initialize_classifier():
    """서버 시작 시 모델, 토크나이저, 라벨을 로드하여 분류기를 초기화합니다."""
    global classifier, device
    
    MODEL_WEIGHTS_PATH = get_model_path('bert-kor-cnn4_remap_250624_2320.pth')
    LABEL_MAP_PATH = get_model_path('category_mapping_remapped.pkl')
    TOKENIZER_NAME = 'kykim/bert-kor-base'

    if not os.path.exists(MODEL_WEIGHTS_PATH) or not os.path.exists(LABEL_MAP_PATH):
        raise FileNotFoundError("업종 분류 모델 또는 라벨 파일을 찾을 수 없습니다. 경로를 확인하세요.")

    device = get_preferred_torch_device()
    
    # 1. 라벨 맵 로드
    with open(LABEL_MAP_PATH, 'rb') as f:
        labels_from_file = pickle.load(f)
    # {0: '카테고리1'} 형태를 { '0': '카테고리1' } 로 변환 (노트북 코드와 동일하게)
    labels = {str(v): k for k, v in labels_from_file.items()}
    num_classes = len(labels)

    # 2. 토크나이저 로드
    tokenizer = BertTokenizerFast.from_pretrained(TOKENIZER_NAME)

    # 3. 모델 구조 생성 및 가중치 로드
    model = BertCNNModel(bert_pretrained=TOKENIZER_NAME, num_classes=num_classes)
    model.load_state_dict(torch.load(MODEL_WEIGHTS_PATH, map_location=device))
    model.to(device)
    model.eval() # 예측 모드로 설정

    # 4. 전역 분류기 인스턴스 생성
    classifier = Predictor(model, tokenizer, labels, device)

def classify_merchant_category(merchant_name: str) -> int:
    """거래처명을 입력받아 bert_output_id(int)를 반환"""
    if classifier is None:
        raise Exception("업종 분류기가 초기화되지 않았습니다.")
    return classifier.predict(merchant_name)  # int id 반환