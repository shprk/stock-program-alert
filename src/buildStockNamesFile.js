/**
 * `stock_number.txt` 의 종목코드만으로 KIS search-info 를 돌려 `stock_names.txt` 생성.
 *
 *   npm run build:names
 *   node src/buildStockNamesFile.js --input=./stock_number.txt --output=./stock_names.txt --delay=250
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAccessToken } from "./kisAuth.js";
import { fetchStockNameFromKis } from "./kisStockLookup.js";
import { loadStockCodesFromTxt } from "./stockNumberTxt.js";

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeName(s) {
  return String(s)
    .replace(/[\t\r\n]+/g, " ")
    .trim();
}

async function main() {
  const inputPath = parseArg("--input", "./stock_number.txt");
  const outputPath = parseArg("--output", "./stock_names.txt");
  const delayMs = Number.parseInt(parseArg("--delay", "250"), 10) || 250;

  if (!process.env.KIS_BASE_URL || !process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    console.error(".env 에 KIS_BASE_URL, KIS_APP_KEY, KIS_APP_SECRET 이 필요합니다.");
    process.exit(1);
  }

  const codes = loadStockCodesFromTxt(inputPath);
  const outAbs = path.resolve(process.cwd(), outputPath);

  const header = [
    `# 자동 생성 ${new Date().toISOString()}`,
    `# 소스: ${path.resolve(process.cwd(), inputPath)}`,
    `# 형식: 종목코드<TAB>한글종목명`,
    "",
  ];

  console.log(`${codes.length}개 코드 → ${outputPath} (요청 간격 ${delayMs}ms)`);

  const token = await getAccessToken();
  if (!token) {
    console.error("access_token 발급 실패");
    process.exit(1);
  }

  const bodyLines = [];
  let ok = 0;
  let miss = 0;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    process.stdout.write(`\r(${i + 1}/${codes.length}) ${code}   `);

    const raw = await fetchStockNameFromKis(code);
    const name = sanitizeName(raw);

    if (name) {
      bodyLines.push(`${code}\t${name}`);
      ok += 1;
    } else {
      bodyLines.push(`# 미조회: ${code}`);
      miss += 1;
    }

    await sleep(delayMs);
  }

  fs.writeFileSync(outAbs, [...header, ...bodyLines, ""].join("\n"), "utf-8");

  console.log(`\n완료: ${outputPath} — 이름 조회 ${ok} / 미조회 ${miss}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
