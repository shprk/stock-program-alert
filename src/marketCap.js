// import axios from "axios";

// const MARKET_CAP_LIMIT = 500_000_000_000;

// // 현재는 테스트용 목록
// // 다음 단계에서 코스피 전체 종목 리스트로 교체
// const kospiStockList = [
//   "005930", // 삼성전자
//   "000660", // SK하이닉스
//   "035420", // NAVER
// ];

// function calculateMarketCap(price, listedShares) {
//   return price * listedShares;
// }

// async function fetchStockInfo(stockCode, accessToken) {
//   try {
//     const response = await axios.get(
//       `${process.env.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
//       {
//         headers: {
//           "content-type": "application/json; charset=UTF-8",
//           authorization: `Bearer ${accessToken}`,
//           appkey: process.env.KIS_APP_KEY,
//           appsecret: process.env.KIS_APP_SECRET,
//           tr_id: "FHKST01010100",
//         },
//         params: {
//           fid_cond_mrkt_div_code: "J",
//           fid_input_iscd: stockCode,
//         },
//       }
//     );

//     const data = response.data.output;

//     const currentPrice = Number(data.stck_prpr);
//     const listedShares = Number(data.lstn_stcn);

//     if (!currentPrice || !listedShares) {
//       console.log(`[시총 계산 제외] ${stockCode}`);
//       return null;
//     }

//     return {
//       stockCode,
//       stockName: data.hts_kor_isnm,
//       currentPrice,
//       listedShares,
//       marketCap: calculateMarketCap(currentPrice, listedShares),
//     };
//   } catch (error) {
//     console.log(`[종목 조회 실패] ${stockCode}`);
//     console.log(error.response?.data || error.message);
//     return null;
//   }
// }

// export async function getMarketCapFilteredStocks(accessToken) {
//   const result = [];

//   for (const stockCode of kospiStockList) {
//     const stock = await fetchStockInfo(stockCode, accessToken);

//     if (!stock) continue;

//     if (stock.marketCap >= MARKET_CAP_LIMIT) {
//       result.push({
//         stockCode: stock.stockCode,
//         stockName: stock.stockName,
//         marketCap: stock.marketCap,
//       });
//     }

//     await new Promise((resolve) => setTimeout(resolve, 100));
//   }

//   return result;
// }

import axios from "axios";
import { loadKospiStockList } from "./stockList.js";

const MARKET_CAP_LIMIT = 500_000_000_000;

// 테스트용 (나중에 전체 종목으로 교체)
// const kospiStockList = [
//   "005930",
//   "000660",
//   "035420",
// ];

// 단위 자동 보정
function parseMarketCap(rawValue) {
  const value = Number(String(rawValue).replace(/,/g, ""));

  // 값이 작으면 억 단위로 판단
  if (value < 1_000_000_000) {
    return value * 100_000_000;
  }

  return value;
}

async function fetchStockInfo(stockCode, accessToken) {
  try {
    const response = await axios.get(
      `${process.env.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          appkey: process.env.KIS_APP_KEY,
          appsecret: process.env.KIS_APP_SECRET,
          tr_id: "FHKST01010100",
        },
        params: {
          fid_cond_mrkt_div_code: "J",
          fid_input_iscd: stockCode,
        },
      }
    );

    const data = response.data.output;

    const marketCap = parseMarketCap(data.hts_avls);

    return {
      stockCode,
      stockName: data.hts_kor_isnm,
      marketCap,
    };
  } catch (error) {
    console.log(`[조회 실패] ${stockCode}`);
    return null;
  }
}

export async function getMarketCapFilteredStocks(accessToken) {
  const kospiStockList = await loadKospiStockList();
  const result = [];

  for (const stock of kospiStockList) {
    const stockInfo = await fetchStockInfo(stock.stockCode, accessToken);

    if (!stockInfo) continue;

    if (stockInfo.marketCap >= MARKET_CAP_LIMIT) {
      result.push({
        stockCode: stockInfo.stockCode,
        stockName: stock.stockName,
        marketCap: stockInfo.marketCap,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return result;
}

// export async function getMarketCapFilteredStocks(accessToken) {
//   const result = [];

//   for (const stockCode of kospiStockList) {
//     const stock = await fetchStockInfo(stockCode, accessToken);

//     if (!stock) continue;

//     if (stock.marketCap >= MARKET_CAP_LIMIT) {
//       result.push(stock);
//     }

//     await new Promise((r) => setTimeout(r, 100));
//   }

//   return result;
// }
