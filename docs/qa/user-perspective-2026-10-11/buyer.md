# 구매자 · 이용자 관점 검토

[전체 보고서](README.md) · [필터로 보기](index.html)

검토 2026-10-11~12. 우선순위와 검증 범위는 전체 보고서를 따른다. 이미지는 당시 실행 화면이며, 업무 상태 변경은 격리된 시연에서 확인했다.

<a id="B01"></a>

## B01 · P2 · 수락된 예약에서 방문 정보를 찾는 동선이 끊긴다

**먼저 개선할 다섯 항목 중 하나.**

- 경로: `/buyer/reservations?status=ACCEPTED&example=1&mode=demo`, `/buyer/reservations/demo-roll?status=ACCEPTED&example=1&fabric_id=fabric-roll-1`.
- 재현: 구매자 화면 목록 → 수락됨 예약 예시 → 예약 취소 → 예약 유지. 취소 실행은 하지 않는다.
- 관찰: 수락됨 카드의 유일한 동작이 빨간색 ‘예약 취소’다. 상품 이름도 링크가 아니고 상세 보기 동작이 없다. ‘예약 유지’를 통해 도달한 상세에는 날짜·수량·금액·재고만 있으며 판매처 이름, 픽업 주소, 판매자 문의 진입이 없다. ‘약속한 시간에 방문해 주세요’라는 안내만 있다.
- 영향: 실제 방문 직전에 필요한 장소를 예약에서 확인할 수 없다. 정상적인 다음 행동보다 취소가 더 잘 드러난다.
- 제안: 수락됨에도 ‘픽업 정보 보기’를 기본 동작으로 두고 상세에 판매처·주소·희망/확정 일정 및 이미 지원하는 문의 연결을 표시한다. 취소는 보조 동작으로 유지한다. 이력 주소를 새로 보장하는 것은 API 합의가 필요하므로 현재 조회 가능한 정보와 구분한다.
- 증거: 직접 확인한 예약 목록/상세. [buyer-reservation-accepted.jpg](screens/buyer-reservation-accepted.jpg), [buyer-reservation-detail.jpg](screens/buyer-reservation-detail.jpg). `BuyerPage.jsx`의 `ReservationActions`에서도 ACCEPTED에는 취소만 제공함을 보완 확인했다.

화면 증거: [1번 화면](screens/buyer-reservation-accepted.jpg) · [2번 화면](screens/buyer-reservation-detail.jpg)

<a id="B02"></a>

## B02 · P2 · 공개 문의 안내가 입력란·등록 버튼 아래에 있어 늦게 눈에 들어온다

**먼저 개선할 다섯 항목 중 하나.**

- 경로: `/buyer/inquiries?fabric_id=fabric-scrap-1&compose=1`.
- 재현: 블루 스트라이프 코튼 상세 → 판매자 문의.
- 관찰: ‘기본 공개 문의입니다. 다른 사용자에게도 문의 내용이 보여요’ 안내가 입력 카드와 ‘문의 등록’ 버튼 아래에 있다. 본문보다 작은 글씨의 연한 안내 상자다. 입력 필드 바로 옆에는 공개 여부가 없다.
- 영향: 판매자에게 개인적으로 묻는 화면으로 이해하고 연락처 등 불필요한 정보를 먼저 입력할 수 있다. 공개 여부를 알게 되는 시점이 늦다.
- 제안: 입력 제목 또는 입력 필드 위에 ‘공개 문의’와 ‘개인 연락처는 적지 마세요’를 짧게 표시한다. 공개/비공개 기능을 새로 추가할 필요는 없다.
- 증거: 직접 확인. [buyer-inquiry-public-notice.jpg](screens/buyer-inquiry-public-notice.jpg).

화면 증거: [1번 화면](screens/buyer-inquiry-public-notice.jpg)

<a id="B03"></a>

## B03 · P2 · 필터의 ‘선택 취소’가 기존 검색 조건까지 초기화한다

