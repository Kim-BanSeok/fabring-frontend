# 판매자 대시보드·픽업 달력 API 연동

2026-10-12 KST · 로컬 백엔드 계약 기준 `7dc28c79994295daee635524d05048574247a6d9`

판매자 대시보드의 기존 배치를 유지하면서 원단 상태별 건수·답변 대기 및 완료 문의 수·날짜별 픽업 일정을 실제 데이터로 연결했습니다. 프론트 테스트 192개·lint·build, 실제 조회·브라우저 수령 및 취소 후 갱신, 연결 실패와 복구, 기존 DB 보존을 확인했습니다.

계약은 로컬 백엔드의 명세·서비스·validator·DAO·라우트·테스트를 대조했습니다. 최신 원격 fetch 결과 HEAD와 origin/main이 같은 `7dc28c7`이며 추가 백엔드 커밋은 없습니다. [이전 판매자 예약 QA](../seller-reservation-api-2026-10-12/README.md)는 당시의 완료 범위와 미연동 안내를 그대로 보존합니다.

## 기존 API로 연결하는 범위

기본 주소는 `/api/v1`, 성공 응답은 `{ success: true, data }`입니다. 세 목록 모두 `content`, `page`, `size`, `totalElements`, `totalPages`를 반환합니다. page는 0부터, 기본 size는 20, 최대 size는 50입니다.

| API | 지원 조건 | 대시보드·달력에 쓰는 값 |
| --- | --- | --- |
| 14 `GET /sellers/me/fabrics` | 선택 `status=PENDING/POSTED/REJECTED/SOLD_OUT`, `page`, `size` | 상태별 원단 수와 전체 원단 수의 `totalElements` |
| 44 `GET /sellers/me/inquiries` | 선택 `status=WAITING/ANSWERED`, `page`, `size` | 답변 대기·완료 문의의 `totalElements` |
| 27 `GET /sellers/me/reservations` | 선택 `status`, `fabric_id`, `page`, `size` | 요청·수락 건수와 수락한 예약의 `pickup_at`·예약번호·원단명·구매자 |

모두 SELLER 권한을 요구하며 판매자 승인 상태를 추가로 검사하지 않습니다. 인증 실패는 401, 역할 불일치는 403, 잘못된 상태·페이지 입력은 400입니다. 각 목록은 본인 매장 원단 또는 본인에게 들어온 문의·예약만 조회합니다.

집계 조회만으로 원단 등록·편집·사진 업로드, 문의 목록 화면·답변 동작까지 연결되는 것은 아닙니다. 이번 문서에서는 통계·달력과 기존에 연결된 예약 처리 화면으로의 이동을 구분합니다. 시연 데이터는 실제 계정 결과와 섞지 않습니다.

## 건수의 의미

각 상태의 `page=0&size=1` 조회에서도 `totalElements`는 해당 조건 전체 건수입니다. 카드 숫자를 `content.length`나 내려받은 일부 원단·예약의 합으로 대신하지 않습니다. 원단 네 상태와 문의 두 상태는 각각 병렬 조회하며 각 그룹의 전체 건수는 상태별 건수의 합입니다. 하나의 상태 조회라도 실패하면 해당 그룹의 일부 숫자를 완전한 집계로 반환하지 않습니다. 답변 대기는 문의 건수이고 원단 개수가 아닙니다.

현재 UI의 요청 중 예약 수는 size=1 조회를 사용하고, 수락한 예약 수는 달력의 전체 조회가 성공한 결과에서 읽습니다. 달력이 실패하면 수락 건수도 조회 실패로 표시하며 첫 페이지만으로 완성된 결과를 표시하지 않습니다.

- 원단 상태는 PENDING(승인 대기), POSTED(게시 중), REJECTED(반려), SOLD_OUT(판매 완료)입니다. 승인 대기 원단 수와 판매자 계정의 승인 상태를 구분합니다.
- 내 원단 목록14는 기본 soft delete 조건으로 삭제 원단을 제외합니다. 원단 상세가 없는 행도 제외하며 매장이 없는 판매자는 정상적인 빈 페이지를 받습니다. 사진·예약 조인이 건수를 늘리지 않도록 원단 ID를 먼저 조회하는 DAO 구조입니다.
- 목록14의 `active_reservation_count`는 해당 원단의 REQUESTED와 ACCEPTED 예약을 합친 수입니다. 대시보드의 요청 건수·수락 건수를 각각 구할 때 이 값을 대신 사용하지 않습니다.
- 문의 상태는 WAITING과 ANSWERED입니다. 시연 화면에서 사용하는 DONE을 API에 보내지 않습니다. 답변 없는 문의 수를 전체 문의 수나 답변 완료 수와 혼동하지 않습니다.
- 받은 문의 목록44는 삭제된 문의를 제외하지만 삭제된 원단의 문의는 유지합니다. 따라서 원단 수가 0이어도 답변 대기 문의 수가 0이 아닐 수 있습니다. 비공개 문의도 본인 판매자 집계에 포함됩니다.
- 원단·문의·예약 카드는 서로 다른 요청 시점의 값입니다. 상태가 바뀌는 중에 조회하면 카드들을 하나의 시점에 고정된 통계라고 보장할 수 없습니다.

