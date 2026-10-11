# 섬유 루프 프론트엔드

2026-10-11 최종 UX 검토를 마친 HTML을 **React 19 + Vite**로 전환했습니다. 현재 기본 진입점은 React입니다. 활성177개 화면/상태·해시 URL과 시연 데이터를 유지하며, 후속 [배치 재검토](docs/qa/layout-polish-2026-10-11/README.md)에서 관리자 하단 여백·반응형 목록·역할별 고정 높이 등을 수정했습니다.

## 실행과 확인

검증 환경은 **Node.js 24.18.0 / npm 11.16.0**입니다. `.nvmrc`에 Node 버전을 기록했고, 의존성은 `package-lock.json` 기준으로 설치합니다. Windows에서는 아래 `npm.cmd` 명령을 사용하며 macOS/Linux에서는 `npm`으로 실행합니다.

```powershell
# package.json이 있는 frontend 폴더에서 실행
npm.cmd ci          # 다른 PC에서 처음 실행할 때
npm.cmd run dev
```

- [React 전체 흐름](http://127.0.0.1:5173/#/preview): 역할별 로그인·가입 또는 화면·상태 목록에서 시작합니다.
- [HTML 비교본](http://127.0.0.1:5173/html-reference.html#/preview): 전환 전 동작을 대조하는 별도 진입점입니다. 기존 소스를 보존했습니다.
- **구매자/판매자/관리자 시작**과 회원가입은 실제 계정 API를 호출합니다. **시연 시작**·화면 목록은 기존 예시 데이터를 사용합니다.
- 시연 화면 하단 **React 미리보기**에서 역할, 승인·등록 응답·사진 업로드·연결 오류 시나리오를 바꿀 수 있습니다. 실제 계정 모드에는 이 조작 도구가 없습니다.

```powershell
npm.cmd run build    # dist에 React와 HTML 비교본 생성
npm.cmd run preview  # 빌드 결과 확인
npm.cmd run lint     # Oxlint
npm.cmd test         # 도메인·라우팅·실제 인증 계약·취소/세션 회귀
```

ES 모듈을 사용하므로 파일 탐색기로 index.html을 직접 열지 않고 Vite로 실행합니다.

## 계정 API 연결

2026-10-11에 API 명세 v0.3과 인증 연동 당시 백엔드 main `9e65521ac1d3cb5fded0e9f7f15f76783c3bf8ca`를 대조하여 로그인·가입·내 정보·내 매장 조회 adapter를 추가했습니다. 화면 CSS와 기존 로그인 → 처리 → 완료/오류 흐름은 유지했습니다.

기본 요청은 `/api/v1`로 보내며, Vite 개발/preview 프록시가 `http://127.0.0.1:3000`으로 전달합니다. 같은 날 백엔드 `e177ea685a6588e39b58c75e04b513abd888785f`와 PostgreSQL을 로컬에서 실행하고, 실제 React 화면에서 구매자·판매자 가입과 로그인을 검증했습니다. 백엔드 테스트 **168개**, 실제 브라우저·DB 확인 **182개 항목**을 통과했습니다. 현재 PC의 재실행 방법과 검증 범위는 [로컬 백엔드 실행·검증 기록](docs/LOCAL_BACKEND_TEST.md)을 참고하세요.

다른 PC에서는 백엔드 저장소의 README에 따라 DB와 서버를 별도로 준비해야 합니다. 저장소에서 배포 API 주소는 확인되지 않았으며, GitHub 저장소 주소 자체는 API 서버 주소가 아닙니다.

주소가 달라지면 `.env.example`을 참고하여 `.env.local`에 설정하고 Vite를 다시 실행하세요.

```dotenv
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=http://127.0.0.1:3000
```

배포 시에는 `/api` 역방향 프록시를 별도로 구성하거나 `VITE_API_BASE_URL=https://실제_API_호스트/api/v1`로 **빌드**해야 합니다. 다른 출처의 API를 직접 호출하면 백엔드 `CORS_ORIGIN`에 실제 프론트 주소가 필요합니다. 기본값 `http://localhost:5173`과 `http://127.0.0.1:5173`는 서로 다른 출처입니다. JWT 비밀키·DB 비밀번호는 프론트 환경변수에 넣지 않습니다.

- `POST /auth/signup`: 실제 `terms_agreed`·`privacy_agreed` 필드로 전송. 가입 후 자동 로그인하지 않고 기존 완료 → 로그인 흐름을 유지합니다.
- `POST /auth/login`: email/password만 전송. 응답의 실제 역할로 이동합니다. 판매자는 `hasStore=false`면 매장 입력 화면으로 이동하며, 승인 상태와 별도로 취급합니다.
- `GET /users/me`: 로그인 직후와 새로고침 복구 시 Bearer 토큰으로 계정 확인. `GET /stores/me`는 매장이 있는 판매자만 조회합니다.
- 토큰은 서버 `expiresIn`에 따라 만료되며, 탭의 sessionStorage에 토큰·만료 시각·API 주소만 저장합니다. 비밀번호는 저장하지 않습니다. 401과 로그아웃은 토큰을 제거하며, 서버에 없는 refresh/logout API를 호출하지 않습니다. 현재 서버 계약의 로그아웃은 발급된 토큰의 서버 폐기가 아닌 클라이언트 제거입니다.
- 원단·예약·문의·프로필 수정·매장 저장 등은 이번 연결 범위 밖입니다. 실제 모드에는 예시 계정·재고를 넣지 않고, 미연동 저장은 성공 처리하지 않습니다. 기존 전체 흐름은 시연에서 계속 확인할 수 있습니다.

직접 확인: [실제 구매자 로그인](http://127.0.0.1:5173/#/auth/buyer/login?mode=live), [실제 판매자 가입](http://127.0.0.1:5173/#/auth/seller/signup?mode=live), [전체 화면·시연](http://127.0.0.1:5173/#/preview).

## 구조

```text
frontend/
├─ index.html                   # React 기본 진입점
├─ html-reference.html          # 보존한 HTML 비교본
├─ src/
│  ├─ main.jsx                  # createRoot, StrictMode, 기존 CSS 연결
│  ├─ App.jsx                   # 화면 선택, 오류 경계, 포커스/제목, 공통 레이아웃
│  ├─ react/
│  │  ├─ app/store.js           # 해시 라우팅, 서비스 snapshot 구독, 초안/시나리오 격리
│  │  ├─ components/
│  │  │  ├─ ui.jsx              # Button/Field/Badge/Notice/FabricImage 등
│  │  │  ├─ AppShell.jsx        # 구매자·판매자 헤더, 관리자 사이드바
│  │  │  └─ ReviewTools.jsx     # 개발 시연 도구
│  │  ├─ hooks/useAction.js     # 중복 실행 차단, 오류/진행 상태
│  │  ├─ lib/format.js          # 가격/길이 표시
│  │  ├─ services/              # 실제 계정 API, HTTP 응답/오류 및 토큰 처리
│  │  └─ pages/                # Auth/Buyer/Seller/Admin/Preview JSX
│  │     ├─ auth-state.js       # 인증 폼과 일시 요청 상태
│  │     ├─ buyer-model.js      # 구매자 화면 모델/경로/표시 도우미
│  │     └─ seller/            # 판매자 JSX, 컨텍스트, 폼 모델
│  └─ prototype/               # HTML 비교본 + 두 진입점이 공유하는 기존 자원
│     ├─ services/mock-api.js  # 업무 처리 경계; 향후 HTTP adapter 교체 위치
│     ├─ shared/domain.js      # 승인·예약·재고 규칙 단일 구현
│     ├─ data/                # seed, 격리된 시나리오, Figma 노드/경로 매핑
│     ├─ styles/              # 공통 토큰·CSS
│     └─ pages/               # 보존한 HTML 화면과 재사용하는 역할별 CSS
├─ public/assets/             # Figma SVG, Noto Sans KR/OFL
├─ tests/                     # 도메인 및 React store 회귀 테스트
└─ docs/                      # 구조·API 주의점·검증 기록
```

모든 서비스 화면을 실제 JSX와 React 이벤트/상태로 옮겼습니다. 기존 HTML render/bind 함수를 호출하거나 문자열 전체를 dangerouslySetInnerHTML로 넣지 않습니다. CSS·예시 데이터·업무 서비스는 기존 구현을 공유해 두 앱의 규칙이 갈라지지 않도록 했습니다. 기존 Vite 샘플 App.css/index.css/assets는 런타임에서 사용하지 않습니다.

## 유지한 흐름

| 역할 | 범위 |
| --- | --- |
| 공통 | 역할별 로그인·가입·약관·처리·오류·세션 만료, 첫 진입, 전체 흐름과 화면 목록 |
| 구매자 | 홈, 자투리/롤 목록·필터·상세, 픽업 요청·완료·충돌 복구, 예약·취소, 프로필, 문의·답변, 도안·제작 조건, 부자재 지도 예시·매장 상세 |
| 판매자 | 대시보드·달력, 승인/매장 등록 분기, 프로필·매장 수정, 직접/AI 예시 등록, 사진 확인·일부 실패·재시도, 원단 보완·삭제, 예약 수락·거절·취소·수령, 문의 답변 |
| 관리자 | 대시보드, 판매자 승인·거절, 상품 조회, 원단 선택·게시 승인·거절, 남은 대기 목록, 빈 상태·연결 오류·복구 |

API 정렬 때 보류한 8개 화면은 계속 제외합니다. [Figma 노드/경로 매핑](src/prototype/data/screen-coverage.json)에 구현 근거가 있습니다.

## 데이터와 API 경계

- 기존 localStorage 키 yangju-loop-html-v1를 그대로 사용해 HTML에서 제출한 시연 기록을 유지합니다. HTML 비교본과 React는 같은 저장소를 공유합니다.
- 작성 중 폼은 서비스별 메모리 Map에 보존하며, 성공·명시적 취소·로그아웃·초기화에 맞춰 정리합니다. 새로고침하면 메모리 초안은 사라집니다. 비밀번호는 영구 저장하지 않습니다.
- 화면 목록의 상태 예시는 별도 메모리 서비스에서 동작합니다. 기존 시연 데이터를 바꾸지 않고, 전체 흐름 화면으로 돌아오면 원래 데이터로 복귀합니다.
- 실제 인증은 `react/services/live-api.js`로 분리했습니다. 시연은 `prototype/services/mock-api.js`를 유지하며 실제 토큰이나 계정 정보를 넘기지 않습니다. `mode=live/demo` 선택은 탭에 보존되고, 숫자 scenario와 화면 목록은 시연으로 열립니다.
- 예약 이력 정보(B1), 생성 응답 유실·사진 복구(B2), 예약 연락처(B3), 부가 기능 범위(B4)는 [후속 API 협의 사항](docs/API_FOLLOWUPS.md)을 확인합니다. 아직 확정하지 않은 요청안이며, 실제 업무 기능은 후속 DTO/enum 변환과 서버 통합 검증이 필요합니다.

## 검증과 다음 작업

계정 API는 [HTTP 계약 검증 기록](docs/qa/auth-api-2026-10-11/README.md)에 이어 [실제 로컬 서버·DB 검증](docs/qa/local-backend-2026-10-11/README.md)까지 완료했습니다. 실제 검증에서는 네트워크 응답을 대체하지 않았습니다. 배포 서버와 업무 API 연결은 후속 범위입니다.

이 저장소에서 `npm test`, `npm run lint`, `npm run build`를 재현할 수 있습니다. 브라우저 QA 결과와 캡처는 검증 당시의 기록입니다. 문서에 나오는 워크스페이스 `.maintenance` 스크립트와 로컬 DB 실행 도구는 이 프론트 저장소에 포함되지 않으며, 팀 공용 브라우저 테스트 명령으로 옮기는 작업은 남아 있습니다.

전환 직후 빌드·lint·단위 테스트32개와 역할별 회귀, HTML 비교를 통과했습니다. 이후 관리자 스크린샷을 계기로 전체 화면 배치를 다시 검토했습니다. 최신 화면은177개 경로·354회 렌더 확인 및 관리자840개 스크롤 위치 검사를 통과했습니다. 최신 기준은 [배치 수정 기록](docs/qa/layout-polish-2026-10-11/README.md)이며, 이전 HTML과의 동일성 검사는 전환 당시의 기록입니다.

[React 검증 기록](docs/qa/react/README.md), [구조와 후속 API 작업](docs/REACT_MIGRATION.md)을 참고하세요. 이후 화면 수정은 src/react에서 이어가며, 백엔드 계약이 정리된 기능부터 HTTP adapter를 연결합니다. [HTML 최종 UX 기준](docs/qa/ux-final/README.md)과 [이전 설치 기록](docs/SETUP_HISTORY.md)은 보존했습니다.
