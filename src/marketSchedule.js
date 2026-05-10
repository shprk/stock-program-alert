/** @typedef {{ year: number; month: number; day: number; weekday: string; hour: number; minute: number; second: number }} KstWallClock */

const SEOUL_TZ = "Asia/Seoul";

/**
 * 한국 시간 기준 "지금" 순간입니다. 스케줄 판별은 모두 같은 인스턴스를 받아 Seoul 벽시계로 해석합니다.
 * @returns {Date}
 */
export function getKstNow() {
  return new Date();
}

/** @param {Date} date @returns {KstWallClock} */
function getKstWallClock(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  /** @type {Record<string, string>} */
  const map = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * KST 기준 연월일 문자열 (자정 변경 감지용).
 * @param {Date} date
 * @returns {string} 예: 20260507
 */
export function getYmdKst(date) {
  const { year, month, day } = getKstWallClock(date);
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/**
 * KST 기준 주말(토·일).
 * @param {Date} date
 * @returns {boolean}
 */
export function isWeekend(date) {
  const { weekday } = getKstWallClock(date);
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * KST 기준 평일이고 장 운영 벽시각 구간 [09:00, 15:40] 포함.
 * 공휴일은 포함하지 않습니다.
 * @param {Date} date
 * @returns {boolean}
 */
export function isMarketOpenAt(date) {
  if (isWeekend(date)) return false;
  const { hour, minute } = getKstWallClock(date);
  if (hour < 9) return false;
  if (hour > 15) return false;
  if (hour === 15 && minute > 40) return false;
  return true;
}

/**
 * KST 벽시계가 16:00 분에 해당하는지 (시·분 기준).
 * 30초 폴링 등에서는 같은 분에 여러 번 true일 수 있으므로 호출측에서 날짜별 1회 가드 등이 필요할 수 있습니다.
 * @param {Date} date
 * @returns {boolean}
 */
export function isMarketCloseTickAt(date) {
  const { hour, minute } = getKstWallClock(date);
  return hour === 16 && minute === 0;
}
