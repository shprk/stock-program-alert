import WebSocket from "ws";
import axios from "axios";

// 감시 대상 저장
const watchMap = new Map();

async function sendDiscordAlert(message) {
  try {
    await axios.post(process.env.DISCORD_WEBHOOK_URL, {
      content: message,
    });
  } catch (error) {
    console.error("디스코드 전송 실패", error.message);
  }
}

function parseProgramTradeMessage(message) {
  const [, trId, , payload] = message.split("|");

  if (trId !== "H0NXPGM0") return null;

  const [
    stockCode,
    tradeTime,
    sellQty,
  ] = payload.split("^");

  return {
    stockCode,
    tradeTime,
    sellQty: Number(sellQty),
  };

  // const [
  //   stockCode,
  //   tradeTime,
  //   sellQty,
  //   sellAmount,
  //   buyQty,
  //   buyAmount,
  //   netBuyQty,
  //   netBuyAmount,
  //   sellAskRemainQty,
  //   buyBidRemainQty,
  //   totalNetBuyRemainQty,
  // ] = payload.split("^");

  // return {
  //   stockCode,
  //   tradeTime,
  //   sellQty: Number(sellQty),
  //   sellAmount: Number(sellAmount),
  //   buyQty: Number(buyQty),
  //   buyAmount: Number(buyAmount),
  //   netBuyQty: Number(netBuyQty),
  //   netBuyAmount: Number(netBuyAmount),
  //   sellAskRemainQty: Number(sellAskRemainQty),
  //   buyBidRemainQty: Number(buyBidRemainQty),
  //   totalNetBuyRemainQty: Number(totalNetBuyRemainQty),
  // };
}

function handleProgramTrade(parsed) {
  const { stockCode, sellQty } = parsed;

  // 1. 감시 대상 등록 (2만주 이상)
  if (sellQty >= 20000 && !watchMap.has(stockCode)) {
    watchMap.set(stockCode, {
      stockCode,
      initialSellQty: sellQty,
      highestSellQty: sellQty,
      alerted60: false,
      alerted50: false,
    });

    const message = `[감시 시작]
    종목: ${stockCode}
    초기 수량: ${sellQty}`;

    console.log(message);
    sendDiscordAlert(message);
    return;
  }

  const stock = watchMap.get(stockCode);
  if (!stock) return;

  // 2. 최고값 갱신
  if (sellQty > stock.highestSellQty) {
    stock.highestSellQty = sellQty;
  }

  // 3. 60% 감소 (초기값 기준)
  if (
    sellQty <= stock.initialSellQty * 0.4 &&
    !stock.alerted60
  ) {
    const message = `
    [프로그램매도 60% 감소]
    종목: ${stockCode}
    초기: ${stock.initialSellQty}
    현재: ${sellQty}
    `;

    console.log(message);
    sendDiscordAlert(message);
    stock.alerted60 = true;
  }

  // 4. 50% 감소 (최고값 기준)
  if (
    sellQty <= stock.highestSellQty * 0.5 &&
    !stock.alerted50
  ) {
    console.log(`[알림] 최고 대비 50% 감소: ${stockCode}`);
    sendDiscordAlert(`[알림] 최고 대비 50% 감소: ${stockCode}`);
    stock.alerted50 = true;
  }
}

export function connectRealtimeProgramTrade({ approvalKey, stockList }) {
  const ws = new WebSocket(process.env.KIS_WS_URL);

  // ws.on("open", () => {
  //   console.log("WebSocket 연결 성공");

  //   stockList.forEach((stockCode) => {
  //     const request = {
  //       header: {
  //         approval_key: approvalKey,
  //         custtype: "P",
  //         tr_type: "1",
  //         "content-type": "utf-8",
  //       },
  //       body: {
  //         input: {
  //           tr_id: "H0NXPGM0",
  //           tr_key: stockCode,
  //         },
  //       },
  //     };

  //     ws.send(JSON.stringify(request));
  //     console.log(`[구독 요청] ${stockCode}`);
  //   });
  // });

  ws.on("open", () => {
    console.log("WebSocket 연결 성공");

    stockList.forEach(({ stockCode }) => {
      ws.send(
        JSON.stringify({
          header: {
            approval_key: approvalKey,
            custtype: "P",
            tr_type: "1",
          },
          body: {
            input: {
              tr_id: "H0NXPGM0",
              tr_key: stockCode,
            },
          },
        })
      );
    });
  });

  ws.on("message", (data) => {
      const text = data.toString();

      if (text.includes("SUBSCRIBE SUCCESS")) {
        console.log("구독 성공");
        return;
      }

      if (text.includes("PINGPONG")) {
        return;
      }

      const parsed = parseProgramTradeMessage(text);

      if (parsed) {
        handleProgramTrade(parsed);
      }
  });

  ws.on("error", (err) => {
    console.error("WebSocket 오류:", err.message);
  });

  ws.on("close", () => {
    console.log("WebSocket 종료");
  });
}