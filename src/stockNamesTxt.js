import fs from "fs";
import path from "path";

const DEFAULT_FILE = "./stock_names.txt";

function resolvedPath() {
  const p = process.env.STOCK_NAMES_FILE?.trim();
  return p || DEFAULT_FILE;
}

let mapCache = /** @type {Map<string, string> | null} */ (null);

function buildMap() {
  const m = new Map();
  const abs = path.resolve(process.cwd(), resolvedPath());

  if (!fs.existsSync(abs)) {
    return m;
  }

  const raw = fs.readFileSync(abs, "utf-8");

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;

    let code = "";
    let name = "";

    const tabIdx = t.indexOf("\t");
    if (tabIdx !== -1) {
      code = t.slice(0, tabIdx).trim();
      name = t.slice(tabIdx + 1).trim();
    } else {
      const commaIdx = t.indexOf(",");
      if (commaIdx === -1) continue;
      code = t.slice(0, commaIdx).trim();
      name = t.slice(commaIdx + 1).trim();
    }

    if (!code || !name) continue;
    if (!/^[0-9A-Za-z]{6}$/.test(code)) continue;

    m.set(code.toUpperCase(), name);
  }

  return m;
}

/** @returns {Map<string, string>} */
export function loadStockNamesTxt() {
  if (!mapCache) mapCache = buildMap();
  return mapCache;
}

/** @param {string} stockCode */
export function getStockNameFromTxt(stockCode) {
  const key = String(stockCode).trim().toUpperCase();
  if (!/^[0-9A-Za-z]{6}$/.test(key)) return "";
  return loadStockNamesTxt().get(key) ?? "";
}

/** 개발 중 파일만 고친 뒤 다시 읽게 할 때 */
export function clearStockNamesTxtCache() {
  mapCache = null;
}

export function stockNamesTxtPathHint() {
  return resolvedPath();
}
