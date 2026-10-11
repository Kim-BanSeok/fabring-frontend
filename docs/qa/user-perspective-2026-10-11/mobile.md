# 모바일 · 이용자 관점 검토

[전체 보고서](README.md) · [필터로 보기](index.html)

검토 2026-10-11~12. 우선순위와 검증 범위는 전체 보고서를 따른다. 이미지는 당시 실행 화면이며, 업무 상태 변경은 격리된 시연에서 확인했다.

<a id="M01"></a>

## M01 · P2 · 상단 메뉴와 소개 문구가 첫 화면을 많이 차지한다

- 경로: `/buyer/home`, 구매자·판매자 공통 헤더.
- 관찰: 390×844에서 로고·역할 표시·6개 메뉴가 3열×2행으로 배치되어 헤더만 약 179px이다. 구매자 홈은 페이지 소개와 홍보 카드가 이어지고 첫 상품은 아래에 나타난다.
- 영향: 처음 방문한 소비자가 실제 원단을 보기 전에 메뉴와 비슷한 소개 문구를 먼저 지나야 한다. 매 화면에서 같은 높이를 반복해서 차지한다.
- 개선: 모바일 헤더와 주요 메뉴를 압축하고 나머지 메뉴도 쉽게 찾을 수 있게 한다. 홈 소개는 짧은 한 묶음으로 정리해 상품 탐색 시작점을 올린다. 메뉴 삭제나 새로운 하단 내비게이션을 반드시 추가하라는 의미는 아니다.
- 증거: [mobile-buyer-home.jpg](screens/mobile-buyer-home.jpg), [mobile-fabric-list.jpg](screens/mobile-fabric-list.jpg).

화면 증거: [1번 화면](screens/mobile-buyer-home.jpg) · [2번 화면](screens/mobile-fabric-list.jpg)

<a id="M02"></a>

## M02 · P2 · 원단 목록 첫 화면에 원단이 보이지 않는다

- 경로: `/buyer/fabrics` 기본 목록.
- 관찰: 390×844, 스크롤 0에서 펼쳐진 필터 양식 높이가 약 480px이며 첫 상품 시작은 약 y953이다. 헤더·설명·판매 형태 탭·세 필터가 먼저 나온다.
- 영향: ‘원단 목록’에 들어왔는데 상품을 먼저 볼 수 없다. 조건을 모르고 둘러보려는 소비자도 먼저 긴 검색 양식을 지나야 한다.
- 개선: 모바일 초기 필터는 접거나 한 줄 요약으로 시작하고 선택 조건·결과 수와 상품을 먼저 보여준다. 필터를 접어도 상품 사진은 유지해야 한다.
- 함께 수정: B04는 접거나 검색할 때 상품 이미지가 없어지는 별도의 동작 문제다. 필터 높이만 줄여서는 해결되지 않는다.
- 증거: [mobile-fabric-list.jpg](screens/mobile-fabric-list.jpg), [mobile-filter-collapsed.jpg](screens/mobile-filter-collapsed.jpg); DOM 위치 측정.

화면 증거: [1번 화면](screens/mobile-fabric-list.jpg) · [2번 화면](screens/mobile-filter-collapsed.jpg)

<a id="M03"></a>

## M03 · P2 · 원단 상세에서 가격과 픽업 행동을 만나기까지 길다

- 경로: `/buyer/fabrics/fabric-scrap-1`.
- 관찰: 390×844에서 큰 사진 약 290px, 썸네일 약 84px, 반복되는 페이지 제목·상품 이름이 먼저 나온다. 가격은 첫 화면 아래이고 ‘픽업 요청하기’는 약 y1210이다.
- 영향: 사진은 잘 보이지만 구매 여부를 결정하는 가격·단위·위치와 다음 행동을 함께 비교하기 어렵다.
- 개선: 상품 이름 가까이에 가격·판매 단위·위치 요약을 배치하고 중복 제목·썸네일 높이를 줄인다. 필요하면 주요 행동을 하단에 유지하되 내용·오류·안전 영역을 가리지 않게 한다.
- 증거: [mobile-fabric-detail-top.jpg](screens/mobile-fabric-detail-top.jpg); 버튼 위치 DOM 측정.