조회 중·실패·정상 0건을 구분합니다. 한 자원의 오류를 관련 없는 자원의 0건으로 표시하지 않고 다시 조회할 수 있어야 합니다.

## 목록 DTO의 차이

내 원단 목록14는 구매자 원단 목록의 요약 필드에 `status`, nullable `reject_reason`, `active_reservation_count`가 추가됩니다. 자투리·롤을 함께 반환하며 사진은 null일 수 있습니다. 공개 원단 목록의 상태를 POSTED로 고정하는 변환을 그대로 재사용하면 승인 대기·반려·판매 완료를 잘못 표시할 수 있습니다.

받은 문의 목록44의 항목은 `inquiryId`, `fabricId`, `fabric_title`, `buyer_nickname`, `is_private`, `status`, `content`, `answer`, `answered_at`, `created_at`입니다. 탈퇴한 구매자의 `buyer_nickname`은 null일 수 있고 미답변의 `answer`·`answered_at`도 null입니다. 원단명은 현재 연결 데이터이며 문의 작성 시점 스냅샷이 아닙니다. 대시보드 건수를 위해 받은 문의 본문·닉네임을 로그나 공유 증거에 남길 필요는 없습니다.

받은 예약 목록27에는 `reservationId`, `status`, `pickup_at`, `memo`, `requested_length_cm`, `estimated_price`, `fabricId`, `title`, `buyer_nickname`이 있습니다. 달력에는 원단명·구매자·예약번호·픽업 시각을 표시하고, 수량·금액·처리는 연결된 예약 상세에서 확인합니다. 목록에 없는 사진·연락처·전체 재고를 예시값으로 채우지 않습니다. 자투리 길이·예상금액은 null이며 이를 0원으로 바꾸지 않습니다.

## 날짜별 픽업 일정

달력은 **현재 ACCEPTED인 예약**을 기준으로 합니다. 요청·거절·취소·수령 완료를 확정 픽업 일정에 섞지 않습니다. 날짜가 지났다는 이유로 수령 완료로 바꾸지 않으며, 서버가 ACCEPTED로 반환한 과거 일정도 해당 날짜에 표시할 수 있습니다.

서버 정렬은 세 목록 모두 생성일 내림차순, 같은 시각에는 ID 내림차순입니다. 예약 목록은 픽업 일시순이 아닙니다. 월별 날짜 조건도 없으므로 현재 월과 다른 예약이 나왔다는 이유로 이후 페이지를 건너뛰면 안 됩니다.

달력 구현은 `status=ACCEPTED&size=50`의 모든 페이지를 조회한 뒤 `pickup_at`을 한국 시간으로 변환하고, 선택한 월·일에 맞춰 묶는 방식입니다. 날짜 경계는 브라우저의 현지 시간대가 아니라 Asia/Seoul을 사용합니다. 날짜 안에서는 픽업 시각순으로 정렬하고 같은 시각의 순서도 일정하게 유지합니다. 예약을 열 때 실제 예약번호를 전달해 기존 판매자 예약 상세·처리 화면을 사용합니다.

## 전체 페이지 조회의 정합성과 한계

전용 대시보드·월별 달력·조회 스냅샷 API는 현재 명세와 라우트에서 확인되지 않았습니다. 기존 목록으로 구현하되 완전한 결과를 얻지 못한 경우 일정이 없다고 안내하지 않습니다.

서비스 구현에는 다음 조건을 적용했습니다. 자동 테스트와 실제 서버·브라우저의 검증 결과는 아래 최종 기록에서 별도로 확인합니다.

