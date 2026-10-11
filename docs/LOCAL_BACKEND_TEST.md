# 로컬 백엔드 실행과 인증 검증

2026-10-11에 현재 React 화면 → Vite 프록시 → Express → PostgreSQL 경로로 실제 회원가입·로그인을 확인했습니다. 백엔드 소스와 프론트 화면 배치는 변경하지 않았습니다. 백엔드 저장소 기준은 [`e177ea685a6588e39b58c75e04b513abd888785f`](https://github.com/goduckTeam/backEnd/tree/e177ea685a6588e39b58c75e04b513abd888785f)입니다.

## 현재 PC에 준비된 환경

| 항목 | 설정 |
| --- | --- |
| 프론트 | http://127.0.0.1:5173, `/api` 요청을 백엔드로 프록시 |
| 백엔드 | http://127.0.0.1:3000/api/v1 |
| 상태 확인 | http://127.0.0.1:3000/api/v1/health |
| PostgreSQL | 17.11, 127.0.0.1:54329 |
| 개발 DB | `material_loop_local` |
| 자동 테스트 DB | `material_loop_local_test` — 개발 계정과 분리 |
| 런타임 | Node.js 24.18.0, Windows용 PostgreSQL 바이너리 |

워크스페이스 `team-yangju` 아래 `frontend`, `backend-local`, `.local-runtime`, `.maintenance/local-backend`를 사용합니다. PostgreSQL은 [공식 Windows 다운로드 안내](https://www.postgresql.org/download/windows/)에서 연결하는 [EDB 바이너리](https://www.enterprisedb.com/download-postgresql-binaries)를 설치했습니다. 시스템 서비스나 전역 PATH에는 등록하지 않았고, DB와 백엔드는 이 PC의 루프백 주소에서만 요청을 받습니다.

DB 비밀번호와 JWT 비밀키는 임의 생성하여 `backend-local/.env`에 저장했습니다. 이 파일은 백엔드 Git에서 제외됩니다. 인증 테스트에는 메일·AI·클라우드 서비스 키가 필요하지 않아 **현재 추가로 준비할 설정은 없습니다.** 배포 주소·운영 환경 키는 별도입니다.

## 재실행과 종료

현재 백엔드와 DB는 실행 상태로 남겨두었습니다. PC 재부팅 후에는 자동으로 시작되지 않으므로, **이 PC의 `team-yangju` 폴더**에서 PowerShell로 실행합니다.

```powershell
# DB와 백엔드를 숨김 프로세스로 실행
.\.maintenance\local-backend\start.ps1

# 프론트가 꺼져 있으면 별도 터미널에서 실행
cd frontend
npm.cmd run dev
```

DB와 백엔드를 종료할 때는 `team-yangju` 폴더에서 실행합니다. 계정과 DB 파일은 유지됩니다.

```powershell
.\.maintenance\local-backend\stop.ps1
```

종료 → 재실행 후 API 상태 200과 구매자 2명·판매자 2명 유지까지 확인했습니다. 실행 로그는 `.local-runtime/backend-stdout.log`, `.local-runtime/backend-stderr.log`, `.local-runtime/postgres/server.log`에서 확인할 수 있습니다.

이 스크립트는 현재 워크스페이스의 설치된 DB를 실행하는 도구입니다. 프론트 저장소만 복제한 다른 PC에 DB를 자동 설치하지는 않습니다. 다른 PC에서는 [백엔드 README](https://github.com/goduckTeam/backEnd#readme)의 설치·DB 생성·마이그레이션 절차를 따라 서버를 준비하고, 프론트 `.env.example`의 API 주소를 맞춥니다. 백엔드는 `.env`를 읽는 실행 명령이 필요합니다.

## 직접 화면 확인

- [전체 흐름](http://127.0.0.1:5173/#/preview)에서 **구매자/판매자 시작**이나 회원가입을 선택하면 실제 API를 사용합니다. **시연 시작**과 화면 목록은 예시 데이터입니다.
- [실제 구매자 로그인](http://127.0.0.1:5173/#/auth/buyer/login?mode=live), [실제 판매자 가입](http://127.0.0.1:5173/#/auth/seller/signup?mode=live)으로 바로 열 수도 있습니다.
- 새 테스트 계정을 가입하거나 `.local-runtime/auth-accounts.local.json`에 보관한 이번 테스트 계정을 사용할 수 있습니다. 이 파일의 이메일·비밀번호는 로컬 확인용이며 Git에 올리지 않습니다.
- 신규 판매자는 로그인 후 매장 입력 화면으로 이동합니다. 매장 저장은 아직 API에 연결되지 않았으므로 저장 완료까지 진행할 수는 없습니다.

## 검증 결과와 범위

- 백엔드 `npm run lint`와 자동 테스트 **168개 통과**. 자동 테스트는 별도 DB와 업로드 폴더를 사용했습니다.
- 실제 브라우저·DB 확인 **182개 항목 통과**, 실패·브라우저 오류 0. 모바일 390×844, 데스크톱 1440×900에서 구매자·판매자 총 4계정을 실제 생성했습니다.
- 필수 동의, 가입 201, 로그인 200, `/users/me`, 새로고침 인증 복구, 로그아웃, 보호 화면 접근 차단, 중복 가입 409, 잘못된 비밀번호 401을 확인했습니다.
- DB에 저장된 역할·계정과 화면을 대조했고, 비밀번호가 bcrypt 해시로 저장되고 입력값과 일치하는지 확인했습니다. DB 검증은 SELECT만 사용했습니다.

자세한 결과와 화면은 [실서버 검증 기록](qa/local-backend-2026-10-11/README.md)에 있습니다. 기존 계약 검증의 응답 대역과 구분하여, 이번 검증은 실제 서버·DB 응답을 사용했습니다. 매장 보유 판매자 조회 분기는 기존 계약 테스트로만 확인했으며, 실제 관리자 로그인·배포 환경·원단·예약·문의·프로필 수정·매장 저장은 이번 실서버 검증 범위 밖입니다.

백엔드 검사를 다시 실행할 때는 DB를 실행한 뒤 아래 도구를 사용합니다. 테스트가 테스트 DB를 초기화하므로 반드시 개발 DB와 분리합니다. 이미지 테스트가 업로드 폴더를 삭제하기 때문에 이 도구는 전용 `backend-test-uploads` 경로도 지정합니다.

```powershell
# team-yangju 폴더 기준
.\.maintenance\local-backend\test.ps1
```

## 나중에 Frontend 저장소에 올릴 범위

[goduckTeam/Frontend](https://github.com/goduckTeam/Frontend)에는 **현재 테스트한 React 프론트엔드 전체**를 기준으로 올리면 됩니다. 인증 API 호출 코드도 프론트엔드의 일부이므로, 연결 전 HTML 버전으로 돌아갈 필요가 없습니다. 로컬 백엔드 검증을 마친 시점에는 저장소가 비어 있었으며, 이 문서의 검증 작업과 이후 프론트 커밋·푸시는 별도 작업입니다.

- 포함: `src`, `public`, `tests`, `index.html`, `html-reference.html`, `package.json`, `package-lock.json`, Vite·lint 설정, `.gitignore`, `.env.example`, README와 필요한 문서.
- `src/prototype`는 React가 CSS·데이터·도메인 로직을 공유하므로 유지합니다. HTML 비교본도 현재 빌드 진입점에 포함되어 있습니다.
- 제외: `node_modules`, `dist`, 실제 `.env`·`.env.local`, 비밀번호·토큰·로그, `backend-local`, `.local-runtime`, 워크스페이스의 `.maintenance`, 기획 원본 폴더.
- 누적 QA 스크린샷은 용량이 크므로 업로드 직전에 보고서와 대표 화면을 중심으로 포함 범위를 정할 수 있습니다. 현재 로컬 기록은 보존했습니다.

프론트 저장소의 루트는 `frontend` 폴더 내용으로 잡습니다. 인증 이후 업무 API는 이 버전에서 이어서 연결하면 됩니다.
