# Anomaly Detection Labs

[Anomaly Detection in Production](https://munsik.github.io/engineering-notes/ml/anomaly-detection/) 컬렉션의 실습 자료입니다.
실습 본문과 Dev Tools 코드는 [08. 실습](https://munsik.github.io/engineering-notes/ml/anomaly-detection/08-hands-on-lab/) 페이지에 있습니다.

데이터는 Kibana 샘플 Web logs(`kibana_sample_data_logs`)를 씁니다. 실제 운영 데이터는 쓰지 않습니다.

## 추가 예정 Kibana 화면

본문에 넣을 Kibana 화면 목록입니다. 캡처 후 `src/assets/ml-ad/`에 넣고 해당 페이지에 추가합니다. IP, 호스트명 같은 식별 정보는 가립니다.

| 페이지 | 화면 경로 | 촬영 대상 |
| --- | --- | --- |
| 04 결과 읽는 법 | Anomaly Explorer | `lab-weblogs-advanced`의 swim lane, Top influencers, 여러 detector가 섞인 Anomalies 표 |
| 04 결과 읽는 법 | Anomalies 표 행 펼치기 | Anomaly explanation |
| 04 결과 읽는 법 | Single Metric Viewer | 기대 범위(음영)와 이상 점. model plot이 켜진 샘플 job(`low_request_rate`) |
| 05 노이즈와 예외 처리 | Anomaly Explorer → Configure rules | scope와 numeric condition 설정 |
| 05 노이즈와 예외 처리 | Anomaly Detection → Settings | Calendars, DST Calendars, Filter Lists |
| 06 운영 체크리스트 | Stack Management → Rules → Create rule | Anomaly detection rule 설정 |
| 08 실습 (Lab 1) | Anomaly Detection → Jobs | 샘플 job 3개와 `lab-weblogs-advanced` |
| 08 실습 (Lab 2) | Jobs → `lab-weblogs-advanced` 펼침 | detector 3개와 split 설정(JSON) |
| 08 실습 (Lab 7) | Single Metric Viewer → Forecast | `low_request_rate` forecast |
