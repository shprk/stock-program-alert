import { getApprovalKey } from "./kisAuth.js";
import { hydrateNamesFromLocalFile } from "./kisStockLookup.js";
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
