# MF 사진 판독 연결

현재 Google 시험 계정은 youngmooff@gmail.com 하나입니다. 키는 Secret Manager의 OPENAI_API_KEY에서 서버만 읽습니다. 사진이나 키를 로그 또는 저장소에 기록하지 않습니다. OpenAI Responses의 store=false를 사용합니다.

## 배포 전

1. Firebase Authentication에서 Google 로그인 공급자를 활성화하고 지원 이메일을 현재 계정으로 지정합니다.
2. Authentication 설정의 승인 도메인에 kimhyunwoo0206.github.io를 추가합니다.
3. Firestore 기본 데이터베이스를 asia-southeast1, Native 모드로 생성합니다. 이 저장소는 호출 한도 카운터 전용입니다. 기존 Firestore가 존재하면 보안 규칙을 덮어쓰지 말고 검토하세요. 기존 발주는 Realtime Database에 유지됩니다.
4. OPENAI_API_KEY의 최신 버전이 사용 설정됨인지 확인합니다. 값을 출력하지 않습니다.

## Cloud Shell 배포

새 디렉터리로 이 브랜치를 가져온 뒤 실행합니다.

```sh
cd functions
npm install
node validation.test.js
cd ..
firebase deploy --project coupang-mf --only firestore:rules,functions:mf-ai
```

브랜치 변경을 main에 병합하면 GitHub Pages에서 staff.html을 제공합니다. admin.html은 확인한 결과를 sessionStorage로 받아 채우며 자동 저장하지 않습니다. 기존 admin.html의 다른 입력 경로는 유지됩니다.

## 검증

- 로그아웃/다른 Google 계정의 AI 호출은 거절되어야 합니다.
- 첫 시험은 실제 피벗 사진의 원본 총합과 22 SKU 기준표를 대조합니다.
- 미등록·불명확 품목, 잘린 사진, 총합 불일치는 넘기기를 막아야 합니다.
- 합계 입력 및 원본 대조 체크가 있어야 발주 입력 화면으로 이동합니다.
- 넘기기만으로 Realtime Database 발주가 변경되어서는 안 됩니다.
- 로그인된 시험 계정에만 서울 날짜 기준 하루 최대 30회(실패 시도 포함)를 허용합니다. Firestore 클라이언트 쓰기는 금지합니다. 서버 최대 인스턴스 1, 최소 0입니다. 30회는 비용 금액 한도가 아닙니다.
- 직원 계정 추가는 서버 허용 계정과 화면 표시를 함께 변경한 뒤 배포합니다.

시험 사진 검증 전에는 정확도나 월 비용을 확정하지 않습니다.
