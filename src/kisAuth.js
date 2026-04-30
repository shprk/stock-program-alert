import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const TOKEN_FILE = "token.json";

// function readSavedToken() {
//   if (!fs.existsSync(TOKEN_FILE)) return null;

//   const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
//   const expiredAt = new Date(tokenData.expired_at).getTime();
//   const now = Date.now();

//   if (now < expiredAt - 5 * 60 * 1000) {
//     return tokenData.access_token;
//   }

//   return null;
// }

function readSavedToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null;

  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    if (!raw.trim()) return null;

    const tokenData = JSON.parse(raw);
    const expiredAt = new Date(tokenData.expired_at).getTime();
    const now = Date.now();

    if (now < expiredAt - 5 * 60 * 1000) {
      return tokenData.access_token;
    }

    return null;
  } catch {
    return null;
  }
}

function saveToken(accessToken, expiredAt) {
  fs.writeFileSync(
    TOKEN_FILE,
    JSON.stringify(
      {
        access_token: accessToken,
        expired_at: expiredAt,
      },
      null,
      2
    )
  );
}

// export async function getAccessToken() {
//   const savedToken = readSavedToken();

//   if (savedToken) {
//     console.log("저장된 Access Token 재사용");
//     return savedToken;
//   }

//   try {
//     const response = await axios.post(
//       `${process.env.KIS_BASE_URL}/oauth2/tokenP`,
//       {
//         grant_type: "client_credentials",
//         appkey: process.env.KIS_APP_KEY,
//         appsecret: process.env.KIS_APP_SECRET,
//       },
//       {
//         headers: {
//           "content-type": "application/json; charset=UTF-8",
//         },
//       }
//     );

//     const accessToken = response.data.access_token;
//     const expiredAt = response.data.access_token_token_expired;

//     saveToken(accessToken, expiredAt);

//     console.log("Access Token 신규 발급 성공");
//     return accessToken;
//   } catch (error) {
//     console.error("Access Token 발급 실패");
//     console.error(error.response?.data || error.message);
//     return null;
//   }
// }

export async function getAccessToken() {
  const savedToken = readSavedToken();

  if (savedToken) {
    console.log("저장된 Access Token 재사용");
    return savedToken;
  }

  const response = await axios.post(
    `${process.env.KIS_BASE_URL}/oauth2/tokenP`,
    {
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    },
    {
      headers: {
        "content-type": "application/json; charset=UTF-8",
      },
    }
  );

  const accessToken = response.data.access_token;
  const expiredAt = response.data.access_token_token_expired;

  saveToken(accessToken, expiredAt);

  console.log("Access Token 신규 발급");
  return accessToken;
}

// export async function getApprovalKey() {
//   try {
//     const response = await axios.post(
//       `${process.env.KIS_BASE_URL}/oauth2/Approval`,
//       {
//         grant_type: "client_credentials",
//         appkey: process.env.KIS_APP_KEY,
//         secretkey: process.env.KIS_APP_SECRET,
//       },
//       {
//         headers: {
//           "content-type": "application/json; charset=UTF-8",
//         },
//       }
//     );

//     console.log("Approval Key 발급 성공");
//     return response.data.approval_key;
//   } catch (error) {
//     console.error("Approval Key 발급 실패");
//     console.error(error.response?.data || error.message);
//     return null;
//   }
// }

export async function getApprovalKey() {
  const response = await axios.post(
    `${process.env.KIS_BASE_URL}/oauth2/Approval`,
    {
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      secretkey: process.env.KIS_APP_SECRET,
    },
    {
      headers: {
        "content-type": "application/json; charset=UTF-8",
      },
    }
  );

  console.log("Approval Key 발급 성공");
  return response.data.approval_key;
}
