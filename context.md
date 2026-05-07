# stock-program-alert — 기본 컨텍스트



_Last updated: 2026-05-03_



## 한 줄 요약



Node.js 기반으로 **한국투자증권 Open API**와 **실시간 프로그램매매(WebSocket)** 를 쓰고, **`stock_number.txt`에 적어 둔 종목코드 목록만** 구독한 뒤, **`NTBY_CNQN`(순매수체결량) 기준 1차·2차 조건이 맞을 때 Discord Webhook 알림**을 보내는 프로그램이다.



## 실행


- `npm install` 후 루트에 `.env` 복사(`.env.example` 참고)

- `./stock_number.txt` 에 감시할 **종목코드**를 쉼표·공백·줄바꿈으로 나열 (6글자 단축코드, 숫자만 또는 예: `00680K`)

- `npm start` → `node src/index.js`



### 선택 스크립트

- `npm run build:names` — 같은 코드 목록으로 KIS **종목 검색(search-info)** 를 돌려 **`stock_names.txt`** 를 자동 작성. 미조회 코드는 파일에 `# 미조회: 코드` 주석 줄로 남김. `--delay`(기본 250ms)로 호출 한도 조절.

- `npm run simulate:pgm:live` — **프로세스를 계속 돌리며** 랜덤 순매수체결량(`NTBY_CNQN`) 틱을 넣음. 기본은 **`stock_number.txt` 종목 풀**(실전과 같이 `stock_names.txt` 매핑 가능). 가짜 코드만 쓰려면 `--pool=synthetic`. 틱 속도는 `--interval-ms`(기본 400ms, 늘리면 디스코드·콘솔 빈도 감소). 기본 **120초마다 감시 맵을 비워** 반복 알림을 볼 수 있음(실전에는 없음). `Ctrl+C` 종료.

## 데이터·환경 변수 (중요만)



| 항목 | 용도 |

| --- | --- |

| `KIS_APP_KEY` / `KIS_APP_SECRET` | REST·승인키 발급 |

| `KIS_BASE_URL` | 한국투자증권 REST 베이스 URL(실전/모의 선택) |

| `KIS_WS_URL` | 실시간 프로그램매매 WebSocket 엔드포인트 |

| `DISCORD_WEBHOOK_URL` | 알림 전송용(로컬 `.env`에만 두고 **커밋하지 않을 것**) |

| `STOCK_NAMES_FILE` | (선택) `종목코드<TAB>종목명` 목록 파일 경로. 기본 `./stock_names.txt`. 실행 중 표시 이름은 이 파일만 사용(수동 갱신·`npm run build:names`). |

| `token.json` | access_token 재사용(`npm run build:names` 등 REST 호출 시) |

| `./stock_number.txt` | 감시할 종목코드 목록 |

| `./stock_names.txt` | (선택) 코드→한글명만 믿음. 없으면 알림 표기에 **코드만** (`stock_names.example.txt` 참고) |



`kisAuth.js`에서 `dotenv`를 로드한다.



## 프로그램 흐름



1. `getApprovalKey()` — `/oauth2/Approval` 로 **approval_key**

2. `loadStockCodesFromTxt()` (`stockNumberTxt.js`) 가 `./stock_number.txt` 에서 종목코드 목록 로드 (순서 유지, 동일 코드 중복 제거)

3. `./stock_names.txt`(`STOCK_NAMES_FILE`)가 있으면 `stockNamesTxt.js`·`hydrateNamesFromLocalFile` 로 **로컬 이름만** 메모리에 올림. 빠진 코드는 이름 없음(코드만 표시).

4. `connectRealtimeProgramTrade({ approvalKey, stockList })` (`realtimeProgramTrade.js`)

   - `KIS_WS_URL` 로 WebSocket 연결

   - 구독: `tr_id: H0NXPGM0`, `tr_key: 종목코드`

   - 연결 헤더에는 **access_token이 아니라 approval_key** 사용



## 실시간 파싱



- 메시지는 JSON이 아니라 `0|H0NXPGM0|001|^` 등으로 나뉘는 **파이프 구분 문자열**이다.

- `|` 로 나누고, payload는 `^` 로 필드를 나눈다.

- 현재 로직에서는 **`NTBY_CNQN`(순매수체결량, 변수명 `netBuyQty`)** 만으로 1차·2차를 판단한다.



## 감시·알림 규칙 (현 코드 기준)



- **감시 등록(1차)**: `netBuyQty <= -100000`(순매도 10만주 이상) 이고 해당 종목이 아직 `watchMap`에 없으면 등록하고, Discord로 **`[감시 시작] … 순매도 …주 기록`** 형태 메시지를 보낸다.

- **종목 줄 표기**: Discord·콘솔 알림의 `종목:` 은 **`stock_names.txt`에 한글명이 있으면 그 이름만** 표시. 없으면 **종목코드**만 표시(KIS 이름 조회는 `npm run build:names` 때만 사용).

- **조건 알림 (Discord, 2차)**: 감시 중 `netBuyQty`의 **최저 음수값**(=`lowestNetBuyQty`, 순매도 강도 피크)을 기준으로 현재값이 절반선 이상 회복했을 때 (`netBuyQty >= lowestNetBuyQty * 0.5`) 추가 알림을 보낸다. 종목당 **최초 한 번** (`alerted50`). 본문에는 **피크 순매도·현재 순매도**를 `abs(NTBY)` 기준 양수로 표시한다.

- **Discord 포맷**: `sendDiscordAlert`에서 본문 위·아래에 **구분선(▬)** 과 **KST 시각** 줄을 붙여, 연속 알림이 채팅에 쌓여도 눈으로 끊어 읽기 쉽게 한다. (콘솔 로그는 기존처럼 테두리 없음.)


## 로컬 전용 파일



- `.gitignore`: `node_modules/`, `.env`, `token.json`

- `stock_number.txt` 는 보통 개인용 목록이므로 필요 시 `.gitignore`에 추가한다.

- `stock_names.txt`(또는 `STOCK_NAMES_FILE`)는 코드·이름 매핑용. 예시는 `stock_names.example.txt`.



## 운영 시 주의 (요약)



- `.env`, `token.json`, Discord Webhook 등 **민감정보 커밋 금지**

- 실시간 프로그램매매 채널은 **환경에 따라 모의 미지원**일 수 있음.

- `npm run build:names` 호출 시 **초당 한도**(예: `EGW00201`)에 걸리면 `--delay` 를 늘린다.

- WebSocket **구독 종목 수 제한**이 있을 수 있음.


