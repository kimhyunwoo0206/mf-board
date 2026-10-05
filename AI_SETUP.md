# MF 입력: 엑셀 붙여넣기와 GPT 사진 판독

## 권장 입력 — 쿠팡 노트북 Chrome에서 엑셀 복사

1. admin.html에서 발주 날짜와 입력 차수를 선택합니다.
2. 엑셀 피벗의 상품명(A열)과 수량(B열)을 함께 선택합니다. 선택 차수의 머리글·소계와 모든 상품 행을 포함하세요. 전체 날짜 피벗을 복사해도 됩니다.
3. Ctrl+C → 엑셀 피벗 붙여넣기 칸에서 Ctrl+V → 선택한 차수 가져오기.
4. 선택 차수만 추출하고 원본 소계와 상품 합을 비교합니다. 앞/뒷차수와 하루 총합은 등록 수량에서 제외합니다.
5. 저장할 품목과 수량을 확인하고 저장합니다. 붙여넣기 변환은 RTDB에 쓰지 않습니다. 기본 저장 방식은 replace입니다.

상품 행만 복사하면 원본 소계를 알 수 없으므로 엑셀의 선택 차수 소계를 직접 입력해야 합니다. 날짜·차수·붙여넣기 내용을 바꾸면 변환 결과를 지우고 다시 가져옵니다. 숫자 누락, 소계 불일치, 다른 날짜, 대상 차수 접힘은 변환 오류로 표시합니다. 기준표에 없는 품목은 신규 SKU 확인 대기로 보류하고 기존 품목만 등록합니다.

이 기능은 브라우저에서 결정적인 TSV 파싱과 27종 기준표 매칭을 수행합니다. 사진 촬영·AI 호출·API 비용이 없습니다. 기존 품목명 : 건수 직접 입력, 취소 입력, URL 자동등록은 유지됩니다. 엑셀 전체 차수 내용을 반복 입력할 때는 replace를 사용합니다. merge는 추가/취소 입력에만 사용하며 전체 피벗을 반복 merge하면 중복됩니다.

## GPT 사진 판독 복귀

모델은 기존 gpt-5.4, OpenAI Responses API입니다. Secret Manager OPENAI_API_KEY를 서버에서만 읽으며 키를 GitHub·브라우저·로그로 보내지 않습니다. Gemini 호출과 GEMINI_API_KEY 함수 바인딩은 제거했습니다. 기존 Secret은 삭제하지 않습니다.

staff.html이 사진과 선택한 date/slot을 전달합니다. 서버는 유효한 날짜와 1~4차를 검사한 뒤 사진을 detail=original, store=false, strict JSON Schema로 보냅니다. 원본 사진은 지원 형식·5MB 이하일 때 그대로 보냅니다. 큰 카메라 사진은 기존 3000px JPEG 변환을 유지합니다.

응답은 원본 상품행마다 실제 slot, 차수별 slotTotals, 참고용 dailyTotal, 실제 detectedDate, 대상 차수 targetVisible/targetComplete를 구분합니다. 서버는 선택 차수 행만 먼저 필터링한 후 합산합니다. 소계는 해당 차수의 실제 머리글/소계 숫자만 사용하며 하루 총합으로 대신하지 않습니다. 선택 차수의 누락·불명확 행·잘림·날짜 불일치·소계 누락은 등록을 차단합니다. 사진 위에 일부 잘린 앞차수 상품이 있어도 명확한 선택 차수 머리글 아래의 완전한 그룹이 대상입니다.

검산 실패 시 이전 응답 숫자 없이 한 번 독립 재분석합니다. 계속 실패하면 확인 필요입니다. 각 실제 API 요청은 기존 한국시간 날짜별 Firestore mf_ai_usage 한도(프로젝트 전체 30회)를 사용합니다. 요청별 90초, 함수 300초입니다. 지원하지 않는 original detail 오류만 high로 재시도하며 그 요청도 한도에 포함합니다.

검산 후에만 기존 27종 기준표를 정확 매칭합니다. 미등록 바코드는 이름으로 대신 매칭하지 않습니다. 신규 SKU 수량도 검산에 포함하지만 현장 수량은 기존 품목만 저장하고 pendingSkuRows에 보류합니다.

사진 판독 중 날짜/차수 변경을 막고 변경 후에는 판독 결과를 폐기합니다. 사진의 날짜가 보이지 않을 때는 직원이 선택한 날짜를 사용하므로 날짜를 직접 확인해야 합니다. AI는 숫자와 품목을 틀릴 수 있어 직원의 원본 대조 확인은 유지합니다.

## 배포

Cloud Shell에서 저장되지 않은 변경을 먼저 확인합니다. functions/package-lock.json은 npm install이 만든 로컬 파일일 수 있으므로 임의 삭제하지 않습니다.

~~~sh
cd ~/mf-board
git status --short
git pull --ff-only origin main
cd functions
npm install
npm test
cd ..
firebase deploy --project coupang-mf --only functions:mf-ai
~~~

기존 OPENAI_API_KEY가 활성 상태면 다시 입력하지 않습니다. 키가 없거나 만료된 경우 운영자가 아래 명령의 숨김 입력란에 직접 새 키를 입력한 뒤 재배포합니다.

~~~sh
firebase functions:secrets:set OPENAI_API_KEY --project coupang-mf
~~~

Pages는 main의 정적 파일을 게시합니다. 업데이트 후 Chrome에서 Ctrl+Shift+R로 새로고침합니다. 오래된 staff.html은 date/slot을 전달하지 않아 서버가 invalid-argument로 거부하고 새로고침을 안내합니다.

## 권한과 검증

기존 승인 계정 youngmooff@gmail.com, withfresh11@gmail.com 및 인증 조건을 유지합니다. 신규 직원 이메일은 미정이며 아직 추가하지 않았습니다. 이메일 확정 후 functions/index.js와 staff.html을 함께 변경하고 서버를 재배포합니다. admin의 기존 RTDB 권한 구조는 직원 OCR 승인 목록과 별개입니다.

시험은 선택 차수 분리(1차 95/2차 20/하루 115), 누락 행, 잘못된 날짜, 소계 누락, 신규 SKU, API/쿼터 실패, 독립 재분석, 실제 admin 변환과 변경 시 결과 폐기를 포함합니다. 자동시험의 사진 fixture는 사람이 전사한 자료이고 실시간 AI 판독을 증명하지 않습니다. 실제 판독과 UI 확인은 저장 버튼을 누르지 않고 시험합니다.

공식 OpenAI 이미지 입력 문서: https://developers.openai.com/api/docs/guides/images-vision
