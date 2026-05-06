/**
 * 운영처럼 프로세스를 유지한 채 랜덤 프로그램매도/순매수 수량 틱을 넣고,
 * 실전과 같은 `handleProgramTrade`·Discord 경로를 반복 검증한다.
 *
 *   npm run simulate:pgm:live
 *
 * 옵션 (--name=value):
 *   --interval-ms=400    틱 간격(기본 400ms, 짧을수록 조건 충족이 잦음·디스코드도 잦음)
 *   --pool=watchlist|synthetic
 *                         watchlist: `stock_number.txt` 종목만 사용(기본) → `stock_names.txt`와 맞추면 한글명 표시
 *                         synthetic: 가짜 코드 풀(799100~) — 이름 매핑 없음
 *   --pool-size=12       `--pool=synthetic` 일 때만, 가짜 종목 개수(기본 12)
 *   --reset-sec=120      N초마다 감시 맵 전체 초기화 → 감시 시작·50% 알림을 다시 겪음(기본 120). 0이면 초기화 없음
 *
 * 종료: Ctrl+C
 */
import dotenv from "dotenv";
import { hydrateNamesFromLocalFile } from "./kisStockLookup.js";
import {
  dispatchProgramTradeSocketText,
  getProgramTradeTrId,
  resetProgramTradeSimulationState,
} from "./realtimeProgramTrade.js";
import { stockNamesTxtPathHint } from "./stockNamesTxt.js";
import { loadStockCodesFromTxt } from "./stockNumberTxt.js";

dotenv.config();

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

function line(code, tradeTime, sellQty, netBuyQty) {
  // payload 필드(실전과 파싱 인덱스 호환):
  // 0=종목코드, 1=체결시각, 2=SELN_CNQN(매도체결량), 6=NTBY_CNQN(순매수체결량)
  return `0|${getProgramTradeTrId()}|001|${code}^${tradeTime}^${sellQty}^0^0^0^${netBuyQty}`;
}

function randomInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pad6(n) {
  return String(Math.max(0, Math.min(999999, n))).padStart(6, "0");
}

function buildSyntheticCodes(poolSize) {
  const baseCode = 799100;
  return Array.from({ length: poolSize }, (_, i) => pad6(baseCode + i));
}

function resolveCodePool(poolModeRaw, poolSize) {
  const mode = String(poolModeRaw ?? "watchlist").toLowerCase().trim();

  if (mode === "synthetic" || mode === "fake") {
    return { codes: buildSyntheticCodes(poolSize), mode: "synthetic", fromFile: false };
  }

  try {
    const codes = loadStockCodesFromTxt();
    return { codes, mode: "watchlist", fromFile: true };
  } catch (e) {
    console.warn(
      `[simulate:pgm:live] stock_number.txt 를 읽지 못해 가짜 종목 풀을 씁니다. (${/** @type {{ message?: string }} */ (e)?.message ?? e})`
    );
    const codes = buildSyntheticCodes(poolSize);
    return { codes, mode: "watchlist→synthetic_fallback", fromFile: false };
  }
}

function main() {
  const intervalMs =
    Number.parseInt(parseArg("--interval-ms", "400"), 10) || 400;
  const poolSize = Number.parseInt(parseArg("--pool-size", "12"), 10) || 12;
  const resetSec = Number.parseFloat(parseArg("--reset-sec", "120"), 10);
  const poolModeRaw = parseArg("--pool", "watchlist");

  const { codes, mode, fromFile } = resolveCodePool(poolModeRaw, poolSize);

  const hydrated = hydrateNamesFromLocalFile(codes);

  const poolDesc =
    mode === "synthetic"
      ? `가짜 종목: ${codes[0]} ~ ${codes[codes.length - 1]} (${codes.length}개, stock_names 매칭 없음)`
      : fromFile
        ? `\`stock_number.txt\` ${codes.length}개 · 종목명 파일 \`${stockNamesTxtPathHint()}\` 에서 ${hydrated}개 선로드`
        : `\`stock_number.txt\` 없음 → 가짜 풀로 대체 (${codes[0]}~, ${codes.length}개)`;

  console.log(`[simulate:pgm:live] (${mode}) Ctrl+C 종료
· 틱: ${intervalMs}ms마다 종목 무작위, 매도량·순매수량 랜덤(SELN 10만↑ 구간 + NTBY 음수 회복 구간 포함)
· 종목 풀: ${poolDesc}`);
  console.log(
    resetSec > 0
      ? `· 감시 맵 초기화: ${resetSec}s 마다 → 실전에서는 없음, 테스트용 반복 알림용`
      : "· 감시 맵 초기화 없음 → 종목별 50% 알림은 최대 1회(실전과 동일)"
  );
  if (!process.env.DISCORD_WEBHOOK_URL?.trim()) {
    console.warn("(참고) DISCORD_WEBHOOK_URL 없으면 콘솔만\n");
  }

  let tick = 0;
  let stopped = false;

  let resetTimer = null;
  if (resetSec > 0) {
    resetTimer = setInterval(() => {
      resetProgramTradeSimulationState();
      console.log(`\n--- [시뮬] 감시 상태 초기화 (${resetSec}s) ---\n`);
    }, Math.floor(resetSec * 1000));
  }

  const runTick = async () => {
    if (stopped) return;
    tick += 1;

    const code = codes[randomInt(0, codes.length - 1)];
    const tradeTime = pad6(90000 + (tick % 85000));

    let sellQty;
    const r = Math.random();
    if (r < 0.22) sellQty = randomInt(110000, 280000);
    else if (r < 0.38) sellQty = randomInt(15000, 85000);
    else sellQty = randomInt(45000, 190000);

    // NTBY는 음수(순매도 우위)와 0 근처 회복 구간이 섞이도록 생성
    let netBuyQty;
    const n = Math.random();
    if (n < 0.45) netBuyQty = -randomInt(120000, 300000);
    else if (n < 0.75) netBuyQty = -randomInt(20000, 100000);
    else netBuyQty = randomInt(-15000, 70000);

    const msg = line(code, tradeTime, sellQty, netBuyQty);
    try {
      await dispatchProgramTradeSocketText(msg);
      if (tick % 40 === 0) {
        console.log(
          `… tick ${tick} (마지막: ${code} SELN=${sellQty} NTBY=${netBuyQty})`
        );
      }
    } catch (e) {
      console.error("[티크 오류]", e?.message ?? e);
    }

    setTimeout(runTick, intervalMs);
  };

  process.on("SIGINT", () => {
    stopped = true;
    if (resetTimer) clearInterval(resetTimer);
    console.log("\n종료했습니다.");
    process.exit(0);
  });

  void runTick();
}

main();
