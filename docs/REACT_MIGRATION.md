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

2026-10-12에는 백엔드 `7dc28c7` 기준 원단 목록10·상세11을 추가했습니다. `services/fabric-contract.js`가 필터 코드와 서버 DTO를 화면 모델로 변환하고 `hooks/useFabricResource.js`가 화면별 로딩·오류·재시도·취소를 관리합니다. 조회 결과는 전역 live snapshot에 넣지 않고 현재 구매자 화면에만 전달하여 다른 역할과 시연 데이터에 섞이지 않게 했습니다. 홈 최근 자투리·목록·상세와 원단이 필요한 후속 경로에서 재조회합니다. 이어진 작업에서 구매자 예약 요청·조회·취소와 원단 문의42~45를 연결했습니다. 당시 원단 조회 검증은 [기록](qa/fabric-api-2026-10-12/README.md)에 보존합니다.

예약25·26·28·31은 `reservation-contract.js`가 DTO·한국 시각·nullable 금액을 변환하고, `useReservationResource`와 `useReservationMutation`이 조회·중복 전송·이탈·세션 경계를 관리합니다. 예약 이력은 원단 조회 성공에 의존하지 않으며 생성201 뒤 상세 조회 실패와 POST 결과 불명을 구분합니다. [예약 검증 기록](qa/reservation-api-2026-10-12/README.md)에 실제 확인 범위를 정리했습니다.

판매자 예약27·29·30·32도 같은 계약·HTTP 계층을 확장해 연결했습니다. 판매자 목록은 구매자 DTO와 달라 별도 변환하며 상세28·취소31은 공용으로 사용합니다. 실제 처리 메서드는 `listReceivedReservations`, `acceptReservation`, `rejectReservation`, `confirmPickup`이고, 시연의 범용 `updateReservation`과 분리합니다. 선택 상세를 새로 조회한 뒤 상태별 동작을 제공하고, 전송 중 중복 클릭·세션 변경·결과 불명을 기존 mutation hook으로 제어합니다. [판매자 예약 검증 기록](qa/seller-reservation-api-2026-10-12/README.md)을 참고하세요.

판매자 대시보드는 `seller-dashboard-contract.js`에서 원단14·문의44의 상태별 `totalElements`와 수락 예약27의 모든 페이지를 검증합니다. `useSellerOverviewResource`가 원단·문의·요청·달력의 로딩과 실패를 독립적으로 관리하고, `sellerDashboardModel.js`가 한국 날짜별 그룹과 시간순 정렬·월 이동을 담당합니다. 전체 페이지가 완성되기 전에는 부분 달력을 노출하지 않으며, 화면 이동·세션 변경 후 늦은 응답도 반영하지 않습니다. 50건 페이지 경계와 실제 처리 후 집계 변경 확인은 [대시보드 검증 기록](qa/seller-dashboard-api-2026-10-12/README.md)을 참고하세요.

판매자 원단9·11~16은 `seller-fabric-contract.js`가 소유자 DTO·등록/수정 입력·사진과 삭제 응답을 변환합니다. `listMyFabrics`, `getSellerFabric`, `createFabric`, `updateFabric`, `deleteFabric`, `uploadFabricImage`, `deleteFabricImage`를 실제 모드에서 사용하고, `http-client.js`는 JSON과 FormData를 구분합니다. 파일 전송 시 multipart Content-Type은 브라우저가 정합니다. 서버에 없는 DRAFT/submit 또는 멱등성 API를 추가하지 않습니다. [원단 관리 검증](qa/seller-fabric-api-2026-10-12/README.md)을 참고하세요.

