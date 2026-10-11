# 로그인·회원가입 API 연결 검증

> 이 문서는 최초 API 연결 단계의 기록입니다. 이후 같은 날 실제 백엔드와 PostgreSQL을 실행해 가입·로그인을 검증했습니다. 최신 결과는 [실서버 검증 기록](../local-backend-2026-10-11/README.md)을 참고하세요. 아래 503 응답과 미검증 설명은 최초 확인 시점의 상태입니다.

2026-10-11. 기존 React 화면 배치와 흐름을 유지하면서 실제 계정 API adapter를 추가했다. 백엔드 소스는 수정하지 않았고, 테스트 계정을 실제 서버에 생성하지 않았다.

## 계약 확인

API 명세 v0.3과 원격 main [`9e65521ac1d3cb5fded0e9f7f15f76783c3bf8ca`](https://github.com/goduckTeam/backEnd/tree/9e65521ac1d3cb5fded0e9f7f15f76783c3bf8ca)을 확인했다. 이전 로컬 감사본 `02f63bb`와 인증·users/me·stores/me 계약이 동일한 것을 비교했다.

| API | 이번 연결 내용 |
| --- | --- |
| POST /api/v1/auth/signup | BUYER/SELLER, email/password/nickname, phone_number=null, terms_agreed/privacy_agreed. 201 성공 후 로그인 화면으로 진행, 자동 로그인 없음 |
| POST /api/v1/auth/login | email/password만 전송. accessToken·expiresIn 수신 후 실제 서버 역할 확인 |
| GET /api/v1/users/me | Bearer 헤더. 로그인 직후 및 새로고침 복구. 실제 프로필 표시 |
| GET /api/v1/stores/me | 매장이 있는 SELLER만 조회. store_address/store_phone을 기존 화면 모델에 매핑 |

로그아웃·refresh API는 서버에 없어서 호출하지 않는다. 로그아웃은 탭의 토큰과 메모리 초안을 제거하며 발급된 JWT 자체를 서버에서 폐기하는 기능은 아니다. 만료/401은 재로그인, 복구의 네트워크 오류는 재연결로 구분한다.

## 자동 검사

- `npm test`: **83개 통과**. 기존 도메인·라우팅32, HTTP/인증44(하위 사례 포함), 인증 라우팅·StrictMode·민감 초안 정리7.
- `npm run lint`, `npm run build`: 통과.
- [브라우저 인증 계약 보고서](browser-contract-qa.json): 390×844, 1440×900, **118개 확인 항목 통과**, 실패·브라우저 예외0. Playwright에서 HTTP 요청을 가로채 계약에 맞춘 응답을 반환했다. 실제 서버/DB 통합 테스트는 아니다.
- [기존 시연 배치 보고서](demo-layout-report.json): 활성177경로 × 2크기 = **354렌더 통과**. 가로 넘침·깨진 자산·화면 예외0, 실제 API 요청0. 관리자 로그아웃은 스크롤 전후 뷰포트 하단24px 유지.

인증 검사에는 필수 동의와 DTO, 중복 가입409·필드 오류400·요청 제한429, 네트워크 오류 후 입력 보존/명시 재시도, 가입 응답 유실 시 로그인 확인, 서버 역할 우선 이동, 신규/기존 판매자 매장 분기, 새로고침 복구, 401 세션 제거, URL 역할 변경 차단, 미연동 저장 실패, 로그아웃, StrictMode 중복 제출 방지, 처리 중 이탈 후 늦은 로그인 응답 무시, 실제/시연 분리를 포함했다. 단위 검사는 이전 요청의 401이 새 세션을 지우지 못하는 경합도 포함한다. 마지막 읽기 리뷰에서 찾은 세션 만료 후 다른 가입 폼의 비밀번호 잔류를 수정했다. 계정 변경·세션 종료 시 live 초안을 모두 지우며, 시연 중 발생한 만료에도 적용된다. 시연 초안과 익명 인증 실패 후 재시도 입력은 유지한다.

스크린샷은 이 폴더에 보존했다. `signup-success-*`, `seller-store-loaded-*`, `buyer-profile-live-*` 등은 계약 응답 대역의 테스트용 계정이며 실제 사용자 기록이 아니다. 로그인·가입과 공통 레이아웃 CSS는 이번 작업에서 변경하지 않았다.

재현 스크립트:

- `frontend/tests/auth-api.test.js`
- `frontend/tests/auth-routing.test.js`
- `.maintenance/auth-live-browser-qa.mjs` (workspace 기준)
- `.maintenance/auth-demo-layout-qa.mjs` (workspace 기준)

## 실제 서버 확인과 남은 일

저장소 README·환경변수 예시에는 localhost:3000 개발 설정이 있다. 확인 시점에 배포 주소·GitHub deployment 기록은 없었고, 로컬3000 연결은 실패했다. Vite를 통한 `GET http://127.0.0.1:5173/api/v1/health`도 **503 NETWORK_ERROR**로 확인했다. 이 상태에서 로그인 성공을 가장하거나 mock으로 자동 대체하지 않는다.

실제 서버를 실행하거나 배포 주소를 받으면 [README의 설정](../../../README.md#계정-api-연결)에 맞추고 팀 테스트 계정으로 가입 → 로그인 → /users/me → 새로고침 → 로그아웃을 최종 검증해야 한다. 판매자는 매장 없음/있음 두 조건도 확인한다. 원단·예약·문의·프로필 수정·매장 저장은 아직 연결하지 않았으며 실제 모드에서 성공 처리되지 않는다. 기존 전체 동작은 시연 모드에 유지되어 있다.
