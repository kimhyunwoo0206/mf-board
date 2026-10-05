# MF 사진 판독 Gemini 3.1 Pro 연결

## 현재 구현

사진 판독은 Gemini API generateContent를 사용하며 모델 ID는 **gemini-3.1-pro-preview**입니다. Google 공식 문서에 gemini-3.1-pro라는 ID는 확인되지 않아, 요청한 Gemini 3.1 Pro의 공식 preview ID를 적용했습니다. 다른 모델로 자동 대체하지 않습니다.

Gemini 키는 Secret Manager의 GEMINI_API_KEY를 서버에서만 읽고 x-goog-api-key 헤더에 보냅니다. 키를 URL, 프런트엔드, GitHub 또는 로그에 넣지 않습니다. Firebase 웹 설정 apiKey와 Gemini 비밀키는 별개입니다. 이전 OpenAI API 호출과 OPENAI_API_KEY 바인딩은 전환 코드에서 제거됩니다.

## 판독 흐름

1. staff.html에서 승인 Google 계정으로 로그인하고 JPG/PNG/WEBP 사진 한 장(5MB 이하)을 선택합니다.
2. extractMfOrder callable에 전달한 사진을 Gemini inlineData로 전송합니다. 원본 상품명과 같은 Excel 행의 수량, 대상 표 하단 총합을 전사합니다. 기준표는 AI에 보내지 않습니다.
3. generationConfig.responseFormat.text에 JSON Schema와 application/json을 지정합니다. barcode/quantity/total은 읽을 수 없으면 null이며 반드시 응답 필드로 포함합니다.
4. 서버는 원본행 합계와 사진 총합, tableComplete, 불명확 여부를 검사합니다. 검산 실패면 원본부터 한 번 독립 재분석합니다. 두 번 실패하면 기존대로 등록을 차단합니다.
5. 검산 통과 후 27종 기준표와 정확 매칭합니다. 미등록 바코드는 이름으로 대신 매칭하지 않습니다. 신규 행도 원본합에 포함하고 pendingSkuRows에 보류하되 현장 수량에는 포함하지 않습니다.
6. 직원은 전체 상품명/수량과 사진 총합을 다시 확인한 뒤 admin.html로 전달해 수동 저장합니다. API는 RTDB에 발주를 직접 쓰지 않습니다.

각 실제 Gemini API 요청 전에 Firestore의 한국시간 날짜별 사용횟수를 예약합니다. 프로젝트 전체 하루 30회이며 재분석/실패도 포함합니다. 기존 한도 카운터를 초기화하지 않습니다. 한 upstream 호출 timeout은 90초이며 최대 2회입니다. Gemini 응답이 차단·잘림·빈 결과·비정상 JSON이면 저장 결과로 취급하지 않습니다. 상위 Firebase 함수 timeout은 기존 300초입니다.

Gemini에는 OpenAI의 store=false와 동일한 옵션을 임의로 보내지 않습니다. 키/사진을 코드에서 로그로 기록하지 않는 정책은 유지하지만 제공사의 데이터 처리 정책과 AI Studio의 계정 설정은 운영자가 별도로 확인해야 합니다.

## Firebase 배포

GitHub 파일 업데이트만으로 Firebase 함수가 변경되지 않습니다. 아래 명령은 Firebase 프로젝트 coupang-mf에 배포할 권한이 있는 계정으로 로그인한 Cloud Shell에서 실행합니다. Node.js 22와 Firebase CLI가 필요합니다.

이미 mf-board 폴더가 있으면 저장되지 않은 로컬 변경을 먼저 확인하고 아래 업데이트를 합니다:

~~~sh
cd mf-board
git status --short
git pull --ff-only origin main
~~~

처음 받는 환경이라면 위 명령 대신:

~~~sh
git clone https://github.com/kimhyunwoo0206/mf-board.git
cd mf-board
~~~

그다음 저장소 최상위에서:

~~~sh
firebase login
firebase functions:secrets:set GEMINI_API_KEY --project coupang-mf
cd functions
npm install
npm test
cd ..
firebase deploy --project coupang-mf --only functions:mf-ai
~~~

GEMINI_API_KEY 입력을 요청하면 Google AI Studio에서 발급한 키를 그 입력란에만 붙여 넣습니다. 채팅이나 저장소 파일로 전달하지 않습니다. 키의 Gemini 3.1 Pro 모델 접근 및 API 과금/한도를 확인합니다. npm test 실패 시 배포를 진행하지 않습니다.

functions:mf-ai는 firebase.json에 설정된 codebase만 배포합니다. 기존 Firestore 규칙과 RTDB 발주를 이 명령에서 배포/수정하지 않습니다. 프런트는 GitHub Pages에서 main 변경으로 갱신됩니다. 직원 안내는 서버 배포 전후 모두 맞도록 외부 AI 판독 서비스라는 표현을 사용합니다.

## 배포 후 실제 사진 확인

승인된 기존 계정으로 staff.html에 로그인합니다. 2026-10-03 1차 원본 사진으로 14행, 원본합 82, 사진 총합 82, 등록합 82와 모든 행의 수량을 대조합니다. 검증 단계에서는 저장 버튼을 누르지 않습니다. 실제 사진 시험도 일일 30회 한도에 포함됩니다.

권한 없는 계정의 판독 거부, 두 번 불일치 시 전송 차단, 신규 SKU 보류, 5MB 초과 거부도 확인합니다. 로컬 22개 테스트는 mock/사람 전사 fixture 시험이며 실제 Gemini 호출 성공을 증명하지 않습니다.

## 신규 직원 추가 예정

신규 직원 이메일은 추후 사용자가 제공하기로 했으므로 아직 추가하지 않았습니다. 현재 승인 계정은 youngmooff@gmail.com, withfresh11@gmail.com입니다.

이메일을 받은 뒤 functions/index.js의 서버 allowlist와 staff.html의 approved allowlist에 같은 정확한 주소를 추가합니다. 양쪽 모두 이메일 인증 조건을 유지합니다. 서버를 재배포하고 Pages 업데이트 후 신규 계정으로 로그인/판독/확인/전송을 시험합니다. 프런트만 추가하면 서버에서 거부되므로 두 파일을 함께 업데이트합니다. admin의 기존 수동 저장 권한 구조를 직원 allowlist가 대신 보호하는 것은 아닙니다.

## 복구

전환 실패 시 기존 27종 기준표나 발주 데이터를 고치지 말고 함수 코드만 이전 커밋 ed1c8435024a588f3d2155358d33e366462ae323의 functions/extraction.js와 functions/index.js로 복구한 후 functions:mf-ai를 재배포합니다. 복구 전에 기존 OPENAI_API_KEY가 유효한지 확인합니다. 기존 Secret을 이번 변경에서 삭제하지 않습니다.

## 공식 근거

- Gemini 3.1 Pro 모델 ID: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
- generateContent 구조화 출력: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- REST API: https://ai.google.dev/api/generate-content
- Firebase Secret 설정: https://firebase.google.com/docs/functions/config-env
