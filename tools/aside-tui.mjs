#!/usr/bin/env node
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import net from 'node:net';

// ANSI styling & 24-bit TrueColor
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  emerald: '\x1b[38;2;16;185;129m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  bgDark: '\x1b[48;2;24;24;27m',
  bgBar: '\x1b[48;2;39;39;42m',
};

// Herdr Integration: Report state to Herdr multiplexer
const HERDR_SOURCE = 'herdr:aside';
const HERDR_AGENT = 'aside';

function reportHerdr(state, message = '') {
  const paneId = process.env.HERDR_PANE_ID || 'w1:p2';
  const socketPath = process.env.HERDR_SOCKET_PATH || path.join(os.homedir(), '.config', 'herdr', 'herdr.sock');

  if (!fs.existsSync(socketPath)) return;

  const seq = Date.now() * 1000;
  const req = {
    id: `${HERDR_SOURCE}:${seq}`,
    method: 'pane.report_agent',
    params: {
      pane_id: paneId,
      source: HERDR_SOURCE,
      agent: HERDR_AGENT,
      state: state, // idle | working | blocked | unknown
      message: message,
      seq: seq,
    }
  };

  const client = net.createConnection(socketPath, () => {
    client.write(JSON.stringify(req) + '\n');
    setTimeout(() => {
      client.end();
    }, 100);
  });
  client.on('error', () => {});
}

function updateHerdrMetadata(title, displayAgent) {
  const paneId = process.env.HERDR_PANE_ID || 'w1:p2';
  const socketPath = process.env.HERDR_SOCKET_PATH || path.join(os.homedir(), '.config', 'herdr', 'herdr.sock');

  if (!fs.existsSync(socketPath)) return;

  const seq = Date.now() * 1000;
  const req = {
    id: `${HERDR_SOURCE}:meta:${seq}`,
    method: 'pane.report_metadata',
    params: {
      pane_id: paneId,
      source: HERDR_SOURCE,
      title: title,
      display_agent: displayAgent,
      seq: seq,
    }
  };

  const client = net.createConnection(socketPath, () => {
    client.write(JSON.stringify(req) + '\n');
    setTimeout(() => {
      client.end();
    }, 100);
  });
  client.on('error', () => {});
}

// Load all discovered local models
const modelsFile = path.join(os.homedir(), '.aside', 'all_installed_models.json');
let modelsByProvider = {};
try {
  if (fs.existsSync(modelsFile)) {
    modelsByProvider = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  }
} catch (e) {
  // fallback
}

// Flat model list with canonical provider-prefixed IDs
const ALL_MODELS = [];
for (const [provider, list] of Object.entries(modelsByProvider)) {
  for (const m of list) {
    let canonical = m.id;
    if (!canonical.startsWith(`${provider}/`)) {
      canonical = `${provider}/${m.id}`;
    }
    ALL_MODELS.push({
      id: canonical,
      rawId: m.id,
      name: m.name || m.id,
      provider: provider,
    });
  }
}

// Default state: Benchmarked to match OpenCode Sisyphus standard
let currentModel = 'DeepSeek V4.1 Flash';
let currentCanonicalId = 'nvidia/deepseek-ai/deepseek-v4.1-flash';
let currentProvider = 'nvidia';
let currentEffort = 'low';
let currentSpeed = 'fast';
let currentMode = 'Autonomous Web';
let totalTokens = '158.4K (16%)';

const EFFORT_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'max', 'ultrabrowse'];
const SPEED_LEVELS = ['fast', 'default'];

