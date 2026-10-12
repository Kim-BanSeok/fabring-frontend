# 판매자 직접 원단 관리·사진 API 연동

2026-10-12 · 백엔드 계약 기준 `7dc28c79994295daee635524d05048574247a6d9`

**구현과 로컬 검증을 완료했습니다.** 내 원단 목록·상세, 자투리/롤 직접 등록, 수정·삭제, 실제 사진 업로드·삭제를 연결했습니다. 기존 화면 구성과 시연 모드는 유지하며 실제 데이터·파일을 별도로 다룹니다. 전체 남은 작업과 P0 기준은 [연결 현황](../../INTEGRATION_STATUS.md#core-work)에 정리합니다.

이전 [판매자 대시보드](../seller-dashboard-api-2026-10-12/README.md)의 원단 건수 조회 완료와 이번 관리 화면·쓰기 연동을 구분합니다. 매장 등록/수정, 관리자 게시 승인 UI, AI 보조 등록은 별도 핵심 작업으로 남습니다. 서버 소스·기존 QA 역사는 수정하지 않습니다.

## 연결 대상과 권한

기본 주소는 `/api/v1`, 성공 응답은 `{ success: true, data }`입니다.

| API | 요청 | 성공 응답 |
| --- | --- | --- |
| 14 내 원단 목록 | `GET /sellers/me/fabrics`, 선택 status·page·size | 200 페이지 DTO |
| 11 원단 상세 | `GET /fabrics/{fabricId}` | 200 상세 DTO |
| 9 직접 등록 | `POST /fabrics`, JSON 원단·detail | 201 `{ fabricId, status: "PENDING" }` |
| 12 수정 | `PATCH /fabrics/{fabricId}`, 변경 필드 | 200 `{ fabricId, status }` |
| 13 삭제 | `DELETE /fabrics/{fabricId}` | 200 `data: null` |
| 15 사진 업로드 | `POST /fabrics/{fabricId}/images`, multipart `file`, 선택 `image_type` | 201 `{ imageId, image_url, thumbnail_url, sort_order }` |
| 16 사진 삭제 | `DELETE /fabrics/{fabricId}/images/{imageId}` | 200 `data: null` |

등록9는 SELLER이면서 승인 APPROVED와 매장이 필요합니다. 서버는 승인 여부를 먼저 확인한 뒤 매장 존재를 검사합니다. 목록14는 승인 전·거절된 판매자도 조회할 수 있으며 매장이 없으면 정상 빈 결과입니다. 수정·삭제·사진은 SELLER과 원단 소유권을 확인하며, 등록의 승인 조건을 다른 모든 작업에 임의로 추가하지 않습니다.

상세11은 POSTED이면 공개이고 비공개 상태의 원단은 소유 판매자·ADMIN만 조회합니다. 삭제된 원단은 누구에게나404입니다. 401 인증,403 권한,404 없음과 입력 오류를 구분하고 다른 계정 데이터로 대체하지 않습니다.

## 목록·상세와 입력 변환

목록은 PENDING/POSTED/REJECTED/SOLD_OUT 하나로 필터하며 생략하면 전체 상태입니다. page는0부터, size 기본20·최대50, 생성일·원단번호 내림차순입니다. 내 목록에는 자투리와 롤이 함께 나오며 구매자 목록의 sale_type·키워드·가격 정렬 조건을 그대로 보내지 않습니다.

목록 DTO는 공개 원단 요약에 실제 `status`, nullable `reject_reason`, `active_reservation_count`를 추가합니다. 삭제된 원단·상세가 없는 원단은 제외합니다. 판매자 상세는 공개 상세에 최상위 `reject_reason`, `remaining_length_cm`를 포함합니다. 재고는 롤의 남은 길이·확보 길이·구매 가능 길이를 구분하고 목록의 가용 길이를 실제 잔량으로 오인하지 않습니다.

직접 등록의 주요 입력은 `sale_type`, `title`, `price`, `remaining_length_cm`, 중첩 `detail`입니다. 화면의 한국어 소재·두께·색상 값을 서버 enum으로 변환하며 없는 값을 임의 추정하지 않습니다.

- 제목은 trim 후1~100자, 가격은 양의 정수, 폭은1~1000cm입니다.
- 자투리는 `detail.length_cm`30~90cm, `remaining_length_cm:null`입니다. 롤은 남은 길이90cm 이상, `detail.length_cm:null`입니다. 롤 재고 길이 자체를90의 배수로 제한하는 계약은 아닙니다.
- 소재 null/생략은 UNKNOWN이며 두께·색상은 지정된 enum이 필요합니다.
- 하자가 있으면 `defect_note`가 필요합니다. 사진 분류나 이름만으로 하자 설명을 대신하지 않습니다.
- 생성 결과는 PENDING입니다. 사진 업로드 성공도 게시 승인이나 구매자 공개를 의미하지 않습니다.

## 수정·삭제의 상태 규칙

수정은 보낸 항목만 바꾸며 생략은 유지, 허용 필드의 null은 비움을 뜻합니다. 판매 형태는 바꿀 수 없고 SOLD_OUT은 수정할 수 없습니다. 롤 잔량을 이미 확보한 길이보다 줄이면 `INSUFFICIENT_LENGTH`입니다.

REJECTED 원단을 보완하면 PENDING이 되고 반려 사유가 지워집니다. POSTED 원단의 수정은 현재 서버 계약에서 POSTED를 유지하며 바로 반영됩니다. 모든 수정을 다시 승인 대기로 보냈다고 표시하지 않습니다.

삭제는 soft delete입니다. 상태와 관계없이 REQUESTED 또는 ACCEPTED 예약이 있으면 `FABRIC_HAS_ACTIVE_RESERVATION`으로 거부됩니다. 화면의 `active_reservation_count`는 안내에 사용할 수 있지만 최종 허용 여부는 서버가 다시 검사합니다. 삭제 응답을 확인한 뒤 목록을 갱신하고, 종료된 예약 이력을 함께 지우는 것으로 안내하지 않습니다.

## 실제 사진과 실패 복구

한 요청에 `file`1개, 선택 분류 FULL/ZOOM/DEFECT를 전송합니다. 원단당 최대3장, 파일당5×1024×1024bytes 이하이며 서버는 실제 파일 내용을 읽어 jpeg/png/webp를 검사합니다. 파일 이름·MIME만으로 허용된 사진이라고 확정하지 않습니다. 브라우저가 multipart boundary를 정하도록 하며 JSON Content-Type을 강제하지 않습니다.

등록된 사진은 업로드 순서대로 sort_order가 정해지고0번이 대표입니다. 사진 삭제 후 남은 순서는0부터 다시 정해집니다. 대표 교체·수정용 별도 API는 없으므로 저장된 실제 imageId와 서버 재조회 결과를 기준으로 보여 줍니다. 사진 없음과 로드 실패를 구분합니다.

원단 생성201 후 받은 fabricId로 사진을 보냅니다. 일부 실패 시 생성 요청을 다시 보내지 않고 해당 원단에서 사진을 확인합니다. POST 응답이 불명인 경우는 실패가 확정된 경우와 다르며, 재조회 없이 재전송하면 원단·사진이 중복될 수 있습니다. 수정·삭제의 응답 불명도 최신 상세·목록·사진 상태를 확인한 뒤 가능한 동작을 결정합니다. 성공 응답 뒤 GET 실패를 원래 쓰기 실패로 바꾸지 않습니다.

서버 DRAFT·submit·멱등성 키는 없습니다. 사진이1장 이상이면 관리자 승인이 가능하므로 사용자가 의도한 전체 사진 업로드 완료와 관리자 검토 가능 상태의 구분은 [B2 협의 사항](../../API_FOLLOWUPS.md)으로 남습니다. 생성 시간 기록(FAB-13) 역시 이번 일반 생성 요청에 이미 제공되는 필드로 설명하지 않습니다.

## 검증 기록

백엔드를 fetch한 결과 HEAD·origin/main은 위 기준 커밋으로 같고 추가 업데이트는 없었습니다. 백엔드 소스는 수정하지 않았습니다. 프론트 `npm test` **217개 통과**, `npm run lint` 무경고, `npm run build` 성공입니다. 신규 계약/요청15개·UI 모델10개를 포함하며, 기존 인증·조회·예약·대시보드·시연 테스트도 함께 통과했습니다. 앱 번들550.44kB의 크기 경고는 남아 있으며 최종 배포 단계에서 코드 분할을 검토합니다.

| 검증 경로 | 결과와 증거 |
| --- | --- |
| 실제 로컬 HTTP | **60개 통과**. 소유권·미승인/매장 조건, SCRAP/ROLL 생성, 입력 경계, 부분 수정·null 비움, 상태·확보 재고 제한, 활성 예약 삭제 거부, 파일 규격·부분 실패·대표사진 삭제 재정렬. [API 결과](api-evidence.json) |
| 프론트 live adapter → 실제 서버 | **7개 확인 통과**. 생성→상세→FormData 파일→수정→상태 목록→사진 삭제→원단 삭제/404. [adapter 결과](adapter-result.json) |
| 실제 브라우저 | 자투리 정보·파일 입력→확인→등록·PENDING, 내 상세·사진 표시, POSTED 정보 수정, 반려 보완→PENDING, 정상 삭제·진행 예약 삭제 차단, 사진 관리에서 실제 업로드, 판매 완료 수정 제한, 롤 재고360/확보360/가능0 표시 |
| 목록 왕복·반응형 | 서버 size=5의1/3→2/3페이지, 상세→수정→돌아가기→목록의 status/page/size 보존. 390×844 모바일 목록·사진 관리의 가로 넘침 없음. 작은 사진 없음 문구 잘림 보완. 마지막 브라우저 오류·경고 로그 없음 |
| 브라우저 후 GET/DB | **16개 읽기 전용 확인 통과**. 저장된 최종 상태·원본/썸네일 응답·기존 데이터 보존·서버 상태. [최종 상태](browser-final-state.json) |

등록 중 실제 사진 부분 실패는 정상 PNG A→손상된 PNG B(400)→정상 PNG C를 보내고, 실패한 B만 정상 파일로 재시도해 중복 없이3장을 확인했습니다. 이후 대표사진 삭제 시 남은 sort_order가0·1로 정렬되는 것도 실제 HTTP로 검증했습니다. 사진 삭제는 HTTP와 live adapter에서 확인했으며 브라우저에서 삭제 확인 버튼까지 실행한 것으로 기록하지 않습니다.

응답 유실·시간 초과·늦은 이전 계정 응답·중복 클릭은 **모의 응답 자동 테스트**로 확인했습니다. 실제 서버 장애나 네트워크 유실을 발생시켰다고 보고하지 않습니다. 사진 쓰기 성공 후 재조회 실패는 코드 검토로 확인했으며 `needsRefresh`가 추가 쓰기를 잠그고 성공한 GET만 해제합니다. UNKNOWN 결과의 재전송도 성공한 최신 조회와 사용자 확인 전까지 막습니다.

### 브라우저 확인 자료

- [등록 확인](screens/02-registration-review.png), [등록 성공](screens/03-registration-success.png), [생성 원단 상세](screens/11-final-created-detail.png)
- [게시 정보 수정](screens/05-posted-edit.png), [반려 보완 재신청](screens/06-rejected-resubmission.png), [삭제 성공](screens/07-delete-success.png), [예약으로 삭제 차단](screens/08-active-reservation-protection.png)
- [모바일 사진 관리](screens/09-photo-mobile.png), [모바일 원단 목록](screens/10-list-mobile.png), [최종 목록·페이지](screens/13-final-list-page.png)

### 최종 데이터와 재확인 방법

별도의 합성 판매자·매장·원단을 사용했습니다. 브라우저 생성128은PENDING/사진1장, 수정119는POSTED/4,200원, 보완120은PENDING/반려 사유null, 삭제121은404, 예약 보호117은REQUESTED를 유지합니다. 롤118의남은/확보/가능 길이는360/360/0cm이고 사진 관리122는FULL사진1장이 저장됐습니다. 업로드 파일은 검증용 단색 PNG이며 실제 판매용 원단 사진이 아닙니다.

기존 User17·Store4·Fabric113·FabricDetail113·FabricImage1·Reservation126·Inquiry60개와 나머지4모델의 기존 행 해시가 모두 불변입니다. 테스트 행만 생성·수정했으며 실제 사용자 자료를 테스트용으로 바꾸지 않았습니다.

다시 확인하려면 로컬 백엔드3000·프론트5173 실행 후 승인된 검증용 판매자 계정으로 로그인해 내 원단에서 위 표식을 찾습니다. 직접 등록은 실제 파일1장 이상을 선택하고 마지막 확인 버튼을 누릅니다. 페이지 이동·수정·사진 추가 후 새로 조회해 저장값을 대조합니다. 검증 계정·DB 설정과 원본 파일은 로컬 전용 디렉터리에만 있으며 공유 문서에는 넣지 않습니다. 새 환경에서는 별도의 승인 판매자·매장·가상 원단을 준비해야 합니다.

근거: [API 명세][api], [원단 서비스][fabric-service]·[입력 validator][fabric-validator], [사진 서비스][image-service]·[업로드 미들웨어][upload], [원단 조회 서비스][read-service]. 테스트 계정·토큰·DB 설정·로컬 전용 스크립트는 공유 문서에 포함하지 않습니다.

[api]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/docs/API_%EB%AA%85%EC%84%B8%EC%84%9C_v0.3.md
[fabric-service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/fabrics.service.js
[fabric-validator]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/validators/fabrics.schema.js
[image-service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/images.service.js
[upload]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/middlewares/uploadImage.js
[read-service]: https://github.com/goduckTeam/backEnd/blob/7dc28c79994295daee635524d05048574247a6d9/src/services/fabricsRead.service.js
