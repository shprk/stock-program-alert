import xlsx from "xlsx";

export function loadKospiStockList() {
  const workbook = xlsx.readFile("./kospi.xls");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  const result = [];

  rows.forEach((row) => {
    if (row["상장시장"] === "KOSPI") {
      const stockCode = String(row["종목코드"]).padStart(6, "0");

      result.push({
        stockCode,
        stockName: row["회사명"],
      });
    }
  });

  return result;
}