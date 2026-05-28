import requests
import os

# --- 설정 ---
# 테스트할 이미지 파일의 전체 경로를 지정하세요.
# 경로에 한글이 포함되어 있다면, 실행 시 오류가 발생할 수 있습니다.
IMAGE_PATH = 'C:/code/bank_statement/kookmin1.png' 
# 백엔드 서버의 OCR API 주소
API_URL = 'http://localhost:5000/api/ocr'

# --- 실행 ---
def test_ocr_api():
    if not os.path.exists(IMAGE_PATH):
        print(f"Error: Test image not found at '{IMAGE_PATH}'")
        return

    try:
        # 이미지 파일을 바이너리(binary) 모드로 열기
        with open(IMAGE_PATH, 'rb') as f:
            # 'files' 딕셔너리에 'image'라는 키로 파일을 담아 전송
            files = {'image': (os.path.basename(IMAGE_PATH), f, 'image/png')}
            
            print(f"Sending request to {API_URL} with image: {os.path.basename(IMAGE_PATH)}")
            
            # API에 POST 요청 보내기
            response = requests.post(API_URL, files=files)
            
            # 응답 상태 코드 확인
            response.raise_for_status()  # 200번대 코드가 아니면 에러 발생

            # 성공적인 응답 출력
            print("\n--- API Response (Success) ---")
            print(f"Status Code: {response.status_code}")
            # JSON 응답을 예쁘게 출력
            import json
            print(json.dumps(response.json(), indent=2, ensure_ascii=False))

    except requests.exceptions.RequestException as e:
        print(f"\n--- API Request Failed ---")
        print(f"Error: {e}")
        if e.response is not None:
            print(f"Status Code: {e.response.status_code}")
            print(f"Response Body: {e.response.text}")

if __name__ == '__main__':
    test_ocr_api()