# Herdr Multi-Agent Orchestrator 🚀

Herdr 기반의 4대 AI 코딩 에이전트(Antigravity, OpenCode, Codex, Aside Browser) 병렬 협업 및 통합 오케스트레이션 환경 구성 저장소입니다.

---

## 🏛 아키텍처 개요

Herdr 터미널 멀티플렉서를 중심 제어 버스로 삼아 각 에이전트의 상태를 감지하고, 단일 프로젝트 워크스페이스에서 기획, 구현, 검증, 웹 탐색을 유기적으로 연계합니다.

```
                  ┌───────────────────────────────┐
                  │    Herdr Terminal Server      │
                  │        (IPC / Sockets)        │
                  └──────────────┬────────────────┘
                                 │
         ┌──────────────┬────────┴─────┬──────────────┐
         ▼              ▼              ▼              ▼
   [Pane 1 (w1:p1)] [Pane 2 (w1:p2)] [Pane 3 (w1:p3)] [Pane 4 (w1:p4)]
     OpenCode         Aside CLI         Codex       Antigravity
   (구현/빌드)     (웹 브라우징)    (테스트/검증)   (기획/설계)
```

---

## 📁 디렉토리 구조

```
herdr-agent-orchestrator/
├── config/
│   ├── config.toml           # Herdr 설정 (UI, 테마, 글로벌 복사 단축키 매핑)
│   └── plugins.json          # 설치 플러그인(Jump, File Viewer 등) 메타데이터
├── hooks/
│   └── herdr-agent-state.sh  # 에이전트 상태(working/idle/blocked) 보고 훅
├── integrations/
│   ├── herdr-agent-state.js  # OpenCode 전용 Herdr 상태 플러그인
│   ├── herdr-tui-session.js  # OpenCode TUI 세션 트래킹
│   └── tui.js                # TUI 브릿지
├── scripts/
│   ├── setup-ai-team.sh      # 4분할 패널 레이아웃 구성 및 에이전트 자동 기동
│   ├── orchestrate-team.sh   # 4대 에이전트 동시 브로드캐스트 / 순차 파이프라인
│   └── test-aside.sh         # Aside 브라우저 및 MCP 연동 상태 테스트
├── skills/
│   └── herdr/
│       └── SKILL.md          # Agent Skill 규격 (Herdr CLI/API 제어 프로토콜)
├── tools/
│   ├── agent-copy            # 터미널 단축 클립보드 복사 CLI
│   ├── aside-tui.mjs         # Aside 브라우징 전용 대화형 터미널 TUI 제어기
│   ├── copier-server.mjs     # 원클릭 복사기 웹 GUI 백엔드 서버 (포트 4789)
│   └── load-aside-models.py  # 로컬 Aside 모델 카탈로그 파서
└── ui/
    └── ai-team-copier.html   # 원클릭 실시간 답변 모니터링 및 복사 웹 UI
```

---

## ⚡ 빠른 시작 (Quick Start)

### 1. 전제 조건
- [Herdr](https://github.com/cloudmanic/herdr) CLI 설치 (`herdr`)
- 에이전트 CLI 도구들: `opencode`, `codex`, `agy` (Antigravity), `aside`, `jq`

### 2. 에이전트 팀 워크스페이스 세팅
새 프로젝트 디렉토리 또는 현재 워크스페이스에서 4분할 화면을 구성하고 에이전트들을 기동합니다:

```bash
# 기본 사용법: ./scripts/setup-ai-team.sh <프로젝트경로> [라벨이름]
./scripts/setup-ai-team.sh ./my-new-project "ai-team"
```

실행 시 다음 패널 배치가 생성됩니다:
- `w1:p1`: **OpenCode** (구현/코드 작성)
- `w1:p2`: **Aside Browser** (웹 서핑/브라우징 작업)
- `w1:p3`: **Codex** (테스트 및 검증)
- `w1:p4`: **Antigravity** (아키텍처 및 기획)

### 3. 멀티 에이전트 오케스트레이션

#### 동시 브로드캐스트 (Parallel Execution)
4개 에이전트에 동일한 지시를 각자의 역할 관점(기획/구현/테스트/자료조사)으로 병렬 전송합니다:
```bash
./scripts/orchestrate-team.sh broadcast "사용자 인증 기능 구현 및 보안 점검"
```

#### 단계별 협업 파이프라인 (Sequential Pipeline)
`기획(Antigravity) ➔ 웹리서치(Aside) ➔ 구현(OpenCode) ➔ 테스트(Codex)` 순서로 체인 작업을 자동 실행합니다:
```bash
./scripts/orchestrate-team.sh pipeline "OAuth2 소셜 로그인 API 연동"
```

### 4. 답변 수집 및 복사 도구

- **터미널 단축키**:
  - `Ctrl + Y`: 현재 포커스된 패널의 최근 답변을 즉시 클립보드에 복사
  - `Prefix (Ctrl + B) -> C`: 4개 에이전트 전체 답변을 한 번에 복사
- **CLI 명령**:
  ```bash
  agent-copy all        # 4개 에이전트 전체 답변 취합 복사
  agent-copy opencode   # OpenCode 답변만 복사
  agent-copy gui        # 웹 GUI 실행 및 브라우저 열기
  ```
- **웹 GUI 실행**:
  ```bash
  node tools/copier-server.mjs
  # 브라우저에서 http://127.0.0.1:4789 접속
  ```

---

## 🛠 설정 가이드

### Herdr 설정 반영
`config/config.toml` 파일을 `~/.config/herdr/config.toml`로 복사하거나 심링크하여 테마 색상 및 글로벌 단축키를 적용합니다.

```bash
mkdir -p ~/.config/herdr
cp config/config.toml ~/.config/herdr/config.toml
```

### CLI 도구 등록
`tools/agent-copy`를 PATH 환경변수에 등록해 전역에서 호출할 수 있도록 설정합니다:
```bash
cp tools/agent-copy ~/.local/bin/agent-copy
chmod +x ~/.local/bin/agent-copy
```

---

## 📜 라이선스

MIT License.
