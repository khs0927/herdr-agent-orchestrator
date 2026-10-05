#!/usr/bin/env bash
set -Eeuo pipefail

COMMAND="${1:-help}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}
need herdr
need jq

get_target() {
  local kind="$1"
  herdr agent list | jq -r --arg k "$kind" '.result.agents[] | select(.agent == $k) | .pane_id' | head -n 1
}

# Aside dedicated pane (formerly claude pane w1:p2)
ASIDE_PANE="w1:p2"

case "$COMMAND" in
  broadcast|all)
    PROMPT="${2:-}"
    if [ -z "$PROMPT" ]; then
      echo "사용법: $0 broadcast \"지시할 프롬프트 내용\""
      exit 1
    fi
    echo "=========================================================="
    echo "🚀 [4대 에이전트/도구 병렬 호출 시작]"
    echo "프롬프트: $PROMPT"
    echo "=========================================================="

    OPENCODE_PANE="$(get_target opencode)"
    CODEX_PANE="$(get_target codex)"
    AGY_PANE="$(get_target agy)"

    pids=()

    # 1. Antigravity (기획/설계)
    if [ -n "$AGY_PANE" ]; then
      (
        echo "[agy-planner] 전송 중..."
        herdr agent prompt "$AGY_PANE" "[기획/설계 관점] $PROMPT" --wait --timeout 300000 >/dev/null 2>&1 || true
        echo "✅ [agy-planner 기획 분석 완료]"
      ) &
      pids+=($!)
    fi

    # 2. OpenCode (구현/코드 작성)
    if [ -n "$OPENCODE_PANE" ]; then
      (
        echo "[opencode-builder] 전송 중..."
        herdr agent prompt "$OPENCODE_PANE" "[구현/코드 관점] $PROMPT" --wait --timeout 300000 >/dev/null 2>&1 || true
        echo "✅ [opencode-builder 작업 완료]"
      ) &
      pids+=($!)
    fi

    # 3. Codex (테스트/검증)
    if [ -n "$CODEX_PANE" ]; then
      (
        echo "[codex-test] 전송 중..."
        herdr agent prompt "$CODEX_PANE" "[테스트/검증 관점] $PROMPT" --wait --timeout 300000 >/dev/null 2>&1 || true
        echo "✅ [codex-test 검증 완료]"
      ) &
      pids+=($!)
    fi

    # 4. Aside Browser CLI (웹 탐색/브라우저 작업)
    if [ -n "$ASIDE_PANE" ]; then
      (
        echo "[aside-browser] 브라우저 명령 전달 중..."
        herdr pane run "$ASIDE_PANE" "$PROMPT" >/dev/null 2>&1 || true
        echo "✅ [aside-browser 명령 전달 완료]"
      ) &
      pids+=($!)
    fi

    for pid in "${pids[@]}"; do
      wait "$pid" || true
    done

    echo ""
    echo "🎉 모든 에이전트/브라우저 작업 완료! 터미널 창을 확인하세요."
    ;;

  aside)
    PROMPT="${2:-}"
    if [ -z "$PROMPT" ]; then
      echo "사용법: $0 aside \"브라우저 작업 지시 내용\""
      exit 1
    fi
    echo "🌐 Aside 브라우저 세션에 직접 명령 전송 중: $PROMPT"
    herdr pane run "$ASIDE_PANE" "$PROMPT"
    ;;

  pipeline)
    PROMPT="${2:-}"
    if [ -z "$PROMPT" ]; then
      echo "사용법: $0 pipeline \"구현할 기능 설명\""
      exit 1
    fi
    echo "=========================================================="
    echo "🔄 [4단계 에이전트 파이프라인 (Aside 브라우저 연계)]"
    echo "목표: $PROMPT"
    echo "=========================================================="

    OPENCODE_PANE="$(get_target opencode)"
    CODEX_PANE="$(get_target codex)"
    AGY_PANE="$(get_target agy)"

    # Step 1: 기획 (Antigravity)
    echo "👉 [Step 1] Antigravity(agy)에게 아키텍처 및 구현 계획 수립 요청..."
    herdr agent prompt "$AGY_PANE" "다음 목표에 대한 명확한 구현 계획과 단계별 작업 목록을 작성해줘: $PROMPT" --wait --timeout 300000

    # Step 2: 웹/브라우저 리서치 (Aside CLI)
    echo "👉 [Step 2] Aside 브라우저 세션을 통해 관련 자료/웹 상태 탐색 지시..."
    herdr pane run "$ASIDE_PANE" "$PROMPT 관련 웹 정보 탐색"

    # Step 3: 코드 구현 (OpenCode)
    echo "👉 [Step 3] OpenCode에게 코드 작성 및 빌드 요청..."
    herdr agent prompt "$OPENCODE_PANE" "계획과 리서치 결과를 바탕으로 코드를 구현해: $PROMPT" --wait --timeout 600000

    # Step 4: 테스트 및 검증 (Codex)
    echo "👉 [Step 4] Codex에게 테스트 작성 및 실행 검증 요청..."
    herdr agent prompt "$CODEX_PANE" "현재 변경사항에 대해 단위 테스트를 작성하고 실행해줘." --wait --timeout 300000

    echo "🏆 파이프라인 완수!"
    ;;

  status)
    herdr agent list
    echo ""
    echo "Aside Browser Pane ($ASIDE_PANE) 상태:"
    herdr pane read "$ASIDE_PANE" | tail -n 8
    ;;

  *)
    echo "Herdr 4-에이전트 오케스트레이터 (OpenCode + Codex + Antigravity + Aside CLI)"
    echo "사용법:"
    echo "  $0 broadcast \"<프롬프트>\" : 4개 에이전트에 동시 지시 (병렬)"
    echo "  $0 aside \"<웹 작업>\"       : Aside 브라우저 창에 단독 지시"
    echo "  $0 pipeline \"<목표>\"       : 기획 -> 브라우저탐색 -> 구현 -> 테스트"
    echo "  $0 status                  : 전체 상태 확인"
    ;;
esac