1. 각 응답의 page·size가 요청과 일치하고 `totalElements`·`totalPages`가 일관적인지 확인합니다.
2. 예상한 모든 페이지를 읽고 예약번호 중복·누락 가능성을 확인합니다. 완료한 유일 예약 수가 전체 건수와 다르면 일부 결과를 완전한 일정으로 표시하지 않습니다.
3. 페이지 조회 실패·중복·조회 도중 건수 변화 등 감지한 불일치는 달력의 조회 실패로 다루고 새로 조회할 수 있게 합니다. 한 페이지의 결과만 남기고 정상 집계처럼 표시하지 않습니다.
4. 조회 상한은 200페이지, 수락 예약 10,000건입니다. 이를 초과하면 `CALENDAR_TOO_LARGE` 오류와 받은 예약 목록 확인 안내를 반환하며 일부 일정이나 0건을 반환하지 않습니다.
5. 월·날짜 이동, 계정 변경, 로그아웃 뒤에는 이전 요청의 지연 응답이 현재 화면을 덮지 않아야 합니다.

여러 페이지를 조회한 경우 마지막에 첫 페이지를 다시 읽고 예약번호·상태·픽업 일시 등 표시 필드까지 비교합니다. 완료 결과에는 프론트의 조회 완료 시각 `checkedAt`을 붙이며 이 값은 서버 스냅샷 버전이 아닙니다.

이 검사는 offset 페이지 조회의 모든 동시 변경을 막지는 못합니다. 예를 들어 첫 페이지 밖에서 수락 해제와 새 수락이 함께 일어나 전체 건수가 같으면 교체를 감지하지 못할 수 있습니다. 앞 페이지를 다시 확인하더라도 여러 HTTP 요청을 하나의 시점에 고정하는 서버 스냅샷은 아닙니다. 조회가 끝난 뒤 다른 사용자가 예약을 변경할 수도 있으므로 실제 처리 전에는 기존 상세 API에서 현재 상태를 확인합니다.

전체 조회 비용은 수락 예약 수에 비례합니다. 데이터 규모나 동시 변경이 늘어나는 경우 월별 서버 필터·커서·조회 버전 또는 집계 API를 협의할 수 있습니다. 이는 [후속 API 협의 사항](../../API_FOLLOWUPS.md)의 개선 후보이며 현재 화면을 연결하려면 반드시 새 API가 먼저 필요하다는 의미는 아닙니다.

## 최종 검증 기록

로컬 개발 서버와 독립 QA 데이터로 검증했습니다. 과거 픽업 날짜와 50건 초과 페이지를 재현하기 위한 초기 데이터는 **DB에 직접 준비한 fixture**입니다. 예약 생성·수락 API로 이 데이터를 만들었다고 보고하지 않습니다. 실제 HTTP 검증은 GET으로 수행했고, 이후 수령·판매자 취소는 브라우저에서 실제 POST를 실행했습니다.

| 검증 | 상태 |
| --- | --- |
| 백엔드 원격 최신 커밋 확인 | HEAD·origin/main 모두 `7dc28c7`, 추가 변경 없음 |
| 프론트 테스트·lint·build | `npm test` 192개 통과, lint 통과, build 통과. 앱 번들 500.13kB로 크기 경고 1건 |
| 실제 서버 GET | [초기 조회 35개 확인 통과](api-evidence.json): 권한401·403, 잘못된 상태·size400, 본인 데이터, 원단·문의·예약 상태별 건수와 페이지, KST 집계 |
| 실제 서버를 통한 프론트 서비스 어댑터 3개 | [원단 전체68·문의 전체60·수락 예약54 및 월별 집계 확인](adapter-result.json) |
| 50건 초과 조회 | 원단68건=50+18, 답변 대기53건=50+3, 수락54건=50+4. 마지막 페이지까지 포함 |
| 대시보드 초기 표시 | 카드 요청3·답변 대기53·수락54·원단 승인 대기2. 원단 POSTED59/PENDING2/REJECTED3/SOLD_OUT4, 문의 WAITING53/ANSWERED7 |
| KST·월별·날짜별 달력 | 9월2·10월50·11월2건, 11월 월경계00:30 반영. 9월2일 빈 날짜·8월 빈 월 구분. 10월12일 00:30→10:00→16:30→23:30 순서 확인 |
| 실제 예약 상세·처리 후 갱신 | 달력에서 예약75 상세→수령 POST 후 10월49·당일3. 예약68 상세→취소 POST 후 10월48·당일2, 전체 ACCEPTED52, POSTED58/SOLD_OUT5 |
| 모바일·기존 배치 | 390×844 뷰포트, 스크롤바15px를 제외한 내용 폭375px에서 가로 넘침 없음. 13일 선택 포커스 유지, 해당3건 시간순 확인 |
| 실패·변경·중복·상한·계정 변경·지연 응답 | 모의 응답 자동 테스트로 페이지 실패·중복·건수 변경·첫 페이지 변경·상한·abort·세션 변경·자원별 실패 분리를 확인 |
| 실제 브라우저 연결 실패·부분 재시도·복구 | 로컬 백엔드 일시 중지 후 4개 카드가 조회 실패, 달력은 일정 확인 필요로 표시되며 0건으로 바뀌지 않음. 서버 복구 뒤 문의만 재시도해53/7을 복구하고 다른3개 실패 상태 유지. 전체 재조회 후 수락52·당일2·10월48 복구 |
| 승인 전 판매자·매장 없음·soft delete·nullable 정책 | 백엔드 소스와 기존 서버 테스트를 읽어 계약 확인. 이번 실제 HTTP 검증의 추가 실험 결과로 세지 않음 |
| 상태 전환 후 실제 HTTP·DB 읽기 전용 확인 | [24개 확인 통과](browser-result.json). 예약75 PICKED_UP·예약68 CANCELED/SELLER, 자투리 SOLD_OUT, 롤 잔량1,800cm·확보0cm·가용1,800cm. 달력52건=50+2페이지, 10월48·9월2·11월2. 기존11개 모델의 원래 모든 행 해시 불변 |

