# 06. Dashboard CI/CD

Kibana Dashboards API(9.5 GA)로 dashboard를 Git에 두고 배포하는 예시입니다. 공식 문서와 API reference 기준으로 작성했고 lab에서 실행 확인은 하지 않았습니다.

| 파일 | 하는 일 |
| --- | --- |
| [`dashboards/web-logs-overview.json`](dashboards/web-logs-overview.json) | 예시 dashboard. data view 참조 없이 `data_view_spec`으로 자체 완결. 형식은 공식 튜토리얼의 API 예시를 따름 |
| [`environments/staging.env.example`](environments/staging.env.example) | 환경별 `KIBANA_URL`, `SPACE` |
| [`scripts/export.sh`](scripts/export.sh) | GET 응답의 `data`만 key 정렬해 저장 |
| [`scripts/deploy.sh`](scripts/deploy.sh) | `PUT`으로 배포. HTTP 오류나 `warnings`가 있으면 실패 |
| [`scripts/verify.sh`](scripts/verify.sh) | 배포 뒤 되읽어 Git 정의와 비교 |
| [`scripts/drift.sh`](scripts/drift.sh) | 운영과 Git의 차이, 마지막 수정 시각과 사용자 |
| [`github-actions.yml`](github-actions.yml) | `.github/workflows/`에 넣어 쓰는 workflow 예시 |

`environments/*.env.example`을 `staging.env`, `production.env`로 복사해 값을 바꿔 씁니다. 파일 이름이 dashboard ID입니다. 필요: bash, curl, jq. 환경 변수 `KIBANA_API_KEY`는 CI secret으로 넣습니다.

예시 dashboard는 Kibana 샘플 웹 로그(`kibana_sample_data_logs`)를 씁니다. 대상 환경에 샘플 데이터를 설치하면 패널에 값이 나옵니다.
