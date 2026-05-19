# 요청 구간 교통 리포트

요청 구간별 교통 정체 요약과 5분 단위 원천 데이터를 보는 Next.js 앱입니다.

## 실행

```bash
npm install
npm run dev
```

웹 UI는 `http://localhost:3000`에서 확인합니다.

## 화면

- `/`: 요청 구간별 시간대 정체 리포트
- `/five-minute`: `data/csv/*.json` 기반 5분 단위 전체 데이터 탐색

## 데이터

`/five-minute`는 로컬 `data/csv` 폴더의 JSON 파일을 서버 페이징으로 읽습니다. 요약 리포트는 `src/lib/requested-traffic-home-report.json`을 사용합니다.
