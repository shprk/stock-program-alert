# stock-program-alert — 기본 컨텍스트

_Last updated: 2026-11-11_

## 한 줄 요약

Node.js 기반으로 **한국투자증권 Open API**와 **실시간 프로그램매매(WebSocket)** 를 쓰고, **`stock_number.txt`에 적어 둔 종목코드 목록만** 구독한 뒤, **`NTBY_CNQN`(순매수체결량) 기준 1차·2차 조건이 맞을 때 Discord Webhook 알림**을 보내는 프로그램이다. 연결은 `src/index.js`가 **KST 평일 09:00~15:40**에만 유지한다.

## 실행

- `npm install` 후 루트에 `.env` 복사(`.env.example` 참고)
- `./stock_number.txt` 에 감시할 **종목코드**를 쉼표·공백·줄바꿈으로 나열 (6글자 단축코드, 숫자만 또는 예: `00680K`)
- `npm start` → `node src/index.js`

### 선택 스크립트

- `npm run build:stocks` — KRX OPEN API로 KOSPI·코스닥 일별매매를 조회해, 시가총액이 하한 이상인 종목코드를 시총 내림차순으로 `stock_number.txt`에 쓴다. 기준일 `--bas-dd`(또는 `KRX_BAS_DD`)가 없으면 **직전 KST 평일**을 쓴다. 토·일만 건너뛰고 공휴일은 걸러지지 않는다. 시총 하한은 `--min-cap` 또는 `KRX_MIN_MARKET_CAP`, 없으면 `1000000000000`(1조 원). `--dry-run`이면 파일을 쓰지 않는다. `src/buildStockNumberFromKrx.js`.
- `npm run build:names` — `stock_number.txt` 코드로 KIS **종목 검색(search-info)** 를 돌려 **`stock_names.txt`** 를 작성. 미조회 코드는 `# 미조회: 코드` 주석 줄로 남긴다. `--delay`(기본 250ms). `src/buildStockNamesFile.js`. 이 스크립트만 `getAccessToken()`과 `token.json`을 사용한다.
- `npm run simulate:pgm:live` — WebSocket 없이 랜덤 `NTBY_CNQN` 문자열을 `dispatchProgramTradeSocketText`에 넣는다. 기본 종목 풀은 `stock_number.txt`. 가짜 코드는 `--pool=synthetic`. 틱 간격 `--interval-ms`(기본 400ms). 기본 **120초마다 `watchMap`을 비운다**(실전 `index.js`에는 이 초기화가 없다). `Ctrl+C` 종료.

## 데이터·환경 변수 (중요만)

| 항목 | 용도 |
| --- | --- |
| `KIS_APP_KEY` / `KIS_APP_SECRET` | approval key·access token 발급 |
| `KIS_BASE_URL` | 한국투자증권 REST 베이스 URL(실전/모의 선택) |
| `KIS_WS_URL` | 실시간 WebSocket. 코드에 기본 URL은 없다 |
| `KIS_PGM_TR_ID` | 프로그램매매 TR. 없으면 `KIS_PROGRAM_TRADE_TR_ID`, 둘 다 없으면 `H0STPGM0` (`getProgramTradeTrId`) |
| `DISCORD_WEBHOOK_URL` | 알림 전송용. 로컬 `.env`에만 두고 커밋하지 않을 것. 없으면 전송을 생략한다 |
| `STOCK_NAMES_FILE` | (선택) 종목명 파일 경로. 기본 `./stock_names.txt`. 장중 표시 이름은 이 파일만 사용 |
| `KRX_AUTH_KEY` | `npm run build:stocks` 필수 |
| `KRX_BAS_DD` / `KRX_MIN_MARKET_CAP` | (선택) 목록 생성 기준일·시총 하한 |
| `token.json` | access token 재사용. `npm run build:names` 등 REST 호출용. 장중 WebSocket은 쓰지 않는다 |
| `./stock_number.txt` | 감시할 종목코드. `npm start`는 시작 시 한 번 읽는다 |
| `./stock_names.txt` | (선택) `코드<TAB 또는 쉼표>한글명`. `#` 줄은 무시. 없으면 알림에 코드만 쓴다 |

`.env.example`의 `KIS_ACCOUNT_NO`, `KIS_ACCOUNT_PRODUCT_CODE`는 현재 소스에서 읽지 않는다.

`kisAuth.js`와 `realtimeProgramTrade.js`가 로드될 때 `dotenv.config()`를 호출한다. 목록·이름 생성 스크립트는 `import "dotenv/config"`를 쓴다.

## 프로그램 흐름

