# Xtudy Universe

Xtudy Universe는 Firebase Auth·Firestore와 Vercel API를 사용하는 교육 콘텐츠 및 AI 교재 제작 플랫폼입니다.

## 구독 결제

Xtudy Standard의 결제 구조와 운영 전 점검 절차는 [docs/BILLING_OPERATIONS.md](docs/BILLING_OPERATIONS.md)를 참고합니다.

PG 정산 계좌는 가맹점 콘솔/계약에서 별도 설정합니다. 계좌정보는 소스코드, GitHub, Firebase, Vercel 환경변수에 저장하지 않습니다.

```bash
npm run test:billing
npm run build
```
