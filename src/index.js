import { getAccessToken, getApprovalKey } from "./kisAuth.js";
import {
  hydrateNamesFromLocalFile,
  preloadStockLabels,
} from "./kisStockLookup.js";
import { stockNamesTxtPathHint } from "./stockNamesTxt.js";
import { loadStockCodesFromTxt, toWatchStockList } from "./stockNumberTxt.js";
import { connectRealtimeProgramTrade } from "./realtimeProgramTrade.js";

async function main() {
  const approvalKey = await getApprovalKey();

  if (!approvalKey) {
    console.log("approval_key 발급 실패");
    return;
  }

  const codes = loadStockCodesFromTxt();
  const stockList = toWatchStockList(codes);

  const fromFile = hydrateNamesFromLocalFile(codes);
  if (fromFile > 0) {
    console.log(
      `종목명 ${fromFile}개 — 로컬 파일 \`${stockNamesTxtPathHint()}\` (우선 적용)`
    );
  }

  if (process.env.PRELOAD_STOCK_NAMES?.trim() === "1") {
    const token = await getAccessToken();

    if (token) {
      const ms =
        Number.parseInt(process.env.PRELOAD_STOCK_DELAY_MS ?? "250", 10) || 250;

      console.log(
        `종목명 선로드 (${codes.length}개 · ${ms}ms 간격, KIS search-info)…`
      );

      const r = await preloadStockLabels(codes, { delayMs: ms });

      console.log(
        `종목명 선로드 완료: 한글명 조회 ${r.ok} / 미조회 ${r.miss}`
      );
    } else {
      console.warn("종목명 선로드 생략: access_token 발급 실패");
    }
  }

  console.log(`stock_number.txt 기준 감시 종목 수: ${stockList.length}`);

  connectRealtimeProgramTrade({
    approvalKey,
    stockList,
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