매장5~7은 `store-contract.js`가 생성 번호·전체 DTO·nullable 선택 필드·부분 수정 입력을 검증합니다. `refreshSellerProfile`, `getMyStore`, `createStore`, `updateStore`를 사용하고 시연의 `saveStore`와 분리합니다. `SellerLiveStore.jsx`는 계정→매장 순서로 조회한 뒤 입력 폼을 열며,404 외 실패를 무매장으로 바꾸지 않습니다. 저장 성공 기록을 후속 조회보다 먼저 남기고, 응답 불명·409는 초안 보존과 서버 확인 후 재개로 처리합니다. 쓰기 전·진행 중 시작된 늦은 조회가 최신 저장을 덮어쓰지 않도록 매장 조회 버전을 관리합니다. 인증 revision이나 판매자 승인 상태는 매장 저장으로 바꾸지 않습니다. 마이페이지 개인 필드는 후속 프로필 작업에서 별도 저장으로 연결했습니다. [매장 검증](qa/store-api-2026-10-12/README.md)에 당시 실제 서버·브라우저·오류 모의 테스트와244개 테스트 결과를 보존했습니다.

후속 작업의 우선순위와 완료 기준은 [연결 현황](INTEGRATION_STATUS.md)에 묶음별로 정리합니다.

판매자 AI 등록17~21은 `ai-contract.js`와 `startAiSession`, `getAiSession`, `answerAiSession`, `confirmAiSession`, `abortAiSession`으로 연결합니다. `SellerLiveAiRegistration.jsx`는 서버가 정한 질문·대화·미확인 항목을 보여 주고 기존 원단 폼과 사진 처리를 재사용합니다. 선택 답변·직접 쓴 답변·대화 마무리를 구분하며, 빠진 치수·두께·색상·하자 여부를 임의로 채우지 않습니다. 초안 수정과 사진 선택 후 판매자가 최종 내용을 확인해야 확정20을 호출합니다.

AI 세션별 메모리 초안은 입력·수정 내용·사진·요청 결과 불명과 성공 응답을 구분해 보존합니다. 진행 중인 POST의 응답을 잃었다고 같은 답변을 자동 재전송하지 않으며, 현재 대화·생성 원단 번호를 GET으로 확인합니다. `IN_PROGRESS`인 한 번의 조회만으로 요청 실패를 확정하지 않습니다. 직접 입력 전환은 중단21의 `ABORTED` 확인 뒤 가능하며 확정된 원단의 사진을 다시 생성 요청 없이 이어갑니다. 서버가 기본15초로 AI를 두 번 시도할 수 있으므로 AI 답변 요청에는45초 제한을 사용하고 다른 API의 기본15초 제한은 유지합니다.

현재 로컬 검증은 사용자 요청에 따라 실제 API/DB와 저장소의 개발용 `fake-rules` 제공자, 격리된 오류·지연 검증을 사용했습니다. 외부 AI 키·제공자 설정을 로컬에 추가하지 않았습니다. Vite의 `VITE_AI_PROVIDER`는 확인한 서버 제공자를 화면에 설명하는 값이며 실제 제공자를 선택하거나 외부 AI 비밀키를 전달하는 설정이 아닙니다. 실제 모델 품질과 서버 메모리 세션의 영속화·재시작 복구는 추후 팀 환경에서 확인합니다. 상세 검증과 범위는 [AI 등록 기록](qa/ai-api-2026-10-12/README.md)에 정리합니다.

문의42~45는 `inquiry-contract.js`, `listFabricInquiries`, `listSellerInquiries`, `createInquiry`, `answerInquiry`로 연결했습니다. 페이지 DTO·WAITING/ANSWERED·nullable 작성자 닉네임과 서버의 비공개 가림을 그대로 보존합니다. `InquiryPages.jsx`는 시연 페이지와 분리하여 원단별 목록·작성과 판매자 받은 문의·답변/답변 수정을 처리합니다. 목록은 전역 시연 배열에 넣지 않으며 계정·인증 revision이 바뀌면 늦게 도착한 조회 결과를 버립니다. 서버가 buyer_id나 canRead를 제공하지 않으므로 닉네임으로 본인 여부를 추정하지 않습니다.

