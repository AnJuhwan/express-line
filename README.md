# 서울·인천 주요도로 혼잡 데이터 대시보드

서울·인천 주요도로의 속도, 혼잡도, 데이터 커버리지를 SQLite에 적재하고 Next.js 웹사이트에서 날짜/도로/단위별로 조회합니다.

## 실행

```bash
npm install
npm run traffic:init
npm run traffic:seed
npm run dev
```

웹 UI는 `http://localhost:3000`에서 확인합니다. DB 적재 상태를 행 단위로 확인하려면 `http://localhost:3000/data`의 전체 데이터 테이블을 사용합니다.

## API 키

`.env.example`을 참고해 필요할 때 `.env.local` 또는 셸 환경변수에 넣습니다.

- `SEOUL_OPENAPI_KEY`: 서울 열린데이터광장 TOPIS `TrafficInfo`
- `TDATA_API_KEY`: 서울교통빅데이터 T-DATA `1시간 소통정보 (구간별)`
- `TDATA_ROAD_DIV_NAME`: T-DATA 도로구분명 필터. 도시고속도로만 보려면 `도시고속도로`
- `PUBLIC_DATA_SERVICE_KEY`: 공공데이터포털 인천 도로 통행속도/교통량 API
- `ITS_API_KEY`: ITS 국가교통정보센터 실시간 교통소통정보 API
- `SEOUL_LINK_IDS`: 쉼표로 구분한 서울 TOPIS 링크 ID

## 수집 명령

```bash
npm run traffic:import:seoul-file -- --file ./downloaded-seoul-speed.csv
npm run traffic:collect:tdata -- --start 2026-01-01 --end 2026-05-19 --road 강변북로 --road-div 도시고속도로
npm run traffic:collect:its
npm run traffic:collect:seoul
npm run traffic:collect:ndjson
npm run traffic:collect:incheon -- --start 2026-05-01 --end 2026-05-19 --road 경인로
```

서울 열린데이터광장 `서울도시고속도로 일별 시간대별 교통소통(속도) 정보` 파일은 반기 단위 공개 파일이며, 현재 공개 파일은 2025년 하반기까지입니다. 2026년처럼 최신 날짜 범위의 시간대별 도로 속도는 T-DATA `1시간 소통정보 (구간별)` 수집기를 사용합니다.

API 키가 없으면 `traffic:seed` 샘플 데이터로 웹 UI와 CSV/XLSX 내보내기를 먼저 확인할 수 있습니다.

## 실시간 NDJSON 수집

원할 때 `npm run traffic:collect:ndjson`를 실행하면 현재 교통상황을 월별 NDJSON 파일에 누적합니다.

```text
data/realtime-traffic-2026-05.ndjson
```

각 줄은 독립 JSON이며 시간은 `2026-05-19 00:30` 형식의 KST 분 단위 문자열로 저장됩니다. 기본 수집 대상은 `올림픽대로,강변북로,수도권제1순환고속도로,남부순환로,신월여의지하도로`이며 서울·인천을 함께 조회합니다. 웹사이트는 커밋된 `data/realtime-traffic-*.ndjson` 파일을 시작 시 SQLite에 적재해 조회합니다.

수집에 사용하는 환경변수:

- `ITS_API_KEY`: ITS 실시간 교통소통정보 API 키
- `SEOUL_OPENAPI_KEY`: 선택 사항, TOPIS 링크 ID 기반 수집용
- `SEOUL_LINK_IDS`: 선택 사항, 쉼표로 구분한 TOPIS 링크 ID
- `TRAFFIC_TARGET_ROADS`: 선택 사항, 기본값 `올림픽대로,강변북로,수도권제1순환고속도로,남부순환로,신월여의지하도로`
- `TRAFFIC_TARGET_REGIONS`: 선택 사항, 기본값 `서울,인천`
- `TRAFFIC_TARGET_SECTION_KEYWORDS`: 선택 사항, 구간명/링크 ID 키워드 필터
- `TRAFFIC_TARGET_LINK_IDS`: 선택 사항, 정확한 링크 ID 필터