// OpenCode-benchmarked UI Header & Status Bar
function renderBanner() {
  console.clear();
  const width = Math.min(process.stdout.columns || 80, 85);
  const sep = '━'.repeat(width);
  const thinSep = '─'.repeat(width);

  console.log(`
${c.emerald}▣  Aside Web Agent${c.reset} ${c.dim}·${c.reset} ${c.brightCyan}${currentModel}${c.reset} ${c.dim}[${currentProvider}]${c.reset}
${c.gray}${thinSep}${c.reset}
  ${c.dim}Agent Mode:${c.reset} ${c.brightGreen}⚡ ${currentMode}${c.reset}  ${c.dim}│${c.reset}  ${c.dim}Model:${c.reset} ${c.white}${currentCanonicalId}${c.reset}
  ${c.dim}Effort:${c.reset}     ${c.yellow}${currentEffort}${c.reset}          ${c.dim}│${c.reset}  ${c.dim}Speed:${c.reset} ${c.green}${currentSpeed}${c.reset}  ${c.dim}│${c.reset}  ${c.dim}Context:${c.reset} ${c.dim}${totalTokens}${c.reset}
${c.gray}${sep}${c.reset}
  ${c.dim}Commands: ${c.cyan}/model${c.dim}, ${c.cyan}/effort${c.dim}, ${c.cyan}/speed${c.dim}, ${c.cyan}/status${c.dim}, ${c.cyan}/clear${c.dim}, ${c.cyan}/help${c.dim} · ${c.yellow}esc interrupt${c.reset}
${c.gray}${thinSep}${c.reset}
`);
}

// Initial Sync with Herdr
updateHerdrMetadata(`Aside | ${currentModel}`, `Aside · ${currentModel}`);
reportHerdr('idle', 'Ready');

renderBanner();

const COMMANDS = [
  { cmd: '/model', desc: '브라우저 조작 모델 즉시 변경 (/model <id>)' },
  { cmd: '/models', desc: '등록된 전체 모델 목록 (/models [공급자])' },
  { cmd: '/providers', desc: '연결된 모든 AI 공급자 목록 확인' },
  { cmd: '/effort', desc: '추론 강도 변경 (max, high, medium, low, off)' },
  { cmd: '/speed', desc: '응답 속도 변경 (fast, default)' },
  { cmd: '/status', desc: '현재 모델, 공급자, 추론 레벨 상태' },
  { cmd: '/clear', desc: '화면 정리 및 배너 새로고침' },
  { cmd: '/help', desc: '명령어 안내' },
  { cmd: '/exit', desc: '세션 종료' },
];