프로필4는 `profile-contract.js`, `getMyProfile`, `updateProfile`과 공용 `LiveProfilePage.jsx`를 사용합니다. 닉네임·nullable 개인 연락처만 전송하고 응답의 계정 식별자·역할·이메일과 제출값을 검증한 뒤 현재 사용자 상태를 갱신합니다. 저장 전 시작한 늦은 GET이 최신 PATCH를 덮어쓰지 않으며, 매장 저장과 동시에 실행될 때 hasStore가 되돌아가지 않도록 읽기 버전을 확인합니다. 입력과 결과 불명은 계정별 메모리 초안으로 보존하고 재조회로 확인합니다. 개인 프로필과 매장 필드는 다른 폼·저장 API를 사용합니다.

문의·프로필의 실제 서버 검증은 전용 테스트 DB·루프백 포트3002와 별도 Vite 포트5174에서 진행했습니다. 기존 개발·공용 테스트 DB와 기존5173 프록시를 변경하지 않는 대체 검증입니다. 기존11개 모델의 전체 행은 작업 전후 읽기 전용 해시로 대조합니다. [검증 기록](qa/inquiry-profile-api-2026-10-12/README.md)에 실제 호출·브라우저·제어된 응답 유실을 구분합니다.

후속 작업:

1. 배포 API 주소가 정해지면 프록시·CORS·환경변수를 맞추고 배포 환경의 인증을 확인합니다. 로컬 실서버 인증과 매장 생성·조회·수정은 확인했으며, 로컬 검증을 배포 완료로 세지 않습니다.
2. 관리자 조회·승인, 실제 도안 추천·조회와 AI 보조 등록, 개인 프로필 수정과 문의 작성·조회·답변의 화면/API 연결을 마쳤습니다. AI는 저장소의 개발용 규칙 제공자와 대체 검증으로 마무리하며 외부 모델 품질은 추후 설정된 환경에서 확인합니다. 로컬 키 준비를 기다리지 않고 통합 검증·배포/시연 마무리를 진행할 수 있습니다. 관심 저장·지도와 구매자 본인 문의 전체 조회는 별도로 범위를 정합니다.
3. 구매자 원단 조회, 구매자·판매자 예약 처리, 판매자 원단·문의 통계와 날짜별 픽업 달력, 판매자 직접 원단 관리·사진과 매장 저장은 연결했습니다. 이후 연결도 공통 응답·Bearer·만료 처리를 재사용하고 서버 DTO를 화면 모델로 변환합니다. 권한·승인·재고는 서버가 다시 검증해야 하며 대규모 달력의 월별 조회·원자적 통계 집계는 백엔드 후속 협의 대상입니다.
4. 원단 생성 후 받은 fabricId로 사진 업로드/삭제와 일부 실패 복구를 연결했습니다. 생성 응답 유실 시 서버 멱등성은 미합의이며 현재 버튼 잠금만으로 보장되지 않습니다. 원단/사진 재조회와 사용자의 확인을 통한 복구를 유지합니다.
5. 예약 가격·원단명 이력(B1), 응답 유실·사진 복구(B2), 예약 연락처(B3), 도안·AI·부자재 범위(B4)를 백엔드와 확인합니다.

시연의 CSS 질감과 AI/지도는 예시입니다. 실제 원단 조회는 서버 사진 URL을 사용하며 사진 없음·로딩 실패를 구분합니다. 실제 모드의 AI 등록은 서버 API를 사용하지만 현재 로컬은 개발용 규칙 제공자입니다. 외부 AI와 지도 공급자의 운영 검증은 후속 범위입니다. Figma SVG의 로고28×28와 토트180×148 크기는 유지합니다.

## 확인 자료

- [React 실행·구조](../README.md)
- [React 검증 결과](qa/react/README.md)
- [전환 전 UX 최종 기준](qa/ux-final/README.md)
- [Figma 최신 흐름](https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y?node-id=122-12)
- [Figma 반응형·동작 기준](https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y?node-id=227-8029)
