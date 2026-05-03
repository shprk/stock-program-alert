/**
 * DISCORD_WEBHOOK_URL 로 테스트 메시지 1건 전송 (실시간/종목 없이 웹훅만 확인).
 *
 *   npm run discord:test
 *   node src/testDiscordWebhook.js 내가 쓴 테스트 문구
 */
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.DISCORD_WEBHOOK_URL?.trim();
const extra = process.argv.slice(2).join(" ").trim();

const body = {
  content:
    extra ||
    `[stock-program-alert] 웹훅 테스트 (${new Date().toISOString()})`,
};

if (!url) {
  console.error("DISCORD_WEBHOOK_URL 이 .env 에 없습니다.");
  process.exit(1);
}

try {
  await axios.post(url, body);
  console.log("디스코드로 전송했습니다. 채널에서 메시지를 확인하세요.");
} catch (err) {
  console.error("전송 실패:", err.response?.data ?? err.message);
  process.exit(1);
}
