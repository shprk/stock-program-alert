import WebSocket from "ws";
import axios from "axios";
import dotenv from "dotenv";
import { stockLabelForAlert } from "./kisStockLookup.js";

dotenv.config();

/**
 * 국내주식 실시간 프로그램매매 TR_ID (한국투자증권 스펙).
 * - H0STPGM0: KRX (일반 거래소) — 대부분의 종목
 * - H0NXPGM0: NXT 단독
 * - H0UNPGM0: 통합
 * @see https://github.com/koreainvestment/open-trading-api (domestic_stock_functions_ws.py)
 */
export function getProgramTradeTrId() {
  const id = (
    process.env.KIS_PGM_TR_ID ||
    process.env.KIS_PROGRAM_TRADE_TR_ID ||
    "H0STPGM0"
  ).trim();
  return id || "H0STPGM0";
}

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

  return `${bar}\n▫️ **${t}** (KST)\n\n${String(inner).trim()}\n\n${bar}`;
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

  if (trId !== getProgramTradeTrId()) return null;

  // KIS 스펙(대략적인 payload 필드):
  // 0=종목코드, 1=체결시각, 6=ntby_cnqn(순매수체결량) — 로직은 NTBY만 사용
  const parts = payload.split("^");
  const stockCode = parts[0];
  const tradeTime = parts[1];
  const netBuyQty = Number(parts[6]);

  // 필드 누락/파싱 실패면 잘못된 비교를 막기 위해 무시
  if (!Number.isFinite(netBuyQty)) return null;

  return {
    stockCode,
    tradeTime,
    netBuyQty,
  };

}

async function handleProgramTrade(parsed) {
  const { stockCode, netBuyQty } = parsed;

  // 1. 감시 대상 등록 (순매도 10만주 이상: NTBY <= -100000)
  if (netBuyQty <= -100000 && !watchMap.has(stockCode)) {
    const displayLabel = await stockLabelForAlert(stockCode);

    watchMap.set(stockCode, {
      stockCode,
      displayLabel,
      lowestNetBuyQty: netBuyQty,
      alerted50: false,
    });

    const message = `[감시 시작] ${displayLabel}: 순매도 ${Math.abs(
      netBuyQty
    ).toLocaleString("ko-KR")}주 기록`;

    console.log(message);
    await sendDiscordAlert(message);
    return;
  }

  const stock = watchMap.get(stockCode);
  if (!stock) return;

  // 2. 최저값(가장 음수인 순매수체결량) 갱신 = 순매도 강도 피크
  if (netBuyQty < stock.lowestNetBuyQty) {
    stock.lowestNetBuyQty = netBuyQty;
  }

  // 순매도 강도 피크(최저 음수) 대비 50% 완화(0에 가까워짐) 알림
  if (
    stock.lowestNetBuyQty < 0 &&
    netBuyQty >= stock.lowestNetBuyQty * 0.5 &&
    !stock.alerted50
  ) {
    const peak = stock.lowestNetBuyQty;
    const stockName = stock.displayLabel ?? (await stockLabelForAlert(stockCode));
    const peakNetSellAbs = Math.abs(peak);
    const currentNetSellAbs = Math.abs(netBuyQty);

    const alertMsg = `🚨 [프로그램 매매 알림]
종목명: ${stockName} (${stockCode})
상태: 매도세 고점 대비 50% 하락
피크 순매도: ${peakNetSellAbs}주
현재 순매도: ${currentNetSellAbs}주`;

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
    const trId = getProgramTradeTrId();
    console.log("WebSocket 연결 성공");
    console.log(
      `프로그램매매 TR: ${trId} · 구독 종목 ${stockList.length}개 (KIS_PGM_TR_ID로 변경 가능)`
    );

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
              tr_id: trId,
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