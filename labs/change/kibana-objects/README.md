# 05. Kibana 객체 export, import

환경 변수 `KIBANA_URL`, `KIBANA_API_KEY`, `SPACE`를 정하고 실행합니다.

| 파일 | 하는 일 |
| --- | --- |
| [`export-saved-objects.sh`](export-saved-objects.sh) | 지정한 타입의 saved objects를 관련 객체까지 NDJSON으로 export |
| [`import-saved-objects.sh`](import-saved-objects.sh) | ID를 유지하며(`overwrite=true`) import하고, 오류가 있으면 실패로 끝남 |
| [`kibana-objects.console`](kibana-objects.console) | ID를 지정한 data view 생성, space 간 복사에서 ID 유지 |

export 결과의 `coreMigrationVersion`, `typeMigrationVersion`은 지우지 않습니다. 더 오래된 Kibana로는 import할 수 없습니다.
