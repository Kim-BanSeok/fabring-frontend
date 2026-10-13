# 공장 지도 팀 연결 안내

프론트 작업 브랜치는 `feature/naver-factory-map`, 백엔드 작업 브랜치는 `feature/factory-data-preparation`입니다. 각각 main 대상 PR로 검토하며, 백엔드 변경과 공장 데이터 적재가 먼저 필요합니다. [백엔드 팀 인계 안내](https://github.com/goduckTeam/backEnd/blob/feature/factory-data-preparation/docs/factories/TEAM_HANDOFF.md)에 DB 확인과 적재 명령을 정리했습니다.

현재 PC에서 확인한 지도는 `127.0.0.1:3000`의 로컬 API → `127.0.0.1:54329/material_loop_local`의 로컬 PostgreSQL을 사용합니다. 프론트 소스를 GitHub에 올려도 이 DB나 네이버 키가 다른 팀원에게 자동 전달되지는 않습니다.

팀 공용 API가 준비되면 로컬 `.env.local`에 아래 값을 설정하고 Vite를 재시작합니다. `API_PROXY_TARGET`은 `/api/v1`을 제외한 팀 API의 기본 주소입니다.

```dotenv
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=https://TEAM_API_HOST
VITE_NAVER_MAPS_CLIENT_ID=WEB_DYNAMIC_MAP_CLIENT_ID
```

배포 프론트는 `VITE_API_BASE_URL`에 팀 API의 `/api/v1` 주소를 넣거나 같은 출처의 `/api` 프록시를 배포 서버에 구성하고 다시 빌드합니다. API의 CORS 설정에는 프론트 주소를 포함합니다. 네이버 Application에는 실제 프론트 도메인을 등록합니다. 프론트에는 Client ID만 설정하고 Secret·DB 비밀번호는 넣지 않습니다.

공용 DB의 ID는 로컬 ID와 다를 수 있습니다. API 응답의 실제 ID로 목록과 상세 링크를 생성하므로 로컬 `selected=2860` 같은 검증 주소를 팀 환경의 업체 ID로 고정하지 않습니다. 정상 적재 기준은 원본 2,925행·업체 그룹 2,919개·부자재 후보 28곳·고유 주소와 마커 26개입니다.

공용 DB의 접속 주소·계정·TLS 요구사항이 현재 저장소에 없으므로 실제 팀 DB 전환은 아직 수행하지 않았습니다. 로컬 화면에서 팀의 데이터를 함께 사용하는 데 필요한 것은 기존 팀 API 또는 팀 DB의 정확한 접속 정보입니다.

인계 전 확인: 지도·라우팅 관련 32개 테스트와 빌드 통과, lint 신규 경고 없음(기존 판매자 음성 화면 경고 5개). 전체 테스트는 392개 중 390개 통과하고, 이번 변경에 포함되지 않은 기존 원단 길이 검사 2건(`domain.test.js`, `seller-fabric-api.test.js`)이 실패합니다. main 병합 전에는 기존 실패도 검토해야 합니다. 실제 DB 비밀번호와 서버 비밀값이 커밋 대상에 포함되지 않은 것을 검사했습니다.
