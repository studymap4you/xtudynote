# Xtudy Standard Billing Operations

## 현재 안전 상태

- 기본값은 `BILLING_LIVE_ENABLED=false`, `BILLING_ENFORCEMENT_ENABLED=false`입니다.
- PG 키나 계약이 없으면 결제 등록을 성공으로 가장하지 않고 `설정 필요`로 표시합니다.
- 테스트 키가 아닌 Toss 운영 키는 live가 꺼진 상태에서 사용할 수 없습니다.
- KakaoPay 테스트는 `TCSUBSCRIP` CID만 허용합니다.
- 정산 계좌는 PG 가맹점 콘솔/계약에서만 설정하며 코드, GitHub, Firebase, Vercel에 저장하지 않습니다.

## 상품 정책

`billing_plans/standard`가 표시 가격과 실제 청구액의 유일한 원본입니다. 최초 API 접근 시 아래 기본 문서가 없으면 Admin SDK가 생성합니다.

| 필드 | 값 |
| --- | --- |
| 상품 | Xtudy Standard |
| 정가 | 36,000 KRW |
| 프로모션 가격 | 18,000 KRW |
| 무료 기간 | 가입 시점부터 달력 1개월 |
| 이후 결제 | 매월 18,000 KRW |

클라이언트가 보낸 `amount`는 받지도, 사용하지도 않습니다. 모든 승인 요청은 서버가 플랜 문서를 다시 조회해 금액을 결정합니다.

## 구조

### 사용자 흐름

1. `/billing`이 플랜, 무료체험 가능 여부, 구독 상태를 서버 API로 조회합니다.
2. 사용자가 자동결제 조건에 동의하고 Toss 카드 또는 KakaoPay를 선택합니다.
3. `/api/billing?action=start-checkout`이 만료되는 checkout session과 무작위 고객 식별자를 만듭니다.
4. Toss는 공식 SDK의 `requestBillingAuth()`를 열고, KakaoPay는 서버가 만든 Ready URL로 이동합니다.
5. `/billing/callback/{provider}`는 Firebase ID token과 PG 콜백 값을 서버로 전달합니다.
6. 서버가 PG API로 빌링키 또는 SID 발급 결과를 검증한 뒤 서버 전용 결제수단 문서와 구독을 저장합니다.

Toss의 공식 브라우저 SDK는 무작위 `customerKey`를 인자로 요구하므로 등록 세션 동안 이 불투명 값을 브라우저에 전달합니다. 이메일, UID, 전화번호는 사용하지 않으며 UI나 Firestore Client SDK에는 저장하지 않습니다. 콜백 값은 메모리에 읽은 즉시 주소창과 브라우저 기록에서 제거합니다. `billingKey`는 언제나 서버 전용입니다.

### 정기 청구

- Vercel Cron이 매일 `01:00 UTC`(`10:00 KST`)에 `/api/billing-cron`을 GET으로 호출합니다.
- `Authorization: Bearer ${CRON_SECRET}`이 정확히 일치해야 실행됩니다.
- `nextBillingAt <= now`인 trial, active, past_due 구독을 최대 100건씩 처리합니다.
- `billingCycleId = hash(uid + billingCycleAnchorAt)`를 문서 ID로 사용합니다.
- 같은 cycle이 `paid`, `processing`, `reconciliation_required`이면 PG를 다시 호출하지 않습니다.
- 확정 실패는 24시간, 최초 실패 시점 기준 72시간에 재시도하며 각 시도는 별도 provider order ID를 사용합니다.
- 네트워크 타임아웃처럼 결제 성공 여부가 불명확한 경우 자동 재청구하지 않고 `reconciliation_required`로 남겨 중복 결제를 막습니다.

현재 Vercel Cron 배치는 한 번에 100건입니다. 구독자가 이 규모를 넘기기 전에 큐 기반 worker 또는 페이지네이션된 다중 job으로 전환해야 합니다.

## Firestore Collections

| Collection | 역할 | Client 권한 |
| --- | --- | --- |
| `billing_plans` | 서버 가격 정책 | 읽기만 허용 |
| `subscriptions` | 상태, 기간, 다음 결제일 | 본인·super admin 읽기, 쓰기 거부 |
| `payment_transactions` | 월별 결제 및 재시도 | 본인·super admin 읽기, 쓰기 거부 |
| `billing_customers` | 무작위 customerKey, identity hash | 읽기·쓰기 거부 |
| `payment_methods` | Toss billingKey / Kakao SID | 읽기·쓰기 거부 |
| `billing_events` | 동의·상태 변경 감사 이벤트 | 읽기·쓰기 거부 |
| `trial_history` | 이메일 HMAC 기반 1회 무료체험 이력 | 읽기·쓰기 거부 |
| `billing_checkout_sessions` | 만료·잠금이 있는 등록 세션 | 읽기·쓰기 거부 |
| `billing_settings` | 관리자 재시도 정책 | 읽기·쓰기 거부 |

