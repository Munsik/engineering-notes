# 변화 관리 labs

[변화 관리 컬렉션](https://munsik.github.io/engineering-notes/change/)의 명령 모음과 스크립트입니다. `.console` 파일은 Kibana Dev Tools에 붙여 넣어 씁니다. 공식 문서와 API reference 기준으로 작성했고, lab 클러스터에서 실행 확인은 하지 않았습니다. 이름이 `my-`, `logs-app-`, `prod-repo`인 부분은 환경에 맞게 바꿉니다.

| 파일 | 글 |
| --- | --- |
| [`change-map.console`](change-map.console) | 01. 바뀌는 것의 지도. drift 확인 |
| [`change-process.console`](change-process.console) | 02. 변경 절차. 사전, 사후 점검 |
| [`managed-assets.console`](managed-assets.console) | 03. managed 자산. 찾기와 `@custom`에 얹기 |
| [`data-definitions.console`](data-definitions.console) | 04. 데이터 정의 변경. simulate, rollover, ILM explain, 영향 분석 |
| [`kibana-objects/`](kibana-objects/) | 05. Kibana 객체. saved objects export, import 스크립트 |
| [`dashboards-as-code/`](dashboards-as-code/) | 06. Dashboard CI/CD. export, deploy, verify, drift 스크립트와 GitHub Actions 예시 |
| [`cluster-config.console`](cluster-config.console) | 07. 클러스터 구성 변경 |
| [`upgrade-precheck.console`](upgrade-precheck.console) | 08. 메이저 업그레이드 사전 점검과 전용 snapshot |
| [`version-inventory.sh`](version-inventory.sh) | 09. 보안 공지 대응. 구성 요소 버전 인벤토리 |
| [`data-migration.console`](data-migration.console) | 10. 데이터 이관. reindex from remote와 검증 |
