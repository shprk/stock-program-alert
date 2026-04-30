import { getAccessToken, getApprovalKey } from "./kisAuth.js";
import { getMarketCapFilteredStocks } from "./marketCap.js";
import { connectRealtimeProgramTrade } from "./realtimeProgramTrade.js";

async function main() {
  const accessToken = await getAccessToken();
  const approvalKey = await getApprovalKey();

  if (!accessToken || !approvalKey) {
    console.log("인증 실패");
    return;
  }

  const stockList = await getMarketCapFilteredStocks(accessToken);

  console.log(`시총 5000억 이상 종목 수: ${stockList.length}`);

  connectRealtimeProgramTrade({
    approvalKey,
    stockList,
  });
}

main();