서버 전용 collection은 Firebase Admin SDK만 접근합니다. 관리자 화면도 Client SDK로 이 문서들을 직접 읽지 않고 `/api/billing`의 관리자 전용 액션을 사용합니다.

## 상태 전이

- 신규: `trial` -> 결제 성공 `active`
- 확정 결제 실패: `past_due` -> 재시도 성공 `active`
- 무료체험 해지: 즉시 `cancelled`, 다음 결제 없음
- 유료 해지: `cancel_pending`, 현재 기간 종료 시 `cancelled`
- 해지 완료 시 Kakao SID 비활성화 또는 Toss billingKey 삭제를 시도합니다.
- `past_due`는 설정된 grace period 동안 entitlement를 유지합니다.

무료체험은 `trial_history/{HMAC(normalizedEmail)}`로 유지되므로 같은 이메일의 탈퇴·재가입은 두 번째 무료체험을 받지 않습니다. HMAC 원문 이메일은 trial history 문서에 저장하지 않습니다.

## 환경 변수

아래 값은 Vercel의 Preview와 Production을 구분해 등록합니다. Secret에는 `VITE_` 접두사를 사용하지 않습니다.

```text
FIREBASE_SERVICE_ACCOUNT_JSON
APP_PUBLIC_ORIGIN
TOSS_PAYMENTS_CLIENT_KEY
TOSS_PAYMENTS_SECRET_KEY
KAKAOPAY_SECRET_KEY
KAKAOPAY_CID
KAKAOPAY_CID_SECRET
BILLING_LIVE_ENABLED=false
BILLING_ENFORCEMENT_ENABLED=false
BILLING_TRIAL_HASH_SECRET
BILLING_RETRY_OFFSETS_HOURS=24,72
BILLING_PAST_DUE_GRACE_DAYS=7
BILLING_CHECKOUT_SESSION_MINUTES=20
CRON_SECRET
```

`BILLING_TRIAL_HASH_SECRET`와 `CRON_SECRET`은 각각 24자 이상의 서로 다른 무작위 값이어야 합니다.

## PG 계약 및 수동 설정

### Toss Payments

1. 자동결제(빌링) 서비스 계약 및 심사를 완료합니다.
2. 테스트 환경에서는 자동결제용 `test_` client/secret key를 등록합니다.
3. 운영 승인 후 운영 client/secret key를 Production에만 등록합니다.
4. 운영 정산계좌는 Toss Payments 가맹점 계약 또는 상점관리자에서 등록합니다.

### KakaoPay

1. KakaoPay 온라인 결제용 애플리케이션과 Web 도메인을 등록합니다.
2. 비즈앱 전환 및 온라인 결제 제휴, 정기결제 사용 승인을 완료합니다.
3. 테스트는 `TCSUBSCRIP`과 개발용 Secret Key를 사용합니다.
4. 운영 승인 후 발급받은 정기결제 CID와 운영 Secret Key를 Production에만 등록합니다.
5. 운영 정산계좌는 KakaoPay 가맹점 계약에서 등록합니다.

콜백 화면은 다음 경로를 사용합니다.

```text
https://xtudynote.vercel.app/billing/callback/toss
https://xtudynote.vercel.app/billing/callback/kakaopay
```

## 단계별 출시

1. Firestore rules와 애플리케이션을 배포합니다.
2. 무작위 trial/cron secret, `APP_PUBLIC_ORIGIN`, PG 테스트 키를 Vercel Preview에 등록합니다.
3. `BILLING_LIVE_ENABLED=false`, `BILLING_ENFORCEMENT_ENABLED=false`를 확인합니다.
4. 신규 trial, 첫 결제, 다음 달 결제, 중복 Cron, 실패·재시도, 수단 교체, 두 종류의 해지를 테스트합니다.
5. PG 가맹점 계약과 정산계좌 등록을 완료합니다.
6. 운영 키를 Production에 등록한 뒤 소액 운영 검증과 대사 절차를 완료합니다.
7. 결제 생성 자체가 검증된 다음 `BILLING_LIVE_ENABLED=true`로 전환합니다.
8. 기존 사용자 전환 정책과 고객 공지를 마친 뒤에만 `BILLING_ENFORCEMENT_ENABLED=true`로 전환합니다.

## 운영 화면과 검사

- 사용자: `/billing`
- 관리자: `/admin/billing`
- Cron: `/api/billing-cron`

```bash
npm run test:billing
npm run build
```

자동 테스트는 요구된 17개 시나리오와 월말, grace period, live 차단, Toss/KakaoPay 요청 계약, 실제 중복 처리 방지를 포함해 총 24개를 실행합니다.
