# MaterialLoop 프론트엔드 개발 환경

> 최초 설치 당시의 과거 기록입니다. 아래의 Vite 예제·API 미구현·설치 버전·원격 저장소 미연결 설명은 현재 상태가 아닙니다. 현재 실행 방법과 구현 범위는 [README](../README.md), 고정 의존성은 `package-lock.json`을 확인하세요.

2026-10-11에 준비한 React + Vite + JavaScript 기본 프로젝트입니다. 현재 화면은 공식 Vite 예제이며, 실제 서비스 화면이나 API 연동은 아직 구현하지 않았습니다.

## 실행

PowerShell에서:

```powershell
cd C:\Users\home\claude-work\team-yangju\frontend
npm.cmd run dev
```

터미널에 표시되는 로컬 주소를 엽니다. 기본 주소는 http://localhost:5173이며, 포트가 사용 중이면 다른 포트가 표시될 수 있습니다. 종료는 Ctrl+C입니다. npm.cmd를 사용하면 PowerShell의 npm 스크립트 실행 정책 문제를 피할 수 있습니다.

## 환경과 명령

- 준비한 환경: Node.js 24.18.0 / npm 11.16.0
- 설치된 주요 패키지: React 19.3.0 / React DOM 19.3.0 / Vite 8.3.4
- 개발 서버: `npm.cmd run dev`
- 프로덕션 빌드: `npm.cmd run build` → dist/
- 코드 검사: `npm.cmd run lint` (Oxlint)
- 빌드 결과 확인: `npm.cmd run preview`
- 다른 PC에서 동일 의존성 설치: `npm.cmd ci`

package-lock.json은 팀에 공유하고, node_modules/와 dist/는 공유하지 않습니다. React는 이 프로젝트의 의존성으로 설치되어 있으며 전역 설치는 필요하지 않습니다.

## 다음 작업 범위

계획한 순서는 **Figma 마무리 → HTML/CSS 화면 구현 → React 컴포넌트 전환 → API 연결**입니다. 이 폴더는 React 단계에서 사용할 실행 환경을 미리 준비한 것입니다.

- 진입점: src/main.jsx
- 기본 컴포넌트: src/App.jsx
- 스타일: src/App.css, src/index.css
- 현재 API 호출, 인증, 업무 상태 관리, 라우팅, 업로드: 미구현
- [최신 Figma 전체 흐름 작업본 — 사용자 지정 기준 링크](https://www.figma.com/design/uYO6eu041WwmEBKAfA7a6Y/%EC%96%91%EC%A3%BC-%EC%84%AC%EC%9C%A0-%EB%A3%A8%ED%94%84-%C2%B7-%EC%B5%9C%EC%A2%85-%EC%99%80%EC%9D%B4%EC%96%B4%ED%94%84%EB%A0%88%EC%9E%84-UI-%EB%94%94%EC%9E%90%EC%9D%B8?node-id=0-1&t=1NDee4BtM4GBV4aI-1)
- [백엔드 저장소](https://github.com/goduckTeam/backEnd)
- [팀 API 명세 v0.3](https://github.com/goduckTeam/backEnd/blob/main/docs/API_%EB%AA%85%EC%84%B8%EC%84%9C_v0.3.md)

최신 요구사항 v2, API 명세 v0.3, Figma 클릭점검 보고서를 대조해 구현합니다. 기존 output/material-loop-prototype의 HTML/JavaScript는 이전 기획의 데모이므로 최신 요구사항과 대조한 뒤 재사용합니다.

백엔드 기본 포트는 3000이고 개발 CORS 기본 허용 주소는 http://localhost:5173입니다. API 연동 시 서버 설정과 개발 서버 주소를 맞춰야 합니다. 실제 서버 접속과 인증은 아직 검증하지 않았습니다.

자료는 상위 폴더의 `양주시 공모전` 하나로 통합했습니다. 2026-10-11에 분리되어 있던 NFD 폴더의 파일 83개를 옮기고, 모든 파일의 SHA256 일치를 검증했습니다. 이름·내용 충돌은 없었으며, 기존 Git 메타데이터도 유지했습니다. 통합 기록은 상위 폴더의 `.maintenance/folder-merge-2026-10-11.json`에 있습니다. frontend는 자료의 Git 저장소와 별도 위치에 있으며, 팀 프론트엔드 원격 저장소는 아직 연결하지 않았습니다.

## 2026-10-11 연동 준비 점검

최초 점검한 Figma 전체 흐름 페이지(node 122:12)에는 화면·결과·오류·안내를 포함한 데스크톱 프레임 163개가 있었습니다. 이후 사용자가 지정한 기준 링크는 위의 node-id=0-1 주소입니다. 점검 당시 고정 Mock 시나리오였으며, 실제 서버 저장·인증·업로드·AI 실행이 완료된 상태는 아니었습니다.

백엔드 main 02f63bb를 확인한 결과, 명세의 업무 API 47개 중 회원 4개·매장 4개·원단 직접등록 1개가 구현되어 있습니다. health는 별도입니다. 원단 목록·상세, 예약, 관리자 승인, 추천·AI 등은 연동 대기입니다. 저장소는 현재 비공개이며 팀 접근 권한이 필요합니다.

| 화면 연동 협의안의 표현 | API v0.3 / 현재 코드 기준 |
| --- | --- |
| storeConfigured | hasStore |
| REMNANT | SCRAP |
| RECEIVED | PICKED_UP |
| 원단 APPROVED | POSTED (판매자 승인에는 APPROVED 사용) |

신규 판매자는 PENDING으로 가입되며, 승인 전 원단 등록이 차단됩니다. 관리자 승인 처리 API는 아직 없으므로 팀에서 승인 API 또는 승인된 시연 계정을 준비해야 합니다. Figma의 이메일·비밀번호 변경 화면도 현재 내 정보 수정 API(닉네임·전화번호)와 범위가 다릅니다. 이 항목들은 이후 팀과 정렬할 내용이며 이번에 백엔드를 수정하지 않았습니다.

개발 환경 검증: 프로덕션 빌드, Oxlint, 개발 서버 HTML/JS 모듈 HTTP 200 응답, React 서버 렌더링을 확인했습니다. 실제 서비스 화면과 백엔드 통합 테스트는 아직 수행하지 않았습니다.

## 공식 참고 자료

- [React의 기본 앱 구성 안내](https://react.dev/learn/build-a-react-app-from-scratch)
- [Vite 시작 안내와 Node.js 요구사항](https://vite.dev/guide/)
