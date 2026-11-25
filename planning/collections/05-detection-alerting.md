# 5. 데이터에서 신호를 뽑아 행동으로 연결하기

기존 Anomaly Detection 컬렉션이 이 축에 들어갑니다.
"ML은 켰는데 그다음은?"이라는 질문에 답하려면 alerting과 한 묶음으로 보는 것이 자연스럽습니다.

- 기존 폴더: `src/content/docs/ml/anomaly-detection/` (위치는 0-1 결정에 따름)
- 예정 폴더(신규 글): `src/content/docs/detection/`
- 예정 labs: `labs/anomaly-detection/`(기존), `labs/detection/`

## 기존 글과 겹치는 범위

새 글을 시작하기 전에 아래를 먼저 확인합니다.

| 기존 글 | 이미 다루는 것 |
| --- | --- |
| 03. 메모리와 규모 | `model_memory_limit`, pruning, 결과와 snapshot retention, ML node 구성 |
| 06. 운영 체크리스트 | alert 전 과거 데이터 검증, 알림 양 세기, anomaly detection rule, job health rule, datafeed 운영, 장애와 복구 |
| 09. 공장 생산망 AIOps | alert에서 Workflow 호출, AI 1차 분석, Case 기록, 사람의 판단, 후속 조치 |

---

## 5-1-10. AD를 운영 루프에 정착시키기

상태: `미착수`
예정 파일: `ml/anomaly-detection/10-operating-loop.md` (또는 06, 09 보강)

### 범위 재정의 메모

계획 초기에 "결과를 alert, workflow, case로 연결하기"로 잡았지만, 연결 자체는 09편이 이미 다룹니다.
그래서 이 글은 **발행 이후**에 초점을 둡니다. 켜 놓은 AD가 몇 달 뒤에도 쓸모 있게 유지되는지, 아니면 아무도 안 보는 화면이 되는지를 가르는 운영 습관입니다.
첫 작업에서 06, 09와 다시 대조해 새 글로 낼지, 06에 절을 추가할지 결정합니다.

### 이 글이 답하는 질문

- anomaly가 뜨면 누가, 어떤 기준으로, 얼마 안에 봐야 하나
- 오탐을 확인했을 때 그 결과를 모델과 rule에 어떻게 되돌리나
- AD가 실제로 도움이 되고 있는지 무엇으로 측정하나
- 정기적으로 무엇을 점검하고 언제 job을 다시 설계하나

### 독자와 전제

- AD를 이미 켜 놓았고 운영 효과를 고민하는 운영자
- 기준: Elasticsearch, Kibana 9.x

### 범위

다룸:

- triage 기준표: score 구간, entity 중요도, 지속 시간에 따른 대응 등급 (해석)
- 피드백 루프: 확인된 오탐을 custom rule, filter list, calendar로 반영하는 절차 (05편 연결)
- 효과 지표 정의: 탐지까지 걸린 시간, 확인된 이상 비율, 무시된 alert 비율 등 (해석)
- 분기별 점검 항목: 데이터 변화, 학습 기간, job 재설계 신호

다루지 않음:

- alert에서 Workflow로 연결하는 구현 상세 (09편으로 링크)

### 목차 초안

1. 업무 문제: "켜 놓았는데 아무도 안 본다"
2. 운영 루프 개요 (mermaid)
3. triage 기준표
4. 피드백 반영 절차
5. 효과 측정 방법과 ES|QL 예시 (결과 index 조회)
6. 정기 점검 목록
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 기존 `labs/anomaly-detection/` 데이터에 오탐 사례를 주입하고 custom rule 반영 전후 결과 비교
- 결과 index를 ES|QL로 집계해 효과 지표를 계산하는 query 작성
- 산출물: query 모음, 전후 비교 결과

### 공식 출처

