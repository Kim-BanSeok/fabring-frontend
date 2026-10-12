# React 전환 기록 및 개발 기준

2026-10-11: 최종 UX 검토를 마친 HTML의 177개 활성 화면/상태를 React로 전환했습니다. index.html → src/main.jsx → App.jsx가 기본 실행 경로이며, html-reference.html에서 이전 구현을 비교할 수 있습니다.

후속 [배치 수정](qa/layout-polish-2026-10-11/README.md)을 현재 UI 기준으로 사용합니다. 공통 프레임은 `react/app/layout.css`에서 관리하며 미리보기 도구도 AppShell 내부에 포함합니다. 과거 HTML과 같은 모양이라는 것만으로 UX 검증을 통과시키지 않습니다.

## 컴포넌트와 상태 경계

- components/ui.jsx: Button, Badge, Notice, PageHeading, EmptyState, FabricImage, Field, SelectField. 표준 HTML/React 이벤트·접근성 props를 전달합니다. 문구·색·간격은 기존 CSS를 사용합니다.
- components/AppShell.jsx: 역할별 메뉴와 main landmark. 페이지는 본문만 렌더링합니다.
- components/ReviewTools.jsx: 역할/데모 상태 변경과 초기화. 기존처럼 문서 하단에 배치합니다.
- app/store.js: useSyncExternalStore가 구독하는 snapshot, 해시 경로, 서비스 객체, 역할, 메모리 초안, 결과 알림을 관리합니다. URL은 기존처럼 #/buyer/... 형태입니다. 새 라우터 패키지 없이 기존 링크와 뒤로가기를 유지했습니다.
- pages: 실제 JSX 컴포넌트와 명시적 onClick/onChange/onSubmit. HTML render/bind 또는 page-wide HTML 삽입은 사용하지 않습니다.
- 기존 prototype/services/mock-api.js, shared/domain.js, data 및 CSS를 공유합니다. 업무 규칙은 서비스와 domain의 단일 구현을 사용하며, HTML 비교본 때문에 기존 경로도 보존합니다.

페이지 계약은 default export Page({ctx})입니다.

```js
ctx = {
  path, query, role, state, api,
  drafts,        // 현재 API 객체에만 속한 메모리 Map
  scenario,      // 화면 목록 예시의 Figma node id 또는 빈 문자열
  navigate,      // navigate('/buyer/home', {replace: true})
  refresh,       // 최신 서비스 snapshot을 React에 반영
  notify,        // 결과 경로에 귀속된 5초 알림
  logout,
}
```

경로/검색 조건/시나리오 세션이 달라지면 해당 페이지를 다시 마운트합니다. 같은 경로에서 refresh하면 최신 snapshot만 전달하므로 입력 상태가 유지됩니다. 경로 왕복에 필요한 폼은 drafts를 사용하며 성공·취소·로그아웃·초기화 시 해당 키를 정리합니다. 시나리오가 바뀌면 API와 초안도 분리되고 /preview 진입 시 저장된 시연으로 복귀합니다.

비동기 동작은 중복 클릭을 ref로 막고, 이탈한 화면의 타이머·구독을 정리합니다. 인증 요청은 제출 이벤트에서 시작하고 처리 화면 effect는 결과를 구독합니다. StrictMode의 setup/cleanup 재실행이 실제 요청을 두 번 만들지 않도록 했습니다. 로그인/가입 처리 결과는 history replace를 사용합니다.

## 화면 변경 원칙

1. JSX에서 화면을 수정하고 공통 UI/기존 CSS를 우선 재사용합니다. 페이지·상태별로 파일을 복제하지 않고 데이터와 props로 변형합니다.
2. 화면/상태 경로를 추가하거나 바꾸면 data/screen-coverage.json 매핑도 갱신합니다. 보류8개는 계약 합의 전까지 복원하지 않습니다.
3. 구매자 필터 복귀, 도안→부자재 맥락, 선택 카드 포커스, 재고 부족 복구, 판매자 입력·관리자 거절 사유 보존을 유지합니다.
4. 모바일 모든 메뉴와 로그아웃을 유지하고 시연 도구를 입력칸 위에 겹치지 않습니다.
5. 변경 범위에 맞춰 도메인/라우팅 테스트와 실제 클릭 검증을 실행합니다. 배치 변경은 390/1440px로 확인합니다.

## 계정·원단 조회 API 연결 후 현재 경계

