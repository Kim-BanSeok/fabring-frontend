# 판매자 React 전환 검증

`SellerPage.jsx`는 React state/ref/effect와 JSX 이벤트로 폼·오류·처리 중·사진 업로드·예약·문의 전이를 처리합니다. `seller/SellerViews.jsx`는 55개 Figma 화면 상태의 JSX이며, 공통 UI를 재사용합니다. `sellerModel.js`와 `SellerRuntime.js`에는 초안/검증 함수와 context를 분리했습니다. 기존 HTML 파일은 보존했습니다.

- 55/55 상태 서버 렌더: 오류·React 경고 0 (`ssr-results.json`).
- 실제 React dev/StrictMode 클릭 회귀 9개 그룹 통과 (`regression-results.json`). 입력 왕복·빈 값·롤/자투리 전환, 사진 누락 안내, 거절 보완 재편집, 요청→수락→수령, AI 예시→사진→부분 실패→재시도, UNKNOWN 재전송 차단, 문의 답변, 매장 저장 후 승인 대기를 검증했습니다.
- 320/390/1440px 대표 15개 화면의 가로 넘침 0. 390px 폼 높이 2165px로 HTML 최종본과 동일합니다.
- StrictMode 전용 7개 검사 통과 (`strictmode-results.json`): 자동 사진 업로드 1회, AI 결과 이동 1회, 각 타이머 unmount cleanup, 등록 지연 중 unmount 시 생성 0회, 연속 클릭에도 생성/업로드 각 1회, UNKNOWN 생성 응답 이후 재전송 없음.
- 판매자 source와 QA fixture oxlint 경고 0.

`strictmode-harness.jsx`는 테스트용 독립 마운트이며 앱 진입점과 배포 번들에서 사용하지 않습니다. 시연 API에 호출 횟수 계수용 Proxy를 적용해 StrictMode 중복 실행을 검사합니다. 실 API/AI 호출을 추가하지 않았습니다.

재실행: `node frontend/docs/qa/react/seller/regression.cjs`, `node frontend/docs/qa/react/seller/strictmode.cjs` (dev 서버 5173 필요).
