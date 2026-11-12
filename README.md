# stock-program-alert

한국 주식 프로그램 매매의 순매수체결량을 장중에 감시하고, 순매도가 크게 나온 뒤 그 규모가 줄어들면 Discord로 알리는 Node.js 프로그램입니다.

프로그램 매매 수급은 장중에 빠르게 변하지만, 다수의 종목을 지속적으로 확인하기는 어렵습니다. 이 프로젝트는 KRX Open API를 통해 시가총액 1조 원 이상의 종목을 자동으로 선별하고, 한국투자증권 Open API의 WebSocket을 활용해 해당 종목들의 프로그램 매매 순매수체결량을 실시간으로 수신하고 감시합니다. 순매도가 10만 주 이상 발생한 이후, 최저 순매수체결량 대비 순매도 규모가 절반 이하로 줄어드는 시점을 Discord 알림으로 전달합니다.

## 주요 기능

- **종목 목록 수집.** KRX Open API의 일별매매로 KOSPI와 코스닥 종목을 가져옵니다.
- **시가총액 필터.** 목록을 만들 때 시가총액 하한 이상만 남깁니다. 기본값은 1조 원입니다. 장중 감시는 시총을 다시 계산하지 않고, 만들어진 종목 목록만 구독합니다.
- **실시간 수신.** 한국투자증권 WebSocket으로 프로그램 매매 데이터를 받습니다. 별도 설정이 없으면 KRX 채널을 구독합니다.
- **순매도 감시.** 순매수체결량이 `-100,000` 이하면 감시를 시작합니다. 이후 종목별 최저 순매수체결량 대비 순매도 규모가 50% 이상 줄어들면 알립니다.
- **Discord 알림.** 감시 시작, 50% 완화, 장 시작과 15:40 종료, 주말 휴식을 Webhook으로 보냅니다.
- **장 시간 자동화.** KST 평일 09:00부터 연결하고, 15:40에 종료한 뒤 그날은 다시 연결하지 않습니다. 주말에는 연결하지 않습니다. 15:40 전에 연결이 끊기면 30초 주기 확인에서 다시 연결합니다.

## 기술 스택

| 기술 |
| --- | 
| javascript |
| Node.js |
| WebSocket |
| Webhook |
| AWS EC2 |


## 시스템 동작 흐름

<img
  src="https://github-production-user-asset-6210df.s3.amazonaws.com/86956783/702956473-7e74a113-7db5-493f-8c37-963c01ee1e84.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAVCODYLSA53PQK4ZA%2F20261112%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261112T005010Z&X-Amz-Expires=300&X-Amz-Signature=a17c2c38a10e59ee67b089a4272a9a75aae40d1c12497f0f61f09ccaacc7674b&X-Amz-SignedHeaders=host&response-content-type=image%2Fpng"
  alt="주식 프로그램 알림 흐름도"
  width="400"
/>

1. KRX REST API로 일별매매를 조회하고, 시가총액 하한 이상 종목만 목록으로 남깁니다.
2. 한국투자증권 REST API로 WebSocket 연결에 필요한 인증 키를 받습니다. 종목 한글명이 필요하면 같은 REST API의 종목검색으로 따로 만듭니다.
3. 장중이면 한국투자증권 WebSocket에 연결하고, 목록의 종목을 구독합니다.
4. 수신 데이터에서 순매수체결량(`NTBY_CNQN`)을 읽습니다.
5. 종목별 감시 조건을 판단합니다.
6. 조건에 맞으면 Discord Webhook으로 알림을 보냅니다.

## 핵심 비즈니스 로직

```js
// src/realtimeProgramTrade.js — handleProgramTrade
if (netBuyQty <= -100000 && !watchMap.has(stockCode)) {
  watchMap.set(stockCode, {
    stockCode,
    displayLabel,
    lowestNetBuyQty: netBuyQty,
    alerted50: false,
  });
  // 감시 시작 알림 후 return
  return;
}

const stock = watchMap.get(stockCode);
if (!stock) return;

if (netBuyQty < stock.lowestNetBuyQty) {
  stock.lowestNetBuyQty = netBuyQty;
}

if (
  stock.lowestNetBuyQty < 0 &&
  netBuyQty >= stock.lowestNetBuyQty * 0.5 &&
  !stock.alerted50
) {
  // 50% 완화 알림
  stock.alerted50 = true;
}
```
[`handleProgramTrade` 실제 코드](https://github.com/shprk/stock-program-alert/blob/main/src/realtimeProgramTrade.js#L93-L145)

`NTBY_CNQN`은 프로그램 매매 순매수체결량입니다. 양수면 순매수, 음수면 순매도입니다. 값이 더 작을수록, 즉 더 음수일수록 순매도 규모가 큽니다. 판단 기준은 주가가 아닙니다.

1. **감시 시작.** 순매수체결량이 `-100,000` 이하이면 그 종목의 감시를 시작하고 알립니다. 순매도 10만 주 이상입니다.
2. **최저값 갱신.** 감시 중인 종목은 지금까지의 순매수체결량 중 가장 작은 값을 기억합니다. 순매도가 더 커질 때만 이 최저값을 바꿉니다.
3. **50% 완화.** 현재 순매수체결량이 `최저 순매수체결량 × 0.5` 이상이면, 순매도 규모가 그 피크의 절반 이하로 줄어든 것으로 보고 알립니다. 종목당 한 번입니다.
