# 공장 생산망 AIOps 실습 자료

[09. Use case: 공장 생산망 AIOps](https://munsik.github.io/engineering-notes/ml/anomaly-detection/09-manufacturing-aiops/) 글에서 쓴 workflow입니다.
Anomaly detection job 생성 API는 본문에 Dev Tools 형식으로 있습니다.

| 파일 | 내용 |
| --- | --- |
| `mfg-anomaly-triage.yaml` | anomaly detection alert를 받아 근거 수집, `ai.prompt` 1차 분석, Case 기록, `waitForInput` 판단, `waitForApproval` 승인 후 조치까지 이어지는 workflow |
| `mfg-workflow-failure-alert.yaml` | 위 workflow가 `failed`로 끝나면 당직 채널로 알리는 `workflows.failed` handler |

## 쓰기 전에 바꿀 값

| 위치 | 예시 값 | 바꿀 내용 |
| --- | --- | --- |
| `consts.log_index` | `logs-mes-*` | MES 로그 인덱스 |
| `consts.calendar_id` | `mes-planned-downtime` | 계획 정지 calendar ID |
| `triage.connector-id` | `mfg-llm` | Kibana에 만든 AI connector ID |
| `slack` step의 `connector-id` | `mfg-ops-slack` | Slack connector ID |
| `restart_adapter` | `mfg-ops-api`, URL | 실제 조치 API. 없으면 이 step과 `approve_restart`를 지웁니다 |
| 저장 계정 | - | rule과 workflow는 운영용 계정으로 저장합니다. alert workflow는 rule을 마지막으로 저장한 사용자 권한으로 돕니다 |

## 버전

- Elastic Stack 9.5 이상 기준입니다. `waitForApproval`은 9.5에서 preview이고, `workflows.failed` trigger는 9.5부터 GA(9.4 preview)입니다.
- 9.4에서는 `steps.review.output.response.*`를 `steps.review.output.*`로 바꾸고, `waitForApproval`을 `waitForInput`(승인 boolean 하나)으로 바꾸세요.

## 연결

workflow를 저장한 뒤, Anomaly detection rule(대상 group `mes-all`)의 Actions에서 **Workflows**를 골라 이 workflow를 붙입니다.
`type: alert` trigger만으로는 실행되지 않습니다.
