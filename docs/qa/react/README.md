# React 전환 검증 · 2026-10-11

이 문서는 전환 직후의 기록입니다. 이후 기존 배치 자체의 문제를 수정했으므로 현재 UI 기준은 [배치 재검토·수정 기록](../layout-polish-2026-10-11/README.md)입니다. 아래 HTML 일치 결과와 비교 스크립트는 현재 화면의 UX 합격 기준으로 사용하지 않습니다.

최종 UX 수정을 완료한 HTML과 동일한 시연 데이터를 사용해 React 전환을 검증했습니다. 기본 진입점은 `/`, 비교본은 `/html-reference.html`입니다. 이전 `ux-final/` 결과는 덮어쓰지 않았습니다.

## 결과

| 검사 | 결과 | 근거 |
| --- | --- | --- |
| Vite 프로덕션 빌드 / Oxlint | 통과 / 경고·오류 0 | `npm run build`, `npm run lint` |
| 도메인 및 React store | 32/32 통과 | `tests/domain.test.js`, `tests/router.test.js` |
| 활성177개 경로 × 390/1440px | 354회 통과, 오류·넘침·빈 링크·깨진 이미지·외부 요청 0 | [전체 경로](all-routes-report.json) |
| HTML vs React 문구·Figma 매핑·주요 요소 위치/크기 | 354/354 일치 (좌표 허용오차1px) | [배치 비교](comparison/layout-report.json) |
| 대표8개 화면 × 2개 너비 이미지 | 16/16 PNG 바이트까지 동일 | [이미지 비교](comparison/image-report.json) |
| 구매자 실제 클릭 | 기존41 + 추가15 = 56개 통과 | [UX 회귀](buyer/fix-verification.json), [React 인터랙션](buyer/react-interactions.json) |
| 인증 실제 클릭 및 일시 상태 | 브라우저18개 + 상태 모델4개 통과 | [인증 검증](auth/README.md) |
| 판매자 | 기존9개 흐름 그룹, StrictMode 7개 검사 통과, 55개 JSX 상태 렌더 확인 | [판매자 검증](seller/README.md) |
| 관리자·공통 | 9개 검사 그룹 통과, 320/390/768/1440px 메뉴·포커스·초안·처리 검증 | [관리자 검증](admin/after-report.json) |
| 역할 간 실제 클릭 통합 | 7개 흐름 그룹 통과 | [통합 검증](integration/integration-report.json) |

비교 대상은 제목·섹션·패널·버튼·입력 필드·원단 이미지 등 주요 랜드마크입니다. 전체 흐름의 `HTML`→`React` 표시 변경은 비교 시 같은 문구로 정규화했고, 하단 시연 도구 이름은 본문 비교 대상에서 제외했습니다. PNG 비교 대상은 로그인, 구매자 홈/부자재, 판매자 등록, 관리자 승인/거절/상품 목록입니다. 주요 캡처를 직접 열어 모바일·데스크톱 배치를 확인했습니다.

통합 과정은 판매자 승인 → 입력·사진 선택 → 원단 생성 → 사진 일부 실패·동일 원단 재시도 → 관리자 게시 승인 → 구매자 요청 → 판매자 수락·수령입니다. 응답 유실 시 재생성 차단, 문의→답변, 거절 보완→재신청, 삭제 후 이력 유지, 화면 목록 시나리오 격리도 검사했습니다.

## 재실행

먼저 `npm run build`와 포트4173의 `npm run preview -- --host 127.0.0.1 --port 4173`을 준비합니다. 브라우저는 격리된 테스트 컨텍스트를 사용하므로 사용자의 기존 시연 데이터를 초기화하지 않습니다.

```powershell
npm.cmd test
npm.cmd run lint
node ..\.maintenance\react-all-routes.mjs
node ..\.maintenance\react-layout-compare.mjs
node ..\.maintenance\react-integration-qa.mjs
node ..\.maintenance\react-admin-check.mjs
```

역할별 회귀 스크립트는 각 하위 디렉터리에 있습니다. 브라우저 스크립트는 이 PC에 설치된 Chrome과 Codex의 Playwright 경로를 사용하므로 다른 PC에서는 해당 경로를 조정해야 합니다.

실제 인증·서버 API·네트워크 사진 업로드·AI·지도는 연결되지 않았습니다. 이번 검증은 React 전환 후 로컬 시연과 UI 동작 보존을 대상으로 하며 실제 백엔드 통합 성공을 의미하지 않습니다.