- 경로: `/buyer/filters?sale_type=SCRAP&material=울&thickness=두꺼움&color=보라`.
- 재현: 조건에 맞는 원단 없음 예시 → 조건 수정 → 아무것도 바꾸지 않고 선택 취소.
- 관찰: 적용되어 있던 울/두꺼움/보라 검색 결과로 돌아가지 않고 `sale_type=SCRAP`만 남은 기본 목록으로 이동했다. 실제 화면에서 모든 셀렉트가 ‘전체’로 바뀌고 원단 4개가 표시됐다.
- 영향: ‘취소’와 ‘조건 초기화’가 사실상 비슷한 결과가 된다. 수정만 포기하고 이전 탐색으로 돌아가려는 사용자가 조건을 다시 맞춰야 한다.
- 제안: 진입 시 적용된 검색 URL을 보관해 ‘선택 취소’로 그대로 복귀하고, 초기화는 별도 버튼의 의미로 유지한다.
- 증거: 직접 클릭 확인. [buyer-filter-edit.jpg](screens/buyer-filter-edit.jpg); 취소 후 URL·셀렉트·원단 4개를 접근성 트리로 확인. `BuyerPage.jsx`의 dedicated filter 취소 링크도 판매 형태만 보존한다.

화면 증거: [1번 화면](screens/buyer-filter-edit.jpg)

<a id="B04"></a>

## B04 · P2 · 검색하면 같은 원단의 사진과 색상이 사라진다

- 경로: `/buyer/fabrics` → `/buyer/fabrics?sale_type=SCRAP&material=면&thickness=얇음&color=블루&view=search`.
- 재현: 자투리 목록에서 면·얇음·블루 선택 → 검색.
- 관찰: 기본 목록에는 질감 이미지·설명·색상이 있지만 결과에서는 이미지와 설명, 색상 값이 빠진 텍스트 카드로 변한다. 1개 결과 카드는 화면 가로 전체를 차지하며 대부분이 빈 공간이다.
- 영향: 색감·무늬로 비교하는 원단 탐색에서 필터를 쓴 뒤 시각 정보가 줄어든다. 앞에서 봤던 원단인지 다시 상세를 열어 확인해야 한다.
- 제안: 검색/기본/접힌 목록에 같은 핵심 카드 구조를 사용한다. 접는 대상은 필터 영역으로 한정하고 썸네일·색상·치수·단가·상태를 유지한다.
- 증거: 직접 확인. [buyer-list.jpg](screens/buyer-list.jpg), [buyer-search.jpg](screens/buyer-search.jpg).

화면 증거: [1번 화면](screens/buyer-list.jpg) · [2번 화면](screens/buyer-search.jpg) · [3번 화면](screens/mobile-filter-collapsed.jpg)

<a id="B05"></a>

## B05 · P2 · 검색 결과에서 현재 적용 조건을 한눈에 확인할 수 없다

- 경로: B04의 `view=search` 화면.
- 재현: 면·얇음·블루 검색 후 결과 화면 읽기.
- 관찰: 상단은 ‘조건에 맞는 자투리 원단 1개’만 알려준다. 세부 적용 조건은 보이지 않는다. ‘필터 조건 변경’과 하단 ‘다른 조건 살펴보기’는 같은 수정 화면으로 이동하고, 초기화·자투리 목록 보기까지 비슷한 비중의 버튼이 늘어서 있다. 반면 결과 없음 화면에는 현재 조건 표가 있다.
- 영향: 무엇 때문에 결과가 줄었는지 기억해야 한다. 다시 검색하려는 동작이 중복되어 우선순위가 약하다.
- 제안: 결과 수 옆에 적용 조건을 짧은 요약/칩으로 보여주고 ‘조건 변경’과 ‘초기화’ 중심으로 동작을 정리한다. 정상 결과와 빈 결과의 조건 표시는 일관되게 한다.
- 증거: 직접 확인. [buyer-search.jpg](screens/buyer-search.jpg); 빈 결과의 현재 조건 표는 접근성 트리·화면에서 별도 확인.

화면 증거: [1번 화면](screens/buyer-search.jpg)

<a id="B06"></a>

## B06 · P2 · 문의 답변을 읽은 뒤 해당 원단으로 이어지는 버튼이 없다

- 경로: `/buyer/inquiries?status=ANSWERED&example=1&mode=demo`.
- 재현: 화면 목록 → 문의 내역 답변 완료 예시 → 상품·질문·답변 읽기.
- 관찰: 상품 사진과 이름이 표시되지만 링크가 아니며, 답변 아래에도 ‘원단 보기’ 또는 ‘픽업 요청’이 없다. 구매를 이어가려면 상단 원단목록으로 가서 상품을 다시 찾아야 한다.
- 영향: 구매 전 불확실성을 해소한 순간 다음 행동이 끊긴다. 질문과 답변이 여러 카드에 나뉘어 길게 펼쳐져 있을수록 동선 손실이 커진다.
- 제안: 해당 원단이 아직 조회 가능하면 ‘원단 상세 보기’를 제공하고, 불가능하면 거래 종료 등 상태를 안내한다. 문의 화면에서 바로 구매 확정을 할 필요는 없다.
- 증거: 직접 확인한 답변 완료 화면과 접근성 트리에 상품별 링크가 없음. [buyer-inquiries-answered.jpg](screens/buyer-inquiries-answered.jpg).

