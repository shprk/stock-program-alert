import { getApprovalKey } from "./kisAuth.js";
import { hydrateNamesFromLocalFile } from "./kisStockLookup.js";
import { stockNamesTxtPathHint } from "./stockNamesTxt.js";
import {
  getKstNow,
  getYmdKst,
  isMarketCloseTickAt,
  isMarketOpenAt,
} from "./marketSchedule.js";
import { loadStockCodesFromTxt, toWatchStockList } from "./stockNumberTxt.js";
import {
  clearProgramTradeWatchMap,
  connectRealtimeProgramTrade,
  sendDiscordAlert,
} from "./realtimeProgramTrade.js";

const TICK_MS = 30_000;
const IDLE_LOG_MS = 10 * 60 * 1000;

async function main() {
  let lastCalendarYmd = /** @type {string | null} */ (null);
  /** 오늘 15:40 종료 처리(알림·연결 종료)를 이미 했으면 해당 ymd */
  let closeRitualDoneYmd = /** @type {string | null} */ (null);
  /** @type {null | (() => void)} */
  let disconnectRealtime = null;
  let cachedApprovalKey = /** @type {string | null} */ (null);
  let lastIdleLogAt = 0;

  const codes = loadStockCodesFromTxt();
  const stockList = toWatchStockList(codes);

  const fromFile = hydrateNamesFromLocalFile(codes);
  if (fromFile > 0) {
    console.log(
      `종목명 ${fromFile}개 — 로컬 파일 \`${stockNamesTxtPathHint()}\` (우선 적용)`
    );
  }

  console.log(`stock_number.txt 기준 감시 종목 수: ${stockList.length}`);
  console.log(
    `[스케줄] ${TICK_MS / 1000}초 간격 장중 연결 · 15:40(KST) 알림 후 종료`
  );

  /** @returns {Promise<void>} */
  async function tickOnce() {
    const now = getKstNow();
    const ymd = getYmdKst(now);

    if (lastCalendarYmd === null) {
      lastCalendarYmd = ymd;
    } else if (lastCalendarYmd !== ymd) {
      if (disconnectRealtime) {
        disconnectRealtime();
        disconnectRealtime = null;
      }
      clearProgramTradeWatchMap();
      closeRitualDoneYmd = null;
      cachedApprovalKey = null;
      lastCalendarYmd = ymd;
      console.log(`[스케줄] KST 영업일자 변경: ${ymd} (상태 초기화)`);
    }

    const todayCloseDone = closeRitualDoneYmd === ymd;

    if (isMarketCloseTickAt(now) && !todayCloseDone) {
      const msg =
        `[프로그램 감시] 정규장 종료(KST 15:40)·감시를 종료합니다. 내일 장중에 재연결됩니다.\n종목 수: ${stockList.length}`;
      console.log(msg);
      await sendDiscordAlert(msg);

      if (disconnectRealtime) {
        disconnectRealtime();
        disconnectRealtime = null;
      }
      closeRitualDoneYmd = ymd;
      return;
    }

    if (!isMarketOpenAt(now)) {
      if (disconnectRealtime) {
        disconnectRealtime();
        disconnectRealtime = null;
      }
      const t = Date.now();
      if (t - lastIdleLogAt >= IDLE_LOG_MS) {
        lastIdleLogAt = t;
        console.log("[스케줄] 장외·대기중 (연결 안 함)");
      }
      return;
    }

    if (disconnectRealtime === null && !todayCloseDone) {
      let approvalKey = cachedApprovalKey;
      if (!approvalKey) {
        approvalKey = await getApprovalKey();
        if (!approvalKey) {
          console.warn("[스케줄] approval_key 발급 실패 — 다음 틱에 재시도");
          return;
        }
        cachedApprovalKey = approvalKey;
      }
      const { disconnect } = connectRealtimeProgramTrade({
        approvalKey,
        stockList,
      });
      disconnectRealtime = disconnect;
      console.log("[스케줄] 장중 프로그램 감시 WebSocket 연결");
    }
  }

  let tickBusy = false;
  /** @returns {Promise<void>} */
  async function runTickSafely() {
    if (tickBusy) return;
    tickBusy = true;
    try {
      await tickOnce();
    } catch (err) {
      console.error("[스케줄 오류]", err);
    } finally {
      tickBusy = false;
    }
  }

  await runTickSafely();
  setInterval(() => void runTickSafely(), TICK_MS);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