- [Anomaly detection](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection)
- [Generating alerts for anomaly detection jobs](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-alerts)
- Observability Labs: [AI-driven incident response with logs](https://www.elastic.co/observability-labs/blog/ai-driven-incident-response-with-logs)
- Observability Labs: [Using anomaly detection to identify fraud](https://www.elastic.co/observability-labs/blog/anomaly-detection-to-identify-fraud)

### 확인할 사실

- [ ] 결과 index의 문서 구조 중 집계에 쓸 필드(공식 문서 기준)
- [ ] custom rule과 filter list를 운영 중 바꿀 때의 반영 시점
- [ ] annotation API로 확인 결과를 남기는 방법

### 작업 항목

- [ ] 06, 09와 범위 대조 후 새 글 또는 기존 글 보강 결정, 이 문서에 기록
- [ ] labs 실험 실행
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 5-1-11. job이 수백 개를 넘을 때

상태: `미착수`
예정 파일: `ml/anomaly-detection/11-many-jobs.md` (또는 03 보강)

### 범위 재정의 메모

03편은 job 하나의 메모리와 ML node 구성을 다룹니다. 이 글은 **job 개수**가 늘어날 때 생기는 운영 문제에 집중합니다.
첫 작업에서 03과 대조해 새 글로 낼지, 03에 절을 추가할지 결정합니다.

### 이 글이 답하는 질문

- job이 수백 개가 되면 ML node를 어떻게 나누고 늘리나
- job을 어떻게 묶어서 관리하고 감시하나 (group, health rule 범위)
- 클러스터 업그레이드나 재시작 때 많은 job은 어떻게 다루나
- job을 늘리기 전에 무엇을 측정해야 하나

### 독자와 전제

- 서비스나 장비 단위로 job을 대량 생성하는 운영자
- 기준: Elasticsearch, Kibana 9.x

### 범위

다룸:

- job 수와 ML node 메모리, 할당의 관계
- job group 설계와 health rule을 group 단위로 나누는 방법
- 업그레이드와 재시작 시 ML 관련 공식 절차(upgrade mode 등)
- job 수를 줄이는 설계 대안: `partition_field_name`으로 묶기, population 분석 (01편 연결)

다루지 않음:

- 개별 job 튜닝 (01~05편)

### 목차 초안

1. 업무 문제: "job을 만들수록 운영이 무거워진다"
2. job 수가 늘 때 늘어나는 비용
3. 설계 결정: 묶을 것인가 나눌 것인가
4. 구현: group 규칙, health rule 구성 예시
5. 검증: labs 측정 (측정 범위 안에서만 결론)
6. 운영: 업그레이드와 재시작 절차
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 스크립트로 synthetic job 50 / 100 / 200개 생성
- 지표: ML node 메모리 사용, 모든 job 할당 완료까지 걸린 시간, health rule 동작
- 같은 탐지 범위를 job 여러 개와 partition job 하나로 구성해 메모리 비교
- 결과는 측정한 개수 범위 안에서만 해석하고, 그 이상은 "확인 필요"로 둠
- 산출물: job 생성 스크립트, 측정 결과

### 공식 출처

- [Anomaly detection](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection)
- [Generating alerts for anomaly detection jobs](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-alerts)
- [Prepare to upgrade](https://www.elastic.co/docs/deploy-manage/upgrade/prepare-to-upgrade) (ML 관련 절)

### 확인할 사실

- [ ] ML node당 동시 할당 관련 설정과 배포 형태별 변경 가능 여부
- [ ] 업그레이드 시 ML job 처리에 대한 공식 절차와 upgrade mode 동작
- [ ] job health rule의 job 선택 방식(group, 개별)
- [ ] ML node 메모리 비율 설정 기본값

### 작업 항목

- [ ] 03과 범위 대조 후 새 글 또는 기존 글 보강 결정, 이 문서에 기록
- [ ] job 생성 스크립트 작성과 측정
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 5-2. "alert가 없다 = 정상"을 보장하는 alerting 설계

상태: `미착수`
예정 파일: `detection/01-trustworthy-alerting.md`, `labs/detection/trustworthy-alerting/`

### 이 글이 답하는 질문

- alert가 안 오면 정상인가, 데이터가 안 들어온 것인가
- 순간적인 튐에 alert가 울리지 않게 하려면
- 같은 문제로 alert가 수십 개 쏟아질 때 어떻게 묶나
- rule이 실제로 동작하는지 운영 전에 어떻게 검증하나
- Classic alerting과 Universal Alerting 중 무엇을 쓰나

### 독자와 전제

- 모니터링과 알림 체계를 설계하는 운영자
- 기준: Kibana 9.x. Universal Alerting은 배포 형태별 제공 시점이 다르므로 글 쓰는 시점에 다시 확인

### 범위

다룸:

- no-data 처리 설계
- alert 지연과 recovery 조건
- grouping과 action policy로 알림 묶기
- 데이터를 일부러 끊거나 지연시켜 rule을 검증하는 방법
- rule 실행 이력 확인으로 "rule이 돌았는지"를 증명하는 방법
- Classic과 Universal Alerting의 차이와 선택 기준(공식 문서 범위)

다루지 않음:

- Security detection rule 설계

### 목차 초안

1. 업무 문제: "조용한 게 정상인지 고장인지 모른다"
2. alert가 신뢰를 잃는 네 가지 이유: no-data, 튐, 폭주, 미검증
3. 설계 결정: 각 문제에 대응하는 설정
4. 구현: ES|QL rule 예시, action policy 예시
5. 검증: labs에서 데이터 단절과 지연을 주입해 rule 반응 확인
6. 운영: rule 실행 이력 점검, 알림 양 관리
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 데이터 생성기에 단절 구간과 튐 구간을 주입하는 옵션 추가
- 같은 조건을 no-data 처리 유무, 지연 설정 유무로 나눠 rule 반응 기록
- 산출물: rule 정의, 주입 스크립트, 결과 타임라인

### 공식 출처

- [Kibana Universal Alerting overview](https://www.elastic.co/docs/explore-analyze/alerting/esql/system-overview)
- [Configure a rule in Kibana Universal Alerting](https://www.elastic.co/docs/explore-analyze/alerting/esql/rules/configure-a-rule)
- [Create a rule and observe the alert lifecycle](https://www.elastic.co/docs/explore-analyze/alerting/esql/get-started/create-your-first-rule)
- Observability Labs: [Kibana Universal Alerting](https://www.elastic.co/observability-labs/blog/kibana-universal-alerting)

### 확인할 사실

- [ ] Universal Alerting의 배포 형태별 제공 버전과 상태
- [ ] action policy 등 기능별 라이선스 조건
- [ ] Universal Alerting에서 지원하지 않는 Classic rule 유형(anomaly detection rule 포함 여부)
- [ ] no-data 처리 옵션과 기본 동작
- [ ] rule 실행 이력이 저장되는 위치와 보존 기간

### 작업 항목

- [ ] 데이터 생성기에 단절과 튐 주입 기능 추가
- [ ] rule 실험 실행과 기록
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)
