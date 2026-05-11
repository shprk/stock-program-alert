import { getApprovalKey } from "./kisAuth.js";
import { hydrateNamesFromLocalFile } from "./kisStockLookup.js";
import { stockNamesTxtPathHint } from "./stockNamesTxt.js";
import {
  formatKstDateTime,
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
  /** 장중 WS 연결을 시작할 때마다 1씩 올림 (늦게 도착한 과거 세션 close 가 무시되는지 판별) */
  let realtimeConnectionCount = 0;
  let cachedApprovalKey = /** @type {string | null} */ (null);
  /** 해당 KST 영업일 ymd에 장중 첫 연결 시 디스코드 「감시 시작」을 이미 보냈으면 그 ymd */
  let watcherStartDiscordSentYmd = /** @type {string | null} */ (null);
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
  console.log("[스케줄] 시간 기준: Asia/Seoul (KST) — 서버 OS 타임존과 무관");
  console.log(
    `[스케줄] 프로그램 시작 시각(KST): ${formatKstDateTime(getKstNow())}`
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
      watcherStartDiscordSentYmd = null;
      cachedApprovalKey = null;
      lastCalendarYmd = ymd;
      console.log(`[스케줄] KST 영업일자 변경: ${ymd} (상태 초기화)`);
    }

    const todayCloseDone = closeRitualDoneYmd === ymd;

    if (isMarketCloseTickAt(now) && !todayCloseDone) {
      const msg =
        `[프로그램 감시] 정규장 종료(KST 15:40)·감시를 종료합니다. 내일 장중에 재연결됩니다.\n현재 시각(KST): ${formatKstDateTime(
          now
        )}`;
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
      const thisConnectAttemptId = ++realtimeConnectionCount;
      const { disconnect } = connectRealtimeProgramTrade({
        approvalKey,
        stockList,
        onConnectionLost: () => {
          if (thisConnectAttemptId !== realtimeConnectionCount) return;
          disconnectRealtime = null;
          console.log(
            "[스케줄] WebSocket 예상 외 종료 — 다음 틱에서 장중이면 재연결"
          );
        },
      });
      disconnectRealtime = disconnect;
      const kstNow = formatKstDateTime(now);
      console.log(`[스케줄] 장중 프로그램 감시 WebSocket 연결 · KST ${kstNow}`);
      if (watcherStartDiscordSentYmd !== ymd) {
        watcherStartDiscordSentYmd = ymd;
        await sendDiscordAlert(
          `[감시 시작] 시총 1조 이상 ${stockList.length}개 종목 모니터링 가동\n현재 시각(KST): ${kstNow}`
        );
      }
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
