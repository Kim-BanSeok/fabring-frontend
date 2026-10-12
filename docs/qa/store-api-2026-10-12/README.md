# 판매자 매장 등록·수정 API 연동

2026-10-12 · 백엔드 계약 검토 기준 `7dc28c79994295daee635524d05048574247a6d9`

**구현과 로컬 검증을 완료했습니다.** 기존 내 매장 조회에 등록·수정과 저장 후 상태 갱신을 연결했습니다. 백엔드 fetch 후 HEAD와 origin/main은 모두 위 `7dc28c7`이며 추가 커밋은 없었습니다. 프론트 테스트244개, 독립 실제 HTTP77개, 실제 adapter8개, 브라우저 등록·수정·새로고침·모바일과 최종 읽기 전용 GET/DB 확인17개를 통과했습니다. 아래에서 실제 서버 결과와 오류 모의 테스트를 구분합니다.

[연결 현황의 M2](../../INTEGRATION_STATUS.md#core-work)에 해당합니다. 판매자 개인 닉네임·전화 수정, 관리자 판매자 승인 UI, 원단·사진·예약 API의 기존 검증 범위와 구분합니다. 이전 QA 기록은 당시의 결과를 유지합니다.

## 현재 서버 계약

기본 주소는 `/api/v1`, 성공 응답은 `{ success: true, data }`입니다.

| API | 요청 | 성공 응답 | 주요 오류 |
| --- | --- | --- | --- |
| 5 매장 등록 | `POST /stores` | 201 `{ storeId }` | 400 입력 오류, 401 인증, 403 역할, 409 `STORE_ALREADY_EXISTS` |
| 6 내 매장 조회 | `GET /stores/me` | 200 매장 DTO | 401 인증, 403 역할, 404 `NOT_FOUND` |
| 7 내 매장 수정 | `PATCH /stores/me` | 200 변경 후 매장 DTO | 400 입력 오류, 401 인증, 403 역할, 404 `NOT_FOUND` |

세 API는 SELLER 역할과 토큰에서 얻은 자기 계정으로 처리합니다. 판매자 승인 상태는 검사하지 않으므로 PENDING·REJECTED도 매장을 등록·수정할 수 있습니다. 매장 저장은 판매자 승인 상태를 바꾸거나 재신청하지 않습니다. 원단 등록에 필요한 APPROVED 조건은 별도로 유지합니다.

판매자당 매장은 하나입니다. POST는 사전 조회와 DB의 `UNIQUE(user_id)`로 중복 생성을 막으며 동시 생성도409로 처리합니다. 이는 등록 요청의 결과를 클라이언트가 모두 알 수 있다는 보장은 아닙니다. 수정은 자기 매장만 대상으로 하며 매장 삭제 API는 이번 계약에 없습니다.

매장 DTO는 `storeId`, `store_name`, `store_address`, `store_phone`, `closed_days`, `pickup_guide` 여섯 필드입니다. 생성 응답은 번호만 포함하므로 입력값을 서버 재조회 결과라고 표현하지 않습니다. `/users/me`의 `hasStore`는 서버에서 매장 존재를 조회한 값이며, 매장 생성 이후 전역 프론트 상태도 새 존재 여부와 일치시켜야 합니다.

## 입력과 표시

| 필드 | 등록 | 수정 | 서버 규칙 |
| --- | --- | --- | --- |
| `store_name` | 필수 | 선택 | trim 후 1~100자 |
| `store_address` | 필수 | 선택 | trim 후 1~255자 |
| `store_phone` | 필수 | 선택 | trim 후 1~20자 |
| `closed_days` | 선택 | 선택 | trim 후 최대100자, null 허용 |
| `pickup_guide` | 선택 | 선택 | trim 후 최대5000자, null 허용 |

PATCH는 최소 한 필드를 보내며 생략한 필드는 유지합니다. 선택 필드를 비우려면 null을 보낼 수 있습니다. 이름·주소·전화에는 null이나 공백만 있는 값을 보내지 않습니다. 서버 전화 규칙은 길이 검증이며 별도의 숫자·지역번호 패턴을 필수 계약으로 만들지 않습니다.

서버에는 `detail_address`가 없습니다. 실제 화면은 주소와 동·호수 등 상세 위치를 하나의 입력으로 받아 최종 `store_address`의255자 제한을 적용합니다. 화면 모델의 `address`·`phone_number`를 서버의 `store_address`·`store_phone`으로 변환합니다. 개인 계정의 `phone_number`와 매장 연락처도 구분하며 마이페이지의 개인 정보는 읽기 전용입니다.

생성 validator는 정의되지 않은 필드를 제거하지만 수정 validator는 strictObject라 알 수 없는 필드를400으로 거절합니다. 프론트는 양쪽 모두 계약상 다섯 입력 필드만 전송합니다. GET/PATCH의 휴무일·픽업 안내 null은 정상 데이터이며 빈 시연 값으로 채우지 않습니다.

**OpenAPI 보완점:** 입력 스키마는 선택 두 필드의 nullable을 표시하지만 생성된 GET/PATCH 응답 스키마는 string만 표시합니다. 실제 DB·서비스·기존 서버 테스트는 null을 허용합니다. 프론트 변환은 실제 계약을 따르며 백엔드 문서 보완과 UI 연결을 구분합니다.

## 저장과 복구 처리

- 최초 진입은 내 매장을 조회합니다.404만 무매장 상태로 해석하고, 네트워크·500·잘못된 응답을 빈 등록 폼으로 바꾸지 않습니다. 과거 로그인 때의 매장 조회 실패도 현재 화면에서 재조회할 수 있습니다.
- POST201 후 후속 GET이 실패해도 등록 성공 번호와 안내를 보존합니다. 저장 요청을 다시 보내는 대신 조회만 재시도합니다. PATCH200은 전체 매장 DTO를 반환하므로 해당 성공과 추가 조회 실패를 구분합니다.
- POST409는 기존 매장을 재조회하여 복구합니다. 입력하던 값을 기존 매장에 자동 PATCH하거나409를 저장 성공으로 바꾸지 않습니다.
- POST/PATCH의 응답 유실·시간 초과·확인할 수 없는 응답은 결과 불명입니다. 자동 재전송하지 않고 최신 매장 확인과 사용자 판단을 거칩니다. 화면 이탈로 요청을 abort해도 서버 저장이 취소됐다고 단정하지 않습니다.
- 저장 중 중복 클릭, 로그아웃·다른 계정 로그인 후 늦은 응답을 막습니다. 입력 초안·처리 상태를 계정/시연 모드와 섞지 않습니다.
- 생성 이후 매장 정보와 `hasStore`를 갱신하고, 승인된 판매자는 재로그인 없이 원단 등록으로 이어집니다. 승인 대기·거절 판매자는 계속 해당 승인 안내를 보여 줍니다.
- 매장 정보는 구매자 원단 상세·예약 방문 정보에 사용됩니다. 현재 주소 변경과 예약 당시 주소 보존은 다른 문제이며 스냅샷 정책은 [B1](../../API_FOLLOWUPS.md#b1-예약-이력에-표시할-원단-정보와-금액)에 남아 있습니다.

## 구현과 검증 상태

실제 경로는 `/seller/store`, `/seller/profile`, `/seller/profile/saved`, `/seller/approval`입니다. 계정·매장 조회는 순서대로 실행하며 승인 확인 화면은 매장 API 장애에 의존하지 않도록 계정만 조회합니다. 저장 성공 응답을 먼저 기록하고 완료 화면에서 최신 값을 조회합니다. 결과 불명과409에는 초안을 보존하고 서버 재조회 후 확인 전까지 쓰기를 잠급니다.

서비스는 POST 성공 시 `hasStore`만 확인된 값으로 갱신하고 실제 매장 내용은 GET으로 채웁니다. PATCH 성공은 반환된 전체 DTO로 캐시를 갱신합니다. 쓰기 시작 전 또는 진행 중 시작한 늦은 GET·계정 조회가 성공한 저장을 덮어쓰지 않도록 쓰기 시작·완료 시 조회 버전을 바꿉니다. 인증 revision과 판매자 승인 상태를 저장 동작으로 바꾸지 않습니다.

아래 표에서 자동 테스트·실제 HTTP·adapter·브라우저의 검증 범위를 구분합니다. 계약 검토 중 읽은 기존 `tests/stores.test.js`의 테스트 정의를 이번 실행 결과로 집계하지 않습니다.

| 구분 | 확인 범위 | 현재 결과 |
| --- | --- | --- |
| 백엔드 최신 기준 | fetch 후 HEAD·origin/main 비교 | `7dc28c7` 동일, 추가 커밋 없음 |
| 프론트 자동 검증 | 매장 DTO·입력·오류·세션/취소 테스트, 전체 테스트·lint·build | `npm test`244개 통과, lint 무경고, build 성공. 앱 번들 약567kB 경고 |
| 실제 HTTP | 등록·조회·수정, nullable·필드 제한, 역할/소유권,409·404, 승인 상태 불변 | 77개 통과, [안전 증거](api-evidence.json) |
| 실제 adapter | 서버 매장 DTO→화면 모델, 생성·수정 후 전역 상태 갱신·세션 복구 | 8개 확인 통과, [안전 증거](adapter-result.json) |
| 브라우저 | 무매장 입력→저장→승인 안내, 기존 매장 수정, 개인 프로필 범위 분리, 모바일·입력 보존 | 아래 흐름 확인, [화면 증거](#browser-evidence) |
| 오류 복구 | 조회 실패, 결과 불명/중복 클릭, 성공 ack와 후속 조회 실패, 늦은 응답 | 클라이언트 모의 응답 테스트 통과. 실서버 응답 유실을 강제로 재현한 결과는 아님 |
| 최종 서버·DB 확인 | 신규·기존·adapter 매장 저장값, 개인정보·승인·기존 데이터 보존 | 읽기 전용 GET/SELECT17개 통과, [안전 증거](browser-final-state.json) |

실제 HTTP는 별도로 준비한 가상 계정·매장을 사용했습니다. 계정 등 검증 데이터 준비에는 DB를 사용했으며 이를 가입 API 검증으로 세지 않습니다. PENDING·REJECTED 판매자의 생성 전후 승인 상태 유지와 `hasStore` 변경, 동시 등록의 단일 매장 생성, PATCH 누락 보존·null 비우기를 확인했습니다. 서버의 선택 필드 공백 문자열은 trim 후 빈 문자열로 남을 수 있으며, 프론트는 사용자가 비운 선택 입력을 명시적 null로 보냅니다.

마지막17개 확인은 HTTP GET과 DB SELECT를 합친 읽기 전용 검증이며77개 초기 HTTP 검증과 별도입니다. 신규 매장의 PENDING·`hasStore=true`, 기존 APPROVED 매장의 수정값과 두 선택 필드 null, adapter 매장 최종값이 일치했습니다. 브라우저 검증 두 계정의 원래 사용자 행 전체 해시는 동일하여 개인 정보·승인 상태가 보존됐고, 이번 작업 이전11모델의 전체 행 해시도 불변이었습니다. 마지막 확인 시 백엔드와 프론트 서버는 정상 실행 중이었습니다.

오류 모의 테스트에는 POST/PATCH 네트워크 실패·5xx·잘못된 응답·시간 초과, 중복 클릭, 이탈·로그아웃·계정 변경 후 늦은 결과, POST ack 뒤 GET 실패, 저장 전·진행 중 시작된 조회의 늦은 도착을 포함합니다. 실제 HTTP의409·404·입력/권한 검증과 구분하며, 실서버 응답 유실을 강제로 발생시켰다고 주장하지 않습니다. 공개 증거에는 토큰·비밀번호·실제 개인 연락처·내부 파일 경로를 포함하지 않습니다.

<a id="browser-evidence"></a>
## 브라우저 확인

- 신규 PENDING 판매자는 빈 매장 입력→등록 성공→`hasStore=true`와 승인 대기 유지→새로고침 후 서버 저장값 복원을 확인했습니다.
- 기존 APPROVED 판매자는 매장명·주소·연락처를 수정하고 휴무일·픽업 안내를 모두 비워 저장했습니다. 두 선택 필드는 null로 전달됐으며 완료 화면·대시보드 매장명·원단 등록 진입·새로고침 후 복원을 확인했습니다.
- 개인 닉네임·이메일·전화는 읽기 전용이고 매장 저장 대상으로 전송되지 않습니다. 승인 확인 화면의 새 조회와 기존 승인 상태 유지를 확인했습니다.
- 저장 전 초안은 화면을 이동했다 돌아와도 유지됩니다. 새로고침하면 임시 초안이 사라지고 서버 저장값으로 표시됩니다.
- 모바일390×844 환경에서 스크롤바를 제외한 문서 폭375px이며 가로 넘침이 없었습니다. 브라우저 콘솔 오류·경고는 없었습니다.

| 화면 | 증거 |
| --- | --- |
| 신규 매장 입력 | [01-new-store-form](screens/01-new-store-form.png) |
| 신규 등록 완료 | [02-new-store-saved](screens/02-new-store-saved.png) |
| 신규 매장 새로고침 복원 | [03-new-store-restored](screens/03-new-store-restored.png) |
| 기존 매장 변경 완료 | [04-existing-store-updated](screens/04-existing-store-updated.png) |
| 기존 매장 새로고침 복원 | [05-existing-store-restored](screens/05-existing-store-restored.png) |
| 모바일 마이페이지 | [06-profile-mobile](screens/06-profile-mobile.png) |
| 최종 저장 정보 | [07-final-saved-store](screens/07-final-saved-store.png) |

이번 기록은 로컬 환경 결과입니다. 배포 CORS·실제 운영 주소·다른 장치 간 동시 편집은 별도 통합 검증 범위입니다. 매장 정보는 현재 연결된 값으로 예약에 표시되므로 과거 픽업 주소의 스냅샷 보존 정책을 완료했다고 보지 않습니다.

## 검토 근거

- [API 명세 v0.3의 매장5~7][api]: 경로·권한·필수/선택 필드·상태 코드.
- [매장 validator][validator], [서비스][service], [라우트][routes]: trim·nullable·부분 수정·자기 계정·승인 조건.
- [기존 서버 테스트][tests]: 중복 생성, 소유권, 필드 보존/null 비우기, 입력·권한·404의 기존 테스트 정의.

[api]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/docs/API_%EB%AA%85%EC%84%B8%EC%84%9C_v0.3.md#52-매장
[validator]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/validators/stores.schema.js
[service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/stores.service.js
[routes]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/routes/stores.routes.js
[tests]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/tests/stores.test.js
