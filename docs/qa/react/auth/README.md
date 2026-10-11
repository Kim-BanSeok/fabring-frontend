# React 인증 화면 검증

검증일: 2026-10-11. 최신 UX 수정 HTML의 인증 화면을 `src/react/pages/AuthPage.jsx`와 `auth-state.js`로 전환했다. 기존 CSS·문구·Figma 노드·주소·폼 이름을 유지했다. JSX와 controlled input을 사용하며 기존 HTML render/bind 또는 `dangerouslySetInnerHTML`을 호출하지 않는다.

- `regression-after.json`: Chrome의 실제 클릭 회귀 14개 통과. 390×844와 1440×1050의 세 역할 로그인, 오류 복귀, 약관 동의, 가입 완료, 판매자 최초 로그인, 직접/새로고침 처리 화면 복구, 시연 화면 복구를 확인했다.
- `console-regression.json`: 네트워크 오류 입력 보존, 서비스별 시연 입력 격리, 구매자 약관 네 가지 노드, 세션 만료 복구 4개 통과. page error와 console error 모두 0개. 이 검사는 Vite 연결을 유지했다.
- `state-regression.json`: StrictMode의 effect 재연결을 재현해 API 요청과 완료 콜백이 각각 1회임을 확인했다. 처리 이탈 취소, 초기화/로그아웃의 draft 제거, 서로 다른 서비스의 입력·오류 격리까지 4개 통과.
- `AuthPage.jsx`, `auth-state.js` oxlint 경고·오류 0개.

모바일 로그인 버튼 하단은 구매자·관리자 590px, 판매자 624px로 첫 844px 화면에 들어온다. 로고는 28×28px이며 가로 넘침은 없다. 데스크톱 브랜드 패널은 기존 572×720px, 폼 시작점은 158px이다. 구매자 모바일 및 판매자 데스크톱 캡처를 시각 확인했다.

처리 결과는 history replace로 이동한다. 로그인·가입 성공 후 비밀번호 초안을 지우며, 입력 비밀번호는 브라우저 영구 저장소에 저장하지 않는다. 실제 백엔드 인증 검증은 포함하지 않고 기존 로컬 mock API로 검사했다. 기존 HTML QA 결과는 변경하지 않았다.
