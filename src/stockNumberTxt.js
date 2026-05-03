import fs from "fs";
import path from "path";

const DEFAULT_FILE = "./stock_number.txt";

/**
 * `stock_number.txt` 스타일: 쉼표·공백·줄바꿈으로 나열된 **6자리 종목코드**(숫자 또는 K/Z 등 6글자 단축코드).
 *
 * @param {string} [filePath]
 * @param {{ warnInvalid?: boolean }} [opts]
 * @returns {string[]}
 */
export function loadStockCodesFromTxt(filePath = DEFAULT_FILE, opts = {}) {
  const warnInvalid = opts.warnInvalid === true;
  const abs = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(abs)) {
    throw new Error(`${abs} 파일이 없습니다. 감시할 종목코드를 쉼표·공백·줄로 나열해 두세요.`);
  }

  const raw = fs.readFileSync(abs, "utf-8");
  /** @type {string[]} */
  const out = [];

  for (const t of raw.split(/[\s,]+/)) {
    const s = t.trim();
    if (!s || out.includes(s)) continue;

    const okFmt = /^[0-9A-Za-z]{6}$/.test(s);
    if (!okFmt) {
      if (warnInvalid) {
        console.warn(`[형식 경고] "${s}" — 6자리(영문·숫자)가 아니면 건너뜁니다`);
      }
      continue;
    }

    out.push(s.toUpperCase());
  }

  return out;
}

/** @param {string[]} codes @returns {{ stockCode: string }[]} */
export function toWatchStockList(codes) {
  return codes.map((stockCode) => ({ stockCode }));
}
