/**
 * stock_number.txt 등에 나열된 종목코드가 KIS REST에서 조회되는지 검사한다.
 * (현재가 시세 = 실시간 구독에 쓰는 코드와 동일 계열)
 *
 *   node src/verifyStockNumbers.js
 *   node src/verifyStockNumbers.js --input=./stock_number.txt --delay=600
 *   node src/verifyStockNumbers.js --max=5   (앞에서부터 N개만)
 */
import axios from "axios";
import { getAccessToken } from "./kisAuth.js";
import { loadStockCodesFromTxt } from "./stockNumberTxt.js";

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

/**
 * 주식 현재가 시세 (국내) — 개발자포털 표기: 실전 FHKST01010100, 모의 VH... (도메인 vts일 때)
 * 환경변수 KIS_INQUIRE_PRICE_TR 로 덮어쓸 수 있음.
 */
function inquirePriceTrId() {
  if (process.env.KIS_INQUIRE_PRICE_TR?.trim()) {
    return process.env.KIS_INQUIRE_PRICE_TR.trim();
  }
  const base = process.env.KIS_BASE_URL ?? "";
  return base.includes("vts") ? "FHKST01010100" : "FHKST01010100";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPrice(token, code) {
  const { data } = await axios.get(
    `${process.env.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
        tr_id: inquirePriceTrId(),
      },
      params: {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: code,
      },
    }
  );
  return data;
}

async function main() {
  const inputPath = parseArg("--input", "./stock_number.txt");
  const delayMs = Number.parseInt(parseArg("--delay", "600"), 10) || 400;
  const maxArg = parseArg("--max", "");
  const maxN = maxArg ? Number.parseInt(maxArg, 10) : 0;
  const debug = process.argv.includes("--debug");

  if (!process.env.KIS_BASE_URL || !process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    console.error(".env 에 KIS_BASE_URL, KIS_APP_KEY, KIS_APP_SECRET 을 설정하세요.");
    process.exit(1);
  }

  let codes = loadStockCodesFromTxt(inputPath, { warnInvalid: true });
  if (maxN > 0) codes = codes.slice(0, maxN);
  console.log(`검사 대상: ${codes.length}개 (${inputPath})`);
  console.log(`TR_ID: ${inquirePriceTrId()} / ${process.env.KIS_BASE_URL}\n`);

  const token = await getAccessToken();
  if (!token) {
    console.error("access_token 없음");
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;

  for (const code of codes) {
    try {
      const data = await fetchPrice(token, code);
      const rt = data?.rt_cd;
      const out = data?.output;

      if (rt !== "0" || !out) {
        fail += 1;
        const msg = data?.msg1 ?? data?.msg_cd ?? JSON.stringify(data).slice(0, 200);
        console.log(`[실패] ${code} — ${msg}`);
        if (debug) console.log(JSON.stringify(data, null, 2));
      } else {
        ok += 1;
        const mkt = String(out.rprs_mrkt_kor_name ?? "").trim();
        const sec = String(out.bstp_kor_isnm ?? "").trim();
        const prpr = String(out.stck_prpr ?? "").trim();
        const meta = [mkt, sec].filter(Boolean).join(" · ");
        console.log(`[성공] ${code}${meta ? ` (${meta})` : ""} 현재가 ${prpr}`);
      }
    } catch (err) {
      fail += 1;
      const body = err.response?.data ?? err.message;
      console.log(`[오류] ${code} —`, typeof body === "string" ? body : JSON.stringify(body));
    }

    await sleep(delayMs);
  }

  console.log(`\n요약: 성공 ${ok} / 실패 ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