초기35개는 실제 GET 기반 확인이고 최종24개는 상태 전환 후 HTTP GET과 DB SELECT를 함께 사용한 읽기 전용 확인입니다. 둘을59회의 HTTP 요청이나59개의 API 테스트라고 합산하지 않습니다. 브라우저 검증 종료 시 백엔드를 다시 실행했으며 서버 정상 응답과 브라우저 로그의 오류·경고 없음도 확인했습니다.

첫50건만 집계하면 10월47·9월2·11월1건이 되는 fixture를 사용했습니다. 실제 달력의 10월50·11월2 표시로 뒤 페이지 누락 여부를 확인했습니다. 수령·취소 후에는 같은 fixture가 변경되므로 초기 건수와 최종 건수를 섞지 않습니다.

브라우저 증거는 가상 QA 데이터 화면입니다.

| 캡처 | 내용 |
| --- | --- |
| [01 대시보드 초기](screens/01-dashboard-before.png) | 초기 카드·원단·문의 집계와 달력 |
| [02 빈 월](screens/02-empty-month.png) | 일정 없는 월의 정상 빈 상태 |
| [03 다음 월](screens/03-next-month.png) | 11월 일정과 KST 월경계 |
| [04 수령 완료](screens/04-pickup-success.png) | 실제 예약 수령 처리 결과 |
| [05 취소 완료](screens/05-cancel-success.png) | 실제 판매자 예약 취소 결과 |
| [06 대시보드 갱신](screens/06-dashboard-after.png) | 처리 후 집계·달력 갱신 |
| [07 모바일 대시보드](screens/07-dashboard-mobile.png) | 작은 화면의 기존 카드·현황 배치 |
| [08 모바일 달력](screens/08-calendar-mobile.png) | 날짜별 일정과 예약 상세 진입 |
| [09 연결 실패](screens/09-connection-error.png) | 연결 실패를 0건으로 표시하지 않는 상태 |
| [10 문의만 재시도](screens/10-partial-retry.png) | 문의 수 복구와 나머지 자원의 실패 상태 유지 |
| [11 전체 복구](screens/11-recovered-dashboard.png) | 서버 복구 후 최신 집계와 달력 재조회 |

192개는 이번 실행의 전체 프론트 테스트 수이며 실제 HTTP 요청 수나 이번 신규 테스트 수가 아닙니다. 페이지 변경·연결 실패 등의 모의 응답 테스트와 실제 서버 검증을 구분합니다. 테스트 계정·비밀번호·토큰·DB 설정·로컬 전용 스크립트는 공유 문서에 포함하지 않습니다.

근거: [API 명세][api], [원단 조회 서비스][fabric-service]·[validator][fabric-validator]·[DAO][fabric-dao]·[테스트][fabric-tests], [문의 서비스][inquiry-service]·[validator][inquiry-validator]·[DAO][inquiry-dao]·[테스트][inquiry-tests], [예약 서비스][reservation-service]·[DAO][reservation-dao]. 백엔드 소스는 수정하지 않습니다.

[api]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/docs/API_%EB%AA%85%EC%84%B8%EC%84%9C_v0.3.md
[fabric-service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/fabricsRead.service.js
[fabric-validator]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/validators/fabricsRead.schema.js
[fabric-dao]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/dao/fabricsRead.dao.js
[fabric-tests]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/tests/fabrics-read.test.js
[inquiry-service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/inquiries.service.js
[inquiry-validator]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/validators/inquiries.schema.js
[inquiry-dao]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/dao/inquiries.dao.js
[inquiry-tests]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/tests/inquiries.test.js
[reservation-service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/reservations.service.js
[reservation-dao]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/dao/reservations.dao.js
