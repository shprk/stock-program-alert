import WebSocket from "ws";
import axios from "axios";
import { stockLabelForAlert } from "./kisStockLookup.js";

// 감시 대상 저장
const watchMap = new Map();

let warnedMissingDiscordUrl = false;

/** Discord에서 연속 알림이 붙어 보일 때 구분하기 쉽게 구분선·KST 시각을 붙임 */
function frameDiscordNotice(inner) {
  const t = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const bar = "▬".repeat(28);

  return `${bar}\n📌 **${t}** (KST)\n\n${String(inner).trim()}\n\n${bar}`;
}

async function sendDiscordAlert(message) {
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) {
    if (!warnedMissingDiscordUrl) {
      console.warn(
        "[Discord] DISCORD_WEBHOOK_URL 이 비어 있어 알림을 보내지 않습니다. (.env 확인)"
      );
      warnedMissingDiscordUrl = true;
    }
    return;
  }

  try {
    await axios.post(url, {
      content: frameDiscordNotice(message),
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

}

async function handleProgramTrade(parsed) {
  const { stockCode, sellQty } = parsed;

  // 1. 감시 대상 등록 (10만주 이상)
  if (sellQty >= 100000 && !watchMap.has(stockCode)) {
    const displayLabel = await stockLabelForAlert(stockCode);

    watchMap.set(stockCode, {
      stockCode,
      displayLabel,
      highestSellQty: sellQty,
      alerted50: false,
    });

    const message = `🔭 [감시 시작]
종목: ${displayLabel}
프로그램매도 수량: ${sellQty}`;

    console.log(message);
    await sendDiscordAlert(message);
    return;
  }

  const stock = watchMap.get(stockCode);
  if (!stock) return;

  // 2. 최고값 갱신
  if (sellQty > stock.highestSellQty) {
    stock.highestSellQty = sellQty;
  }

  // 최고값 대비 50% 감소 (Discord 알림)
  if (
    sellQty <= stock.highestSellQty * 0.5 &&
    !stock.alerted50
  ) {
    const peak = stock.highestSellQty;
    const label = stock.displayLabel ?? (await stockLabelForAlert(stockCode));

    const alertMsg = `⚠️ [알림] 최고 대비 50% 감소
종목: ${label}
프로그램매도 수량: ${peak} -> ${sellQty}`;

    console.log(alertMsg);
    await sendDiscordAlert(alertMsg);
    stock.alerted50 = true;
  }
}

/**
 * WebSocket `message` 본문 중 실제 시세·프로그램매매 데이터만 처리 (구독 응답·PING 제외).
 * 장 외 시뮬 시 동일 형식 문자열을 넣어 `handleProgramTrade` 경로를 검증할 때 사용.
 */
export async function dispatchProgramTradeSocketText(text) {
  const parsed = parseProgramTradeMessage(String(text));
  if (parsed) await handleProgramTrade(parsed);
  return parsed;
}

/** 시뮬 전용: `watchMap` 초기화. 운영 경로에서 호출하지 않을 것. */
export function resetProgramTradeSimulationState() {
  watchMap.clear();
}

async function onRawSocketMessage(text) {
  if (text.includes("SUBSCRIBE SUCCESS")) {
    console.log("구독 성공");
    return;
  }

  if (text.includes("PINGPONG")) {
    return;
  }

  try {
    await dispatchProgramTradeSocketText(text);
  } catch (err) {
    console.error("[프로그램매매 처리 오류]", err?.message ?? err);
  }
}

export function connectRealtimeProgramTrade({ approvalKey, stockList }) {
  const ws = new WebSocket(process.env.KIS_WS_URL);

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
    void onRawSocketMessage(data.toString());
  });

  ws.on("error", (err) => {
    console.error("WebSocket 오류:", err.message);
  });

  ws.on("close", () => {
    console.log("WebSocket 종료");
  });
}