1. `main` (`src/index.js`)이 `loadStockCodesFromTxt()` (`stockNumberTxt.js`)로 `./stock_number.txt`를 읽는다. 6자리 영숫자만 남기고, 순서를 유지한 채 중복을 제거한다.
2. `hydrateNamesFromLocalFile` (`kisStockLookup.js`)이 `stock_names.txt`의 이름만 메모리 `nameCache`에 올린다. 장중에는 KIS 종목검색을 호출하지 않는다.
3. 즉시 한 번, 이후 30초마다 `tickOnce`가 돈다. 시각은 `marketSchedule.js`가 `Asia/Seoul` 벽시계로 계산한다.
4. **KST 날짜가 바뀌면** WebSocket을 끊고 `clearProgramTradeWatchMap()`으로 감시 상태를 비운다. 당일 종료 표시, 시작 알림 표시, 메모리에 둔 approval key도 지운다.
5. **15:40**이면 그날 한 번 Discord로 정규장 종료를 알리고 연결을 끊는다. 같은 날에는 다시 붙지 않는다. 이 종료만으로는 `watchMap`을 비우지 않는다.
6. **장외·주말**에는 연결하지 않는다. 주말 Discord는 그 주말의 토요일 날짜를 키로 토·일 합쳐 1회. `isMarketOpenAt`은 토·일만 쉬고, **공휴일은 장중으로 본다.**
7. **평일 09:00~15:40**이고 연결이 없으면 `getApprovalKey()` (`kisAuth.js`, `POST /oauth2/Approval`)로 approval key를 받는다. 같은 KST 날짜에는 메모리 값을 재사용하고 파일에는 저장하지 않는다.
8. `connectRealtimeProgramTrade({ approvalKey, stockList })` (`realtimeProgramTrade.js`)
   - `KIS_WS_URL`로 WebSocket 연결
   - 구독 JSON의 `tr_id`는 `getProgramTradeTrId()` 결과, `tr_key`는 종목코드
   - TR 의미(코드 주석): `H0STPGM0` KRX, `H0NXPGM0` NXT 단독, `H0UNPGM0` 통합. 환경 변수가 없으면 `H0STPGM0`
   - 헤더에는 **access token이 아니라 approval key**를 넣는다. `custtype`은 `"P"`, `tr_type`은 `"1"`
   - 그날 첫 연결이면 Discord로 `[감시 시작] 시총 1조 이상 {종목 수}개 종목 모니터링 가동`을 보낸다. "시총 1조"는 고정 문장이고, 종목 수만 `stockList.length`다. 시총 필터 자체는 `build:stocks`가 파일을 만들 때 적용된다
9. 소켓이 예상 밖으로 끊기면 다음 30초 틱에서, 아직 장중이면 다시 연결한다.

## 실시간 파싱

- 메시지는 JSON이 아니라 `0|{TR}|001|{종목코드}^{체결시각}^...^{NTBY}` 형태의 **파이프 구분 문자열**이다. `{TR}`은 당시 `getProgramTradeTrId()` 값이다.
- `|`로 나누고, payload는 `^`로 나눈다. 0번이 종목코드, 1번이 체결시각, 6번이 `netBuyQty`다. 체결시각은 조건에 쓰지 않는다.
- 6번이 숫자가 아니거나 TR이 현재 구독 TR과 다르면 버린다.
- 본문에 `SUBSCRIBE SUCCESS`가 있으면 로그만 남긴다. `PINGPONG`은 응답 없이 무시한다.
- 판단은 **`NTBY_CNQN`(변수명 `netBuyQty`)** 만 사용한다. `handleProgramTrade`.

## 감시·알림 규칙 (현 코드 기준)

- **감시 등록(1차)**: `netBuyQty <= -100000`(순매도 10만 주 이상)이고 해당 종목이 아직 `watchMap`에 없으면 등록한다. Discord·콘솔 문장은 `[감시 시작] {라벨}: 순매도 N주 기록`이다. 라벨은 `stock_names.txt`에 한글명이 있으면 **이름만**, 없으면 **코드만**이다.
- **조건 알림(2차)**: 감시 중 가장 낮은 `netBuyQty`를 `lowestNetBuyQty`로 갱신한다. `lowestNetBuyQty < 0`이고 `netBuyQty >= lowestNetBuyQty * 0.5`이며 아직 `alerted50`가 아니면 Discord로 한 번 알린다. 본문의 피크·현재 순매도는 `abs(NTBY)` 양수다. 문장은 `종목명: {라벨} ({종목코드})`라서 **코드는 항상 붙는다.**
- **그 외 Discord**: 당일 첫 장중 연결, 15:40 종료, 주말 휴식. 모두 `sendDiscordAlert`를 탄다.
- **Discord 포맷**: `frameDiscordNotice`가 본문 위·아래에 **구분선(▬)** 과 **KST 시각**을 붙인다. 콘솔 로그에는 이 테두리를 붙이지 않는다. 전송 실패는 로그만 남기고 재시도하지 않는다.
- `watchMap`은 `realtimeProgramTrade.js`의 메모리 상태다. 프로세스를 다시 켜면 비고, KST 날짜가 바뀔 때 비운다.

## 로컬 전용 파일

- `.gitignore`: `node_modules/`, `.env`, `token.json`, `.cursor/`
- `stock_number.txt`는 개인용 목록이므로 필요하면 `.gitignore`에 추가한다.
- `stock_names.txt`(또는 `STOCK_NAMES_FILE`)는 코드·이름 매핑용이다.

## 운영 시 주의 (요약)

- `.env`, `token.json`, Discord Webhook 등 **민감정보 커밋 금지**
- 실시간 프로그램매매 채널은 **환경에 따라 모의 미지원**일 수 있음
- `npm run build:names`가 초당 한도(예: `EGW00201`)에 걸리면 `--delay`를 늘린다
- WebSocket **구독 종목 수 제한**이 있을 수 있음
- 공휴일에도 평일 시각이면 연결을 시도한다. 장 휴장 여부는 코드가 조회하지 않는다
