import axios from "axios";
import { getAccessToken } from "./kisAuth.js";
import { getStockNameFromTxt } from "./stockNamesTxt.js";

/** 성공한 한글명만 캐시 (실패는 캐시하지 않음 → 이후 재시도·파일 추가 반영 가능) */
const nameCache = /** @type {Map<string, string>} */ (new Map());

/** 모의투자 시 TR_ID: 실전 `CTPF1604R` → `VTPF1604R` (공식 파이썬 kis_auth 규칙) */
let searchInfoDiagLogged = false;

function kisBaseUrl() {
  let b = String(process.env.KIS_BASE_URL ?? "").trim();
  if (b.endsWith("/")) b = b.slice(0, -1);
  return b;
}

function logSearchInfoOnce(/** @type {unknown} */ detail) {
  if (searchInfoDiagLogged) return;
  searchInfoDiagLogged = true;
  console.error("[KIS search-info] 첫 호출 문제 (이후 메시지 생략):", detail);
}

function searchTrId() {
  const base = kisBaseUrl();
  return base.includes("vts") ? "VTPF1604R" : "CTPF1604R";
}

function normalizeSearchRows(payload) {
  const raw =
    payload?.output ?? payload?.output2 ?? payload?.Output2 ?? [];

  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return [raw];
  return [];
}

function stockNameFromRow(row) {
  return String(
    row?.hts_kor_isnm ?? row?.prdt_name ?? row?.prdt_abrv_name ?? ""
  ).trim();
}

/** @returns {boolean} */
function rowMatchesCode(row, want) {
  const w = String(want).trim().toUpperCase();
  const candFields = [
    row?.mksc_shrn_iscd,
    row?.pdno,
    row?.prdt_cd,
    row?.shtn_iscd,
  ].filter(Boolean);

  for (const raw of candFields.map((x) => String(x))) {
    const u = raw.trim().toUpperCase();
    const stripped = u.replace(/^A(?=[0-9A-Z])/i, "");
    if (u === w || stripped === w) return true;
  }

  return false;
}

/**
 * 로컬 파일·캐시 없이 KIS `search-info` 만 호출.
 *
 * @param {string} stockCode
 */
export async function fetchStockNameFromKis(stockCode) {
  const key = String(stockCode).trim().toUpperCase();
  if (!key) return "";

  const token = await getAccessToken();
  if (!token) {
    return "";
  }

  const base = kisBaseUrl();
  if (!base) return "";

  try {
    const { data } = await axios.get(
      `${base}/uapi/domestic-stock/v1/quotations/search-info`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: String(process.env.KIS_APP_KEY ?? "").trim(),
          appsecret: String(process.env.KIS_APP_SECRET ?? "").trim(),
          tr_id: searchTrId(),
        },
        params: {
          PRDT_TYPE_CD: "300",
          PDNO: key,
        },
      }
    );

    if (data && data.rt_cd != null && String(data.rt_cd) !== "0") {
      logSearchInfoOnce({
        rt_cd: data.rt_cd,
        msg_cd: data.msg_cd,
        msg1: data.msg1,
      });
      return "";
    }

    const rows = normalizeSearchRows(data);
    const row = rows.find((r) => rowMatchesCode(r, key)) ?? rows[0];
    const name = row ? stockNameFromRow(row) : "";

    if (!name && row && Object.keys(row).length > 0) {
      logSearchInfoOnce({
        hint: "응답 행은 있으나 종목명 필드를 찾지 못함",
        sampleKeys: Object.keys(row),
      });
    }

    return name;
  } catch (err) {
    logSearchInfoOnce(
      /** @type {{ message?: string }} */ (err)?.response?.data ??
        /** @type {{ message?: string }} */ (err)?.message
    );
    return "";
  }
}

/**
 * `stock_names.txt`(및 시작 시 채워 둔 캐시)만 사용. 없으면 빈 문자열.
 * KIS 종목명 조회는 `npm run build:names` 용 `fetchStockNameFromKis` 에만 두고, 런타임에서는 호출하지 않음.
 *
 * @param {string} stockCode
 */
export async function resolveStockNameForCode(stockCode) {
  const key = String(stockCode).trim().toUpperCase();
  if (!key) return "";

  if (nameCache.has(key)) {
    return nameCache.get(key) ?? "";
  }

  const fromTxt = getStockNameFromTxt(key);
  if (fromTxt) {
    nameCache.set(key, fromTxt);
    return fromTxt;
  }

  return "";
}

/**
 * 알림 표기: `stock_names.txt` 등으로 이름 있으면 **한글명만**, 없으면 종목코드.
 *
 * @param {string} stockCode
 */
export async function stockLabelForAlert(stockCode) {
  const code = String(stockCode).trim();
  const name = await resolveStockNameForCode(code);
  return name ? name : code;
}

/**
 * `stock_names.txt` 만으로 캐시 채움 (HTTP 없음).
 *
 * @param {string[]} codes
 * @returns {number} 채워진 개수
 */
export function hydrateNamesFromLocalFile(codes) {
  let n = 0;

  for (const c of codes) {
    const key = String(c).trim().toUpperCase();
    if (!key) continue;

    const nm = getStockNameFromTxt(key);
    if (nm) {
      nameCache.set(key, nm);
      n += 1;
    }
  }

  return n;
}