화면 증거: [1번 화면](screens/buyer-inquiries-answered.jpg)

<a id="B07"></a>

## B07 · P2 · 픽업 장소와 방문 안내를 요청 화면에 진입해야 알 수 있다

- 경로: `/buyer/fabrics/fabric-scrap-1` → `/buyer/pickup/fabric-scrap-1`.
- 재현: 상세에서 판매처 정보 확인 → 픽업 요청하기.
- 관찰: 원단 상세에는 ‘양주 원단상회 · 양주시’만 있다. 도로명 주소와 층, 휴무·방문 가능 시간은 픽업 입력 페이지에서 처음 보인다. 목록 카드에는 판매처/위치 정보 자체가 없다.
- 영향: 직접 방문이 가능한지 판단하기 전에 원단을 고르고 요청 화면까지 들어가야 한다. 방문 가능한 지역이 구매 결정의 핵심인 서비스에서 정보 노출이 늦다.
- 제안: 상세의 판매처 영역에 조회 가능한 주소·픽업 안내를 먼저 표시한다. 목록에는 제공 가능한 최소 위치 요약을 고려한다. 실제 지도 연동이나 거리 계산을 새로 요구하는 항목은 아니다.
- 증거: 직접 확인. [buyer-detail.jpg](screens/buyer-detail.jpg), [buyer-pickup-top.jpg](screens/buyer-pickup-top.jpg).

화면 증거: [1번 화면](screens/buyer-detail.jpg) · [2번 화면](screens/buyer-pickup-top.jpg)

<a id="B08"></a>

## B08 · P2 · 픽업의 중요한 운영 조건이 12px 한 줄에 섞여 있다

- 경로: `/buyer/pickup/fabric-scrap-1`.
- 재현: 희망 날짜·시간 바로 아래 안내 읽기.
- 관찰: 휴무일, 방문 가능 시간, 수락 확인, 확정되지 않았다는 설명이 구분 없이 이어진다. DOM에서 글자 12px, 줄높이 20px, 색상 `rgb(104,118,111)`를 확인했다. ‘판매자 수락 전에는 확정되지 않음’이 두 안내 영역에서 반복된다.
- 영향: 일정 선택에 중요한 운영 시간과 거래 상태의 차이를 작은 보조 문장으로 읽어야 한다. 가격·상품명에 비해 중요 규칙이 잘 드러나지 않는다.
- 제안: ‘방문 안내’와 ‘일정은 판매자 수락 후 확정’ 두 항목으로 분리하고 핵심 문구는 14~16px로 표시한다. 상세한 부연만 작은 글자로 둔다. 측정 없이 대비 기준 위반이라고 단정하지 않는다.
- 증거: 직접 화면/DOM 계산 스타일 확인. [buyer-pickup-top.jpg](screens/buyer-pickup-top.jpg), [buyer-pickup-bottom.jpg](screens/buyer-pickup-bottom.jpg).

화면 증거: [1번 화면](screens/buyer-pickup-top.jpg) · [2번 화면](screens/buyer-pickup-bottom.jpg)

<a id="B09"></a>

## B09 · P2 · 활용 아이디어 두 개와 공통 버튼의 대상이 불명확하다

- 경로: `/buyer/fabrics/fabric-roll-1` 하단 → `/buyer/recommendations/fabric-roll-1`.
- 재현: 지퍼 파우치·데일리 토트백 카드 확인 → 제작 조건 확인.
- 관찰: 두 카드가 같은 무게로 놓여 있지만 개별 선택 동작은 없다. 아래 공통 ‘제작 조건 확인’과 ‘도안 미리보기’는 모두 지퍼 파우치에만 연결된다.
- 영향: 토트백에 관심이 있던 사용자도 어떤 도안을 고른 것인지 모른 채 파우치 화면으로 이동한다.
- 제안: 현재 지원하는 파우치 카드 안에 해당 CTA를 배치하거나 ‘지퍼 파우치 제작 조건’으로 이름을 명시한다. 토트백은 ‘활용 아이디어 예시’라는 현 범위를 더 분명히 표시한다. 도안 기능 확대를 전제로 하지 않는다.
- 증거: 직접 클릭 확인. [buyer-ideas.jpg](screens/buyer-ideas.jpg); 다음 화면 제목 ‘지퍼 파우치 제작 조건’.