화면 증거: [1번 화면](screens/mobile-fabric-detail-top.jpg)

<a id="M04"></a>

## M04 · P2 · 판매자 등록은 사진 영역이 길어 기본 입력 시작이 늦다

- 경로: `/seller/register/manual?type=ROLL`의 직접 등록 시연.
- 관찰: 390×844에서 첫 원단명 입력은 약 y1154, 전체 페이지는 약 2748px이다. 사진 확인은 y2426, 등록 내용 확인은 y2502 부근이다. 큰 사진 슬롯들이 기본 항목보다 앞에 이어진다.
- 영향: 이름·치수·가격을 빠르게 입력하기 어렵고, 사진과 입력 내용을 오갈 때 긴 왕복이 생긴다.
- 개선: 사진 선택 영역을 작은 미리보기와 선택 상태 중심으로 압축한다. 섹션 순서·진행 위치를 명확히 하고 검토 후 돌아오는 스크롤 위치를 보존한다. 필요한 경우 검토 행동을 가까이 유지한다.
- 함께 수정: S04는 별도 사진 확인 화면에서 양식 처음으로 돌아오는 흐름 문제다. 모바일 높이 조정과 복귀 위치 보존을 한 묶음으로 작업한다.
- 증거: [mobile-seller-register-top.jpg](screens/mobile-seller-register-top.jpg); 전체 높이와 입력·버튼 위치 측정.

화면 증거: [1번 화면](screens/mobile-seller-register-top.jpg)

<a id="M05"></a>

## M05 · P2 · 판매자 원단 표의 상태와 상세 버튼이 휴대폰 화면 밖에 있다

- 경로: `/seller/fabrics`.
- 관찰: 390px 화면에서 표 컨테이너 너비는 약 293px, 내부 표 너비는 약 870px이다. 기본 위치에는 사진·이름 위주로 보이고 가격·상태·예약·상세보기가 오른쪽에 숨는다. 가로로 이동할 수 있다는 안내가 뚜렷하지 않다.
- 영향: 판매자가 판매 상태를 확인하거나 수정할 원단을 여는 핵심 작업을 하려면 숨은 가로 스크롤을 알아내야 한다. 페이지 전체가 넘치지 않는 것만으로 사용성이 확보되지는 않는다.
- 개선: 모바일에서는 이름·상태·핵심 수량·상세 버튼이 한 카드 안에 보이는 행으로 바꾼다. 표를 유지한다면 이름 고정, 가로 이동 안내, 핵심 행동의 접근성을 함께 설계한다.
- 증거: [mobile-seller-fabrics.jpg](screens/mobile-seller-fabrics.jpg); 컨테이너 clientWidth와 scrollWidth 확인.

화면 증거: [1번 화면](screens/mobile-seller-fabrics.jpg)

<a id="M06"></a>

## M06 · P2 · 모바일 관리자 메뉴가 실제 처리 업무를 아래로 밀어낸다

- 경로: `/admin/dashboard`, `/admin/approvals`.
- 관찰: 390×844에서 데스크톱 사이드바가 위쪽으로 쌓이며 약 255px, 추가 상단 바까지 약 319px을 차지한다. 대시보드의 첫 처리 업무 제목은 약 y774이고 승인 화면의 처리 버튼은 약 y1491이다.
- 영향: 모바일 관리자는 메뉴·역할 표시·지표를 지나야 실제 대기 업무를 볼 수 있다. 반복 심사에 불필요한 스크롤이 많다.
- 개선: 모바일 관리 헤더는 주요 메뉴와 계정 동작을 간결하게 정리하고, 대기 업무를 통계보다 앞에 배치한다. 승인 검토 요약과 행동을 가까이 두되 오클릭 확인 단계는 유지한다.
- 구분: 데스크톱 로그아웃 하단 정렬 문제는 재현되지 않았다. 모바일에서 메뉴가 차지하는 면적은 별도의 개선점이다.
- 증거: [mobile-admin-dashboard.jpg](screens/mobile-admin-dashboard.jpg), [mobile-admin-approval.jpg](screens/mobile-admin-approval.jpg).

화면 증거: [1번 화면](screens/mobile-admin-dashboard.jpg) · [2번 화면](screens/mobile-admin-approval.jpg)