2026-10-11 후속 작업에서 `services/http-client.js`와 `services/live-api.js`를 추가했습니다. [README의 실행 설정](../README.md#계정-api-연결)을 기준으로 실행합니다. main `9e65521`의 가입·로그인·내 정보·내 매장 조회 계약에 맞춘 뒤, 백엔드 `e177ea6`와 실제 PostgreSQL을 실행해 구매자·판매자 가입·로그인·새로고침 인증 복구·로그아웃을 확인했습니다. [실제 서버 검증 기록](qa/local-backend-2026-10-11/README.md)에서 182개 항목과 검증 한계를 확인할 수 있습니다. 배포 API 주소는 아직 확인되지 않았습니다.

`main.jsx`가 liveApi를 주입합니다. 실제 모드에서는 URL로 계정 역할을 변경하지 않으며, 인증 전·복구 중·만료·연결 실패에는 업무 화면 대신 로그인/복구 안내를 보여줍니다. 복구의 네트워크 실패와 401을 구분합니다. 서버 역할과 다른 업무 URL은 해당 계정 홈으로 복귀합니다. 화면 목록과 명시적 `mode=demo`는 별도 mock 서비스로 열려 실제 권한이나 실제 저장에 영향을 주지 않습니다.

회원가입 요청 필드는 `terms_agreed/privacy_agreed`; 로그인에는 요청 role을 보내지 않습니다. 서버에서 받은 role/hasStore로 이동을 결정합니다. 가입 결과의 이메일은 응답에 없으므로 입력값을 이용해 다음 로그인 입력칸만 채웁니다. 로그인 결과와 `/users/me` 확인 후, 아직 활성인 처리 화면이 결과를 소비할 때만 토큰을 저장합니다. 처리 화면 이탈은 AbortController로 요청을 취소하며 StrictMode effect 재실행으로 재전송하지 않습니다. 서버에 도착한 가입의 취소·응답 유실은 롤백을 뜻하지 않으므로 재가입보다 로그인을 통한 확인을 안내합니다.

실제 토큰은 탭 sessionStorage에 별도로 저장합니다. 시연 데이터 localStorage에는 실제 사용자·토큰·비밀번호를 넣지 않습니다. 기존 ctx에 `mode`, `auth`, `retrySession`을 추가했습니다. live 서비스의 상태에는 `/users/me`·`/stores/me` 데이터만 들어가고, 업무 배열은 비어 있습니다. 아직 연결하지 않은 저장 메서드는 `NOT_CONNECTED` 오류를 반환합니다.

2026-10-12에는 백엔드 `7dc28c7` 기준 원단 목록10·상세11을 추가했습니다. `services/fabric-contract.js`가 필터 코드와 서버 DTO를 화면 모델로 변환하고 `hooks/useFabricResource.js`가 화면별 로딩·오류·재시도·취소를 관리합니다. 조회 결과는 전역 live snapshot에 넣지 않고 현재 구매자 화면에만 전달하여 다른 역할과 시연 데이터에 섞이지 않게 했습니다. 홈 최근 자투리·목록·상세와 원단이 필요한 후속 경로에서 재조회합니다. 이어진 예약 연동 작업에서 구매자 요청·조회·취소까지 연결했으며 문의 쓰기는 계속 `NOT_CONNECTED`입니다. [원단 조회 검증 기록](qa/fabric-api-2026-10-12/README.md)을 참고하세요.

예약25·26·28·31은 `reservation-contract.js`가 DTO·한국 시각·nullable 금액을 변환하고, `useReservationResource`와 `useReservationMutation`이 조회·중복 전송·이탈·세션 경계를 관리합니다. 예약 이력은 원단 조회 성공에 의존하지 않으며 생성201 뒤 상세 조회 실패와 POST 결과 불명을 구분합니다. [예약 검증 기록](qa/reservation-api-2026-10-12/README.md)에 실제 확인 범위를 정리했습니다.

후속 작업:

1. 배포 API 주소가 정해지면 프록시·CORS·환경변수를 맞추고 배포 환경의 인증을 확인합니다. 로컬 실서버 검증은 완료했으며, 실제 매장 보유 판매자의 `/stores/me` 분기는 매장 저장 연결 시 추가 검증합니다. 현재 이 분기는 HTTP 계약 응답 대역으로 확인했습니다.
2. 계정 수정·매장 저장부터 live adapter를 확장합니다. 공통 success/data/error 처리와 Bearer·만료 처리는 재사용합니다. title/id 등 서버 DTO와 화면 모델의 차이를 변환하고, 권한·승인·재고는 서버가 다시 검증해야 합니다.
3. 구매자 원단 조회는 연결했습니다. 판매자·관리자 원단/매장/판매자 조회와 수정, 게시 승인·판매자 예약 수락·거절·수령 전환은 별도로 연결합니다. 구매자 요청·조회·취소는 연결했습니다. 화면의 업무 규칙과 별개로 서버 권한·재고 검증이 필요합니다.
4. 생성 후 받은 fabricId로 사진 업로드/삭제를 따로 처리하고 일부 실패를 복구합니다. 생성 응답 유실 시 서버 멱등성은 미합의이며 현재 버튼 잠금만으로 보장되지 않습니다.
5. 예약 가격·원단명 이력(B1), 응답 유실·사진 복구(B2), 예약 연락처(B3), 도안·AI·부자재 범위(B4)를 백엔드와 확인합니다.

시연의 CSS 질감과 AI/지도는 예시입니다. 실제 원단 조회는 서버 사진 URL을 사용하며 사진 없음·로딩 실패를 구분합니다. AI 응답과 지도 공급자 연결은 후속 범위입니다. Figma SVG의 로고28×28와 토트180×148 크기는 유지합니다.

## 확인 자료

- [React 실행·구조](../README.md)
- [React 검증 결과](qa/react/README.md)
- [전환 전 UX 최종 기준](qa/ux-final/README.md)
- [Figma 최신 흐름](https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y?node-id=122-12)
- [Figma 반응형·동작 기준](https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y?node-id=227-8029)