화면 증거: [1번 화면](screens/buyer-ideas.jpg)

<a id="B10"></a>

## B10 · P3 · ‘도안 미리보기’라는 이름에 비해 시각적 도안이 없다

- 경로: `/buyer/patterns/pouch?fabric_id=fabric-roll-1`.
- 재현: 제작 조건 → 도안 미리보기.
- 관찰: 재단 부품 표와 재단 기준 설명만 있고 부품 모양이나 배치 그림이 없다. 실제 크기 출력/다운로드가 아니라는 설명은 하단에 있다.
- 영향: 미리보기라는 이름에서 기대한 형태·재단 방향을 시각적으로 이해할 수 없다. 앞의 제작 조건과 비슷한 텍스트를 다시 읽게 된다.
- 제안: 지금 범위라면 이름을 ‘재단 치수 확인’으로 맞추거나, 이미 고정된 치수만 설명하는 간단한 배치도를 함께 보여준다. 실제 출력·다운로드 기능은 별도 범위다.
- 증거: 직접 확인. [buyer-pattern.jpg](screens/buyer-pattern.jpg).

화면 증거: [1번 화면](screens/buyer-pattern.jpg)

<a id="B11"></a>

## B11 · P3 · 데스크톱 부자재 선택 때 비교 중인 목록 일부가 화면 밖으로 이동한다

- 경로: `/buyer/supplies?from=…` → `selected=2&focus=selected`.
- 재현: 도안 → 부자재 둘러보기 → 판매처 목록의 2번 선택.
- 관찰: 선택한 상세로 즉시 스크롤·포커스 이동한다. 데스크톱에서도 지도 위쪽과 첫 판매처가 화면 위로 사라지고 헤더가 보이지 않는다. 선택 정보가 드러나는 장점은 있으나 다른 판매처와 연속 비교할 때 다시 위로 이동해야 한다.
- 영향: 선택마다 화면 맥락이 움직여 비교가 번거롭다. 지도와 상세를 동시에 보는 큰 화면의 장점을 살리지 못한다.
- 제안: 넓은 화면에서는 목록과 선택 상세를 함께 보이게 배치하거나, 상세가 이미 보이는 경우 스크롤을 생략한다. 작은 화면의 상세 포커스 안내는 유지한다.
- 증거: 직접 클릭 확인. [buyer-supplies-top.jpg](screens/buyer-supplies-top.jpg), [buyer-supplies-selected.jpg](screens/buyer-supplies-selected.jpg). 소스의 선택 시 `scrollIntoView` 호출도 확인.

화면 증거: [1번 화면](screens/buyer-supplies-top.jpg) · [2번 화면](screens/buyer-supplies-selected.jpg)

<a id="B12"></a>

## B12 · P3 · 시연 이미지가 상품의 색상·무늬와 맞지 않아 화면 해석을 방해한다

- 경로: 홈·자투리 목록·`/buyer/fabrics/fabric-scrap-1`.
- 재현: 블루 스트라이프 코튼의 사진 영역과 소재/색상 설명 비교.
- 관찰: 상품 이름/색상은 블루 스트라이프인데 주 이미지는 베이지 격자다. 상세 썸네일에는 서로 다른 색·질감(그린 체크 포함)이 같은 원단의 사진처럼 배치된다. 스크린리더 이름에는 ‘질감 예시’가 있으나 사진 위에는 예시라는 시각 표기가 없다.
- 영향: 시연임을 알더라도 어떤 사진이 해당 상품을 나타내는지 혼란스럽고, 색상 필터와 상세의 일관성을 평가하기 어렵다.
- 제안: 실제 사진이 준비되기 전에도 상품의 이름·색상과 맞는 임시 이미지를 사용하거나 사진에 ‘질감 예시’를 표시한다. 다른 종류의 원단을 동일 상품의 대체 사진처럼 보이지 않게 한다.
- 증거: 직접 확인. [buyer-detail.jpg](screens/buyer-detail.jpg), [buyer-list.jpg](screens/buyer-list.jpg). 실제 서버 사진 오류라고 주장하는 항목은 아니다.

화면 증거: [1번 화면](screens/buyer-detail.jpg) · [2번 화면](screens/buyer-list.jpg)
