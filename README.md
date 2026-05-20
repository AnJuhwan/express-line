# 요청 구간 교통 리포트

요청 구간별 교통 정체 요약과 5분 단위/1시간 단위 원천 데이터를 보는 Next.js 앱입니다.

## 실행

```bash
npm install
npm run dev
```

웹 UI는 `http://localhost:3000`에서 확인합니다.

## 화면

- `/`: 요청 구간별 시간대 정체 리포트
- `/five-minute`: `data/csv-20260513-20260515/*.json` 기반 5분 단위 데이터 탐색
- `/hourly`: `data/csv-20260513-20260515/*.json` 기반 1시간 단위 데이터 탐색 및 CSV 다운로드

## 데이터

현재 앱은 `2026-05-13 ~ 2026-05-15` 기간의 오전 6시부터 오후 6시까지 데이터를 봅니다. 기존 `data/csv` JSON은 템플릿으로 보존하고, 앱은 새로 만든 `data/csv-20260513-20260515` 폴더를 읽습니다.

```bash
npm run build:traffic-data -- \
  /Users/anjuhwan/Downloads/20260513_5Min.csv \
  /Users/anjuhwan/Downloads/20260514_5Min.csv \
  /Users/anjuhwan/Downloads/20260515_5Min.csv
```

요약 리포트는 `src/lib/requested-traffic-home-report.json`을 사용합니다.
