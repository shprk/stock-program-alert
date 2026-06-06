/**
 * 3단계: KRX OPEN API(KOSPI + 코스닥 일별매매) → MKTCAP 하한 이상 종목만
 * `stock_number.txt` 형식으로 저장.
 *
 *   npm run build:stocks -- --bas-dd=20260512
 *   npm run build:stocks -- --bas-dd=20260512 --output=./stock_number.txt
 *   npm run build:stocks -- --dry-run
 *
 * .env: KRX_AUTH_KEY 필수. (선택) KRX_BAS_DD, KRX_MIN_MARKET_CAP
 */
import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";
import { getKstNow, getPreviousKstBusinessDayYmd } from "./marketSchedule.js";

const KRX_STK_BYDD_TRD =
  "http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd";
const KRX_KSQ_BYDD_TRD =
  "http://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd";

function parseArg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeKrxStockCode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return s.padStart(6, "0");
  return s.toUpperCase().slice(0, 6);
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function parseMktcap(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {string} url
 * @param {string} basDd
 * @param {string} authKey
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function fetchDailyTradeRows(url, basDd, authKey) {
  const res = await axios.get(url, {
    headers: { AUTH_KEY: authKey },
    params: { basDd },
    timeout: 60_000,
    validateStatus: () => true,
  });

  const data = res.data;
  if (res.status !== 200) {
    throw new Error(
      `KRX HTTP ${res.status}: ${typeof data === "object" ? JSON.stringify(data) : data}`
    );
  }
  if (typeof data === "object" && data !== null && "respCode" in data) {
    const code = String(data.respCode ?? "");
    if (code && code !== "200") {
      throw new Error(`KRX respCode ${data.respCode}: ${data.respMsg}`);
    }
  }
  const block = data?.OutBlock_1;
  if (!Array.isArray(block)) {
    throw new Error("OutBlock_1 이 없습니다.");
  }
  return /** @type {Record<string, unknown>[]} */ (block);
}

/**
 * @param {string[]} codes
 * @param {number} perLine
 * @returns {string[]}
 */
function formatStockNumberBodyLines(codes, perLine) {
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < codes.length; i += perLine) {
    const chunk = codes.slice(i, i + perLine);
    const hasMore = i + perLine < codes.length;
    lines.push(`${chunk.join(", ")}${hasMore ? "," : ""}`);
  }
  return lines;
}

async function main() {
  const outputPath = parseArg("--output", "./stock_number.txt");
  let basDd =
    parseArg("--bas-dd", "").trim() ||
    String(process.env.KRX_BAS_DD ?? "").trim();
  if (!/^\d{8}$/.test(basDd)) {
    basDd = getPreviousKstBusinessDayYmd(getKstNow());
    console.log(`basDd 자동(직전 KST 영업일): ${basDd}`);
  }
  const minCapRaw =
    parseArg("--min-cap", "").trim() ||
    String(process.env.KRX_MIN_MARKET_CAP ?? "1000000000000");
  const minCap = Number.parseInt(minCapRaw, 10);
  const perLine = Number.parseInt(parseArg("--per-line", "10"), 10) || 10;
  const dryRun = hasFlag("--dry-run");

  const authKey = String(process.env.KRX_AUTH_KEY ?? "").trim();
  if (!authKey) {
    console.error(".env 에 KRX_AUTH_KEY 가 필요합니다.");
    process.exit(1);
  }
  if (!Number.isFinite(minCap) || minCap <= 0) {
    console.error(`--min-cap 값이 올바르지 않습니다: ${minCapRaw}`);
    process.exit(1);
  }

  console.log(
    `KRX 조회 basDd=${basDd} · 시총 하한(원)=${minCap.toLocaleString("ko-KR")}`
  );

  const [kospi, kosdaq] = await Promise.all([
    fetchDailyTradeRows(KRX_STK_BYDD_TRD, basDd, authKey),
    fetchDailyTradeRows(KRX_KSQ_BYDD_TRD, basDd, authKey),
  ]);

  const merged = [...kospi, ...kosdaq];
  /** @type {{ code: string; cap: number }[]} */
  const scored = [];
  for (const row of merged) {
    const cap = parseMktcap(row.MKTCAP);
    if (!Number.isFinite(cap) || cap < minCap) continue;
    const code = normalizeKrxStockCode(row.ISU_CD);
    if (!code || !/^[0-9A-Z]{6}$/.test(code)) continue;
    scored.push({ code, cap });
  }

  scored.sort((a, b) => b.cap - a.cap);

  /** @type {string[]} */
  const codes = [];
  const seen = new Set();
  for (const { code } of scored) {
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  console.log(
    `KRX 행 ${merged.length}건 → 시총 하한 이상 고유 종목 ${codes.length}개`
  );

  const header = [
    `# 자동 생성 ${new Date().toISOString()}`,
    `# KRX OPEN API · basDd=${basDd} · MKTCAP>=${minCap} 원`,
    `# npm run build:stocks`,
    "",
  ];
  const body = formatStockNumberBodyLines(codes, perLine);
  const content = [...header, ...body, ""].join("\n");
  const outAbs = path.resolve(process.cwd(), outputPath);

  if (dryRun) {
    console.log("\n--dry-run: 파일을 쓰지 않습니다. 앞부분:\n");
    console.log(content.slice(0, 800));
    if (content.length > 800) console.log("\n…");
    return;
  }

  fs.writeFileSync(outAbs, content, "utf-8");
  console.log(`\n저장: ${outputPath}`);
}

main().catch((e) => {
  console.error(e?.response?.data ?? e);
  process.exit(1);
});