function completer(line) {
  if (line.startsWith('/model ')) {
    const query = line.slice(7).trim().toLowerCase();
    const hits = ALL_MODELS
      .filter((m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query))
      .slice(0, 30);
    return [hits.map((h) => `/model ${h.id}`), line];
  }
  if (line.startsWith('/models ')) {
    const query = line.slice(8).trim().toLowerCase();
    const providers = Object.keys(modelsByProvider);
    const hits = providers.filter((p) => p.toLowerCase().startsWith(query));
    return [hits.map((p) => `/models ${p}`), line];
  }
  if (line.startsWith('/effort ')) {
    const query = line.slice(8).trim().toLowerCase();
    const hits = EFFORT_LEVELS.filter((e) => e.startsWith(query));
    return [hits.map((e) => `/effort ${e}`), line];
  }
  if (line.startsWith('/speed ')) {
    const query = line.slice(7).trim().toLowerCase();
    const hits = SPEED_LEVELS.filter((s) => s.startsWith(query));
    return [hits.map((s) => `/speed ${s}`), line];
  }
  const hits = COMMANDS.map((c) => c.cmd).filter((c) => c.startsWith(line));
  return [hits.length ? hits : COMMANDS.map((c) => c.cmd), line];
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${c.emerald}›${c.reset} `,
  completer,
});

rl.prompt();

rl.on('line', (line) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  if (input === '/exit') {
    reportHerdr('idle', 'Exited');
    process.exit(0);
  }

  if (input === '/help') {
    console.log(`\n${c.bold}=== OpenCode 스타일 Aside 명령어 목록 ===${c.reset}`);
    COMMANDS.forEach((item) => {
      console.log(`  ${c.cyan}${item.cmd.padEnd(12)}${c.reset} : ${item.desc}`);
    });
    rl.prompt();
    return;
  }

  if (input === '/clear') {
    renderBanner();
    rl.prompt();
    return;
  }

  if (input === '/providers') {
    console.log(`\n${c.bold}현재 로컬 Aside에 등록된 공급자(Providers):${c.reset}`);
    for (const [p, ms] of Object.entries(modelsByProvider)) {
      console.log(`  • ${c.yellow}${p.padEnd(20)}${c.reset} : ${c.brightGreen}${ms.length}개 모델${c.reset}`);
    }
    console.log(`\n공급자별 모델 목록 보기: ${c.cyan}/models <공급자명>${c.reset} (예: /models nvidia)`);
    rl.prompt();
    return;
  }

  if (input.startsWith('/models')) {
    const parts = input.split(/\s+/);
    const filterProvider = parts[1] ? parts[1].toLowerCase() : null;

    let targetProviders = Object.keys(modelsByProvider);
    if (filterProvider) {
      targetProviders = targetProviders.filter(p => p.toLowerCase().includes(filterProvider));
      if (targetProviders.length === 0) {
        console.log(`\n${c.yellow}⚠ '${filterProvider}' 이름의 공급자를 찾을 수 없습니다. /providers 를 확인하세요.${c.reset}`);
        rl.prompt();
        return;
      }
    }

    console.log(`\n${c.bold}=== 등록된 모델 목록 (${targetProviders.join(', ')}) ===${c.reset}`);
    for (const p of targetProviders) {
      console.log(`\n[${c.yellow}${p}${c.reset}] (${modelsByProvider[p].length}개)`);
      modelsByProvider[p].slice(0, 20).forEach((m, idx) => {
        const canonical = m.id.startsWith(`${p}/`) ? m.id : `${p}/${m.id}`;
        const isCurrent = canonical === currentCanonicalId ? `${c.brightGreen} (선택됨)${c.reset}` : '';
        console.log(`  ${c.dim}${(idx + 1).toString().padStart(2)}.${c.reset} ${c.cyan}${canonical.padEnd(45)}${c.reset} : ${m.name}${isCurrent}`);
      });
      if (modelsByProvider[p].length > 20) {
        console.log(`  ${c.dim}... 외 ${modelsByProvider[p].length - 20}개 모델 생략${c.reset}`);
      }
    }
    console.log(`\n모델 변경 방법: ${c.cyan}/model <모델ID>${c.reset}`);
    rl.prompt();
    return;
  }

  if (input.startsWith('/model')) {
    const parts = input.split(/\s+/);
    if (parts.length === 1) {
      console.log(`
${c.bold}현재 모델:${c.reset} ${c.brightCyan}${currentModel}${c.reset} (${currentCanonicalId}) [${currentProvider}]
전체 목록: ${c.cyan}/models${c.reset}
변경: ${c.cyan}/model <모델ID>${c.reset}
`);
    } else {
      const query = parts.slice(1).join(' ').toLowerCase();
      const matched = ALL_MODELS.find(m => m.id.toLowerCase() === query)
        || ALL_MODELS.find(m => m.rawId.toLowerCase() === query)
        || ALL_MODELS.find(m => m.name.toLowerCase() === query)
        || ALL_MODELS.find(m => m.id.toLowerCase().includes(query))
        || ALL_MODELS.find(m => m.name.toLowerCase().includes(query));

      if (matched) {
        currentCanonicalId = matched.id;
        currentModel = matched.name;
        currentProvider = matched.provider;
        console.log(`\n${c.green}✔ 모델이 [${c.bold}${matched.name}${c.reset}${c.green}] (${matched.id}) [공급자: ${matched.provider}]로 변경되었습니다.${c.reset}`);
      } else {
        currentCanonicalId = parts[1];
        currentModel = parts[1];
        console.log(`\n${c.yellow}✔ 커스텀 모델 ID [${parts[1]}]가 적용되었습니다.${c.reset}`);
      }
      updateHerdrMetadata(`Aside | ${currentModel}`, `Aside · ${currentModel}`);
    }
    rl.prompt();
    return;
  }

  if (input.startsWith('/effort')) {
    const parts = input.split(/\s+/);
    if (parts.length === 1 || parts[0] === '/efforts') {
      console.log(`
${c.bold}추론 강도(Effort) 선택:${c.reset}
  현재 설정: ${c.brightGreen}${currentEffort}${c.reset}
  단계: ${EFFORT_LEVELS.join(', ')}
  변경: ${c.cyan}/effort <단계>${c.reset}
`);
    } else {
      const chosen = parts[1].toLowerCase();
      if (EFFORT_LEVELS.includes(chosen)) {
        currentEffort = chosen;
        console.log(`\n${c.green}✔ 추론 강도가 [${c.bold}${chosen}${c.reset}${c.green}]로 변경되었습니다.${c.reset}`);
      } else {
        console.log(`\n${c.yellow}⚠ 올바른 단계를 입력하세요: ${EFFORT_LEVELS.join(', ')}${c.reset}`);
      }
    }
    rl.prompt();
    return;
  }

  if (input.startsWith('/speed')) {
    const parts = input.split(/\s+/);
    if (parts.length > 1 && (parts[1] === 'fast' || parts[1] === 'default')) {
      currentSpeed = parts[1];
      console.log(`\n${c.green}✔ 실행 속도가 [${currentSpeed}]로 변경되었습니다.${c.reset}`);
    } else {
      console.log(`\n${c.yellow}변경 방법: /speed fast  또는  /speed default${c.reset}`);
    }
    rl.prompt();
    return;
  }

  if (input === '/status') {
    console.log(`
${c.bold}현재 Aside 에이전트 설정 (OpenCode 호환):${c.reset}
  • 에이전트 모드   : ${c.emerald}⚡ ${currentMode}${c.reset}
  • 모델 (Model)     : ${c.brightCyan}${currentModel}${c.reset}
  • 실행 ID (ModelID): ${c.white}${currentCanonicalId}${c.reset}
  • 공급자 (Provider): ${c.yellow}${currentProvider}${c.reset}
  • 추론 (Effort)    : ${c.brightGreen}${currentEffort}${c.reset}
  • 속도 (Speed)     : ${c.yellow}${currentSpeed}${c.reset}
  • 연결 모델 총합   : ${ALL_MODELS.length}개
`);
    rl.prompt();
    return;
  }

  // Real-time Streaming Browsing Execution with OpenCode-style Visual Indicator
  console.log(`\n  ${c.emerald}▣${c.reset}  ${c.bold}Aside Agent${c.reset} ${c.dim}·${c.reset} ${currentModel} ${c.yellow}· max${c.reset}`);
  console.log(`${c.gray}  ╹${'▀'.repeat(70)}${c.reset}`);
  console.log(`   ${c.yellow}■⬝⬝⬝⬝⬝⬝⬝${c.reset}  ${c.dim}esc interrupt                            158.4K (16%)  ctrl+p commands${c.reset}\n`);

  reportHerdr('working', input);

  const startTime = Date.now();
  const args = ['-s', currentSpeed, '--effort', currentEffort, '-m', currentCanonicalId, input];
  const asideProc = spawn('aside', args);

  let isThinking = false;
  let hasShownResultHeader = false;

  asideProc.stdout.on('data', (chunk) => {
    const str = chunk.toString();
    
    if (str.includes('Thinking:')) {
      if (!isThinking) {
        process.stdout.write(`\n  ${c.dim}⎿  [Reasoning Flow]: `);
        isThinking = true;
      }
      const cleanThinking = str.replace(/created new session:.*\n?/gi, '').replace(/Thinking:\s*/g, '');
      process.stdout.write(`${c.dim}${cleanThinking.trim()} ${c.reset}`);
      return;
    }

    if (str.startsWith('created new session:')) {
      return;
    }

    if (isThinking && !hasShownResultHeader) {
      console.log(`\n\n${c.dim}  ────────────────────────────────────────────────────────────${c.reset}\n`);
      hasShownResultHeader = true;
      isThinking = false;
    }

    process.stdout.write(str);
  });

  asideProc.stderr.on('data', (chunk) => {
    const errStr = chunk.toString();
    if (!errStr.includes('Warning') && !errStr.includes('ExperimentalWarning')) {
      process.stdout.write(`${c.yellow}${errStr}${c.reset}`);
    }
  });

  asideProc.on('error', (err) => {
    console.log(`\n${c.red}❌ 실행 오류: ${err.message}${c.reset}`);
    reportHerdr('idle', 'Error');
    rl.prompt();
  });

  asideProc.on('close', (code) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n${c.dim}  ────────────────────────────────────────────────────────────${c.reset}`);
    console.log(`  ${c.emerald}✔${c.reset} ${c.green}Completed in ${elapsed}s${c.reset} ${c.dim}· Thinking: ${currentEffort} · Model: ${currentModel}${c.reset}`);
    console.log(`${c.gray}  ${'─'.repeat(70)}${c.reset}\n`);
    reportHerdr('idle', 'Completed');
    rl.prompt();
  });
});
