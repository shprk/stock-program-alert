/**
 * 장 외에도 KIS WebSocket `H0NXPGM0` 메시지 형식 문자열을 만들어
 * `dispatchProgramTradeSocketText` 로 감시·알림 로직을 그대로 테스트한다.
 *
 *   npm run simulate:pgm              # 전체 내장 시나리오
 *   npm run simulate:pgm:decline       # 「최고 대비 절반 이하 감소」 알림만 짧게
 *   node src/simulateProgramTrade.js --line="0|H0NXPGM0|001|005930^120000^150000"
 *   node src/simulateProgramTrade.js --scenario=decline [--code=005930]
 */
import dotenv from "dotenv";
import { dispatchProgramTradeSocketText } from "./realtimeProgramTrade.js";

dotenv.config();

/** @param {string} code @param {string} hhmmss @param {number} sellQty */
function line(code, hhmmss, sellQty) {
  return `0|H0NXPGM0|001|${code}^${hhmmss}^${sellQty}`;
}

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

async function runOne(label, text) {
  console.log(`\n--- ${label} ---\n${text}`);
  await dispatchProgramTradeSocketText(text);
}

async function main() {
  const custom = parseArg("--line", "");
  const scenario = parseArg("--scenario", "full");
  const codeArg = parseArg("--code", "005930");
  const code = codeArg.replace(/[^\dA-Za-z]/g, "").toUpperCase() || "005930";

  if (custom) {
    await runOne("사용자 입력 1건", custom);
    return;
  }

  if (scenario === "decline") {
    console.log(
      `[시나리오: 감소 알림 테스트] 종목=${code}\n` +
        "감시 조건은 실전과 동일: 프로그램매도 수량 **10만 주 이상**일 때만 감시 등록.\n" +
        "① **10만 주(정확히 하한)** — 감시 시작, 최고값 10만\n" +
        "② **5만 주** — 최고(10만)의 50%(5만) 이하로 떨어짐 → 최고 대비 50% 감소 알림\n" +
        "※ 디스코드: .env 의 DISCORD_WEBHOOK_URL 필요. 알림은 HTTP 전송 완료까지 잠시 대기."
    );
    await runOne("① 10만주 (≥10만 → 감시+피크)", line(code, "091000", 100000));
    await runOne("② 5만주 (피크의 50% 이하)", line(code, "091100", 50000));
    console.log("\n끝.");
    return;
  }

  console.log(
    "내장 시나리오 (10만 주 미만 → 무시, 15만 → 감시 시작, 20만 → 피크, 10만 이하 → 최고 대비 50% 알림)\n" +
      "※ 실제 증권사 원문 스펙과 다르면 --line 으로 교체해 보세요."
  );

  await runOne("1) 9.9만 — 감시 미등록(10만 미만)", line(code, "090001", 99000));
  await runOne("2) 15만 — 감시 시작", line(code, "090002", 150000));
  await runOne("3) 20만 — 최고값 갱신", line(code, "090003", 200000));
  await runOne("4) 10만 — 최고(20만)의 50% 이하 → 알림", line(code, "090004", 100000));

  console.log("\n끝.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
