---
title: Job 설계
description: anomaly detection job의 구성 요소, Kibana wizard별 차이, detector를 묶을지 나눌지 정하는 기준, partition / by / over와 influencer 설계를 다룹니다.
sidebar:
  label: 01. Job 설계
  order: 1
---

job 설계는 대부분 되돌릴 수 없습니다. detector 구성과 bucket span은 job을 만든 뒤에는 바꿀 수 없어서, 처음에 잘못 정하면 job을 다시 만들고 학습 기간을 처음부터 기다려야 합니다.
이 장은 그 전에 정해야 할 것들을 다룹니다. 그보다 먼저, anomaly detection이 이 문제에 맞는 도구인지부터 따져 봅니다.

:::note[기준]
Elasticsearch, Kibana 9.x 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
:::

## 이 문제에 맞는 도구인가

공식 문서는 anomaly detection에 맞는 데이터의 조건으로 세 가지를 듭니다. 시계열 데이터여야 하고, 시스템이나 업무의 상태를 보여 주는 핵심 지표여야 하며, Elasticsearch에 있어서 datafeed로 실시간으로 읽을 수 있으면 가장 좋습니다([Getting started](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-getting-started)).

여기에 하나를 더 따져 봐야 합니다. 같은 문제를 고정 임계값 rule이나 SLO로 더 단순하게 풀 수 있는지입니다.
아래 표는 공식 문서의 기준이 아니라 제가 현장에서 쓰는 판단 기준입니다.

| 상황 | 더 맞는 방법 | 이유 |
| --- | --- | --- |
| 정상 범위를 숫자로 정할 수 있다(디스크 사용률 90% 이상, 인증서 만료 7일 전) | 임계값 rule | 기준이 분명하면 학습이 필요 없고, 왜 울렸는지 설명하기도 쉽습니다. |
| 규정이나 계약으로 정해진 기준이 있다 | 임계값 rule | 감사나 보고에서 "어떤 기준으로 탐지했는가"에 고정값으로 답해야 합니다. anomaly score는 job이 지금까지 본 이상들 사이의 상대값이라 이 용도에 맞지 않습니다([04](../04-reading-results/#score가-정해지는-방식)). |
| 사용자 영향 기준의 목표(가용성, 응답 시간)를 관리하고 싶다 | SLO | 목표 대비 error budget이 얼마나 빨리 줄어드는지(burn rate)로 판단하는 게 맞습니다. |
| 시간대와 요일에 따라 정상 값이 달라 고정값을 정할 수 없다 | anomaly detection | 주기성을 알아서 배웁니다. |
| entity가 많아서 사람이 entity마다 기준을 정할 수 없다(호스트 수백 대, 설비, 사용자) | anomaly detection | `partition`으로 entity마다, `over`로 집단 대비로 봅니다. |
| 무엇이 이상인지 미리 정의할 수 없다(처음 보는 로그 패턴, 드문 process) | anomaly detection | `rare`와 categorization이 이 용도입니다. |
| 학습할 과거 데이터가 거의 없다(새 서비스, 수집을 막 시작함) | 당분간 임계값 rule | 주기성이 있는 데이터는 3주 이상 학습해야 결과를 믿을 만합니다([02](../02-bucket-span-and-data/#학습에-필요한-데이터-양)). |
| 특정 사건이 한 번이라도 나오면 바로 알아야 한다(특정 에러 코드, 특정 계정 로그인) | 조건 rule | 한 건 발생 자체가 사건이라면 확률 모델이 필요 없습니다. |

실제로는 하나만 고르는 경우가 드뭅니다. 기준이 분명한 부분은 임계값 rule로, 기준을 정하기 어려운 부분은 anomaly detection으로 나눠 맡깁니다.
[09장](../09-manufacturing-aiops/)도 업무상 의미 없는 낮은 사용률은 custom rule로 걸러 내고, 그 위에서 평소와 다른 변화만 anomaly detection으로 봅니다.

처음 시작한다면 핵심 지표 하나로 single metric job부터 만들어 결과를 보고, 그다음에 multi-metric job이나 split을 늘리는 순서를 공식 문서도 권합니다.

## 구성 요소

Anomaly detection은 시계열을 일정한 시간 단위(bucket)로 잘라 요약한 다음, 그 값이 과거 패턴에서 얼마나 벗어났는지를 확률로 따집니다.
사용자가 정하는 건 "무엇을 어떤 단위로 볼지"까지입니다. 주기성을 찾고 변화에 적응하는 일은 알고리즘이 알아서 합니다.

| 구성 요소 | 하는 일 | 알아 둘 점 |
| --- | --- | --- |
| datafeed | Elasticsearch에서 데이터를 읽어 job에 넘깁니다. `query`, `frequency`, `query_delay`, `aggregations` 같은 설정이 여기 있습니다. | job 하나에 datafeed는 하나뿐입니다. 분석하지 않을 데이터를 query에서 걸러 내는 곳이기도 합니다. |
| bucket span | 데이터를 요약하고 모델링하는 시간 단위입니다. 기본값은 `5m`이고 보통 5분에서 1시간 사이를 씁니다. | 하루를 딱 나누어떨어지게 하는 값이어야 합니다. job을 만든 뒤에는 바꿀 수 없습니다. |
| detector | 어떤 function을 어떤 field에 적용할지, 데이터를 어떻게 나눌지(`by`, `over`, `partition`) 정합니다. | 한 job에 여러 개를 둘 수 있지만, 만든 뒤에는 추가도 삭제도 변경도 안 됩니다. |
| influencer | 이상의 원인으로 의심할 만한 field입니다. 보통 `by`, `over`, `partition` field를 넣고, detector에 없는 field를 넣어도 됩니다. | detector가 여러 개라면 influencer를 두는 게 좋습니다. 결과를 entity별로 모아 주기 때문입니다. |
| model | 과거 패턴을 담은 baseline입니다. job이 열려 있는 동안 메모리에 올라가 계속 갱신됩니다. | `model_memory_limit`은 job마다 하나입니다. |

:::caution[만든 뒤에는 못 바꾸는 것들]
job을 만들고 나면 `analysis_config`(`bucket_span`, `detectors`, `influencers`, categorization 설정 등)는 바꿀 수 없습니다.
운영 중에 손댈 수 있는 건 detector의 `custom_rules`와 설명, retention 기간, model plot, group 같은 부가 설정 정도입니다.
설계 자체를 바꾸려면 job을 clone해서 처음부터 다시 학습시켜야 합니다.
:::

## Job 유형과 wizard

Kibana의 wizard는 job을 쉽게 만들도록 도와주는 화면일 뿐이고, 결과물은 모두 같은 분석 엔진에 들어가는 job 설정입니다.
API로 만들면 어떤 job이든 detector를 여러 개 둘 수 있습니다. wizard마다 다른 건 detector를 몇 개까지 허용하는지, split field를 어떻게 처리하는지입니다.

| wizard | detector 수 | split field 처리 | 쓰는 상황 |
| --- | --- | --- | --- |
| Single metric | 1개 | split 없음 | 핵심 KPI 하나가 튀거나 떨어지는 걸 볼 때. 처음 시작할 때 |
| Multi-metric | 1개 이상 | split field 하나를 모든 detector에 `partition_field_name`으로 똑같이 넣음 | 같은 entity 기준으로 여러 지표를 함께 볼 때 |
| Population | 1개 이상 | population field 하나를 모든 detector에 `over_field_name`으로 넣음. `by` field는 detector마다 따로 지정 가능 | entity가 많고, 서로 비교하고 싶을 때 |
| Advanced | 1개 이상 | detector마다 `by`, `over`, `partition`을 따로 지정. custom rule, `exclude_frequent` 같은 옵션도 전부 사용 가능 | detector마다 나누는 방식이 달라야 하거나, 세부 옵션이 필요할 때 |
| Categorization | 1개 | message field를 category로 묶고 `mlcategory` 기준으로 count 또는 rare | 로그 메시지 패턴이 바뀌는 걸 볼 때 |
| Rare, Geo | 1개 | rare 계열이나 `lat_long` function 전용 | 드문 값, 평소와 다른 위치를 찾을 때 |

multi-metric과 population wizard는 split 방식을 job 전체에 하나로 고정합니다.
그래서 "응답코드별 건수는 partition으로, client IP별 URL 다양성은 population으로"처럼 detector마다 기준이 달라야 하면 advanced wizard나 API를 써야 합니다.
wizard로 만든 job도 Jobs 목록의 Clone 메뉴로 열면 advanced 편집 화면에서 고칠 수 있습니다.

![data view를 고른 뒤 나오는 job 유형 선택 화면. 위쪽에는 데이터에 맞는 preconfigured job이, 아래에는 wizard 7종이 보입니다.](../../../../assets/ml-ad/kibana-job-wizards.jpg)

:::note[어디까지가 공식 문서인가]
multi-metric job에서 field로 split하면 값마다 독립된 baseline이 생긴다는 건 공식 문서에 나와 있고, 이건 `partition_field_name`의 정의와 같습니다.
다만 wizard마다 어떤 split 속성을 쓰는지까지는 공식 문서에 없어서, Kibana 소스 코드([job_creator](https://github.com/elastic/kibana/tree/main/x-pack/platform/plugins/shared/ml/public/application/jobs/new_job/common/job_creator))를 보고 정리했습니다.
:::

## Detector를 1개 둘까, 여러 개 둘까

detector가 여러 개인 job은 독립된 single metric job 여러 개를 한 묶음으로 돌린다고 생각하면 됩니다.
시계열 모델은 detector마다 따로 만들어지지만, 데이터를 읽는 datafeed와 bucket span, influencer, 메모리 한도, 결과 index, calendar는 job 단위로 같이 씁니다.
결국 "이것들을 같이 써도 괜찮은가"를 따져 보면 답이 나옵니다.

![job 안에 detector 3개가 있고, 결과가 bucket, record, influencer 세 층으로 나오는 구조를 그린 개념도](../../../../assets/ml-ad/job-detector-structure.png)

### 같이 쓰는 것, 따로 쓰는 것

| 구분 | 항목 | 실제로 의미하는 것 |
| --- | --- | --- |
| job 단위 | datafeed(indices, query, aggregation, runtime field) | detector마다 다른 index나 다른 query 조건을 줄 수 없습니다. |
| job 단위 | `bucket_span` | detector마다 시간 해상도를 다르게 할 수 없습니다. |
| job 단위 | `summary_count_field_name` | aggregation 입력을 쓸지 말지가 모든 detector에 같이 적용됩니다. `metric` function과는 함께 못 씁니다. |
| job 단위 | `influencers` | 모든 detector 결과에 같은 influencer가 붙습니다. |
| job 단위 | `model_memory_limit`, 결과 index, model snapshot, calendar | 메모리 한도 하나를 detector들이 나눠 씁니다. calendar event도 job 안의 모든 detector에 걸립니다. |
| job 단위 | forecast | forecast는 job 단위로 요청합니다. population(`over`) detector와 `rare`, `time_of_day` 같은 function은 forecast를 만들 수 없습니다. population detector가 섞인 job에서 실제로 어떻게 되는지는 아래에 적었습니다. |
| detector마다 | `function`, `field_name`, `by`, `over`, `partition` | detector마다 다른 질문을 던질 수 있습니다. |
| detector마다 | `custom_rules`, `exclude_frequent`, `use_null` | noise 처리는 detector별로 다르게 가져갈 수 있습니다. |

### 두 방식 비교

| 관점 | detector 1개짜리 job 여러 개 | detector 여러 개를 가진 job 1개 |
| --- | --- | --- |
| 결과 보기 | job마다 따로 봅니다. 묶어서 보려면 overall buckets API로 여러 job의 score를 합칩니다([06](../06-operations/#job을-나눴을-때-묶어-보기)). | overall bucket score 하나로 "그 시각에 시스템이 평소와 달랐다"를 알 수 있고, Anomaly Explorer에서 어느 detector가 잡았는지도 같이 보입니다. |
| 원인 찾기 | influencer가 job 안에서만 집계됩니다. | top influencer가 모든 detector를 가로질러 최댓값과 합계로 집계됩니다. |
| 규모와 관리 | job 수만큼 관리할 대상이 늘어납니다. | 공식 문서는 multi-metric job이 single metric job 여러 개보다 규모 면에서 낫다고 설명합니다. |
| 유연성 | job마다 bucket span, datafeed, aggregation, calendar, alert 정책을 다르게 줄 수 있습니다. | 위 설정을 전부 같이 써야 합니다. |
| 변경 | 바꿀 job 하나만 다시 만들면 됩니다. | detector 하나만 바꾸려 해도 job 전체를 clone해서 다시 학습시켜야 합니다. |
| 장애 영향 | 한 job이 멈춰도 나머지는 그대로 돕니다. | job이 멈추거나 메모리 한도에 걸리면 모든 detector가 같이 영향을 받습니다. |

:::note[forecast와 population detector, 직접 해 본 결과]
API 문서는 `over_field_name`이 있는 job에 forecast를 요청하면 에러가 난다고 설명합니다.
9.5.5(Elastic Cloud Hosted)에서 확인해 보니 조금 달랐습니다.

- population detector만 있는 job(`url_scanning`)은 `Forecast is not supported for population analysis` 에러가 납니다.
- population detector와 일반 detector가 섞인 job([실습](../08-hands-on-lab/)의 `lab-weblogs-advanced`)은 에러 없이 끝나고, population이 아닌 detector 0과 2의 forecast만 만들어졌습니다.

버전에 따라 다를 수 있으니, forecast가 꼭 필요한 지표라면 직접 확인해 보세요.
:::

### 판단 기준

아래는 위 제약을 바탕으로 정리한 제 판단 기준입니다.

| 상황 | 권장 |
| --- | --- |
| 같은 서비스나 호스트의 증상 지표(지연, 처리량, 에러율, 건수)를 같은 bucket span으로 볼 때 | 한 job에 detector 여러 개. [APM 시나리오](../07-scenarios/#apm-서비스-핵심-지표-4종)가 좋은 예입니다. |
| 지표마다 맞는 bucket span이 다를 때(예: rare는 짧게, 추세성 지표는 길게) | job을 나눕니다. |
| 한 detector만 aggregation datafeed로 읽고 싶을 때 | job을 나눕니다. `summary_count_field_name`은 job 전체에 걸리기 때문입니다. |
| forecast가 필요한 지표와 population 분석을 같이 하고 싶을 때 | job을 나누는 편이 깔끔합니다. 한 job에 두면 population detector만 빠진 forecast가 만들어져서, 무엇이 예측됐는지 헷갈리기 쉽습니다. |
| 데이터 소스(index)나 필터 조건이 다를 때 | job을 나눕니다. datafeed는 job당 하나뿐입니다. |
| alert를 받는 팀이나 심각도 기준이 다를 때 | job을 나누거나 job group으로 묶어 관리합니다. |

여러 영역의 job을 이 기준으로 나누고 group으로 다시 묶은 예는 [09장 결정 기록](../09-manufacturing-aiops/#결정-기록)에 있습니다.
| split field의 cardinality가 아주 클 때 | population을 검토하거나, datafeed query로 범위를 나눠 job을 쪼갭니다. |

:::tip
`function`, `field_name`, `by`, `over`, `partition` 조합이 똑같은 detector를 한 job에 두 번 넣으면 job이 만들어지지 않습니다.
그리고 detector마다 `detector_description`은 꼭 적어 두세요. 결과 화면이나 alert에서 어떤 detector인지 알아보는 유일한 단서가 됩니다.
:::

## partition, by, over

field 값으로 데이터를 나누는 방법은 세 가지이고, 무엇과 비교하느냐가 다릅니다. 아래 정의는 9.x API reference의 설명을 옮긴 것입니다.

| 설정 | 무엇과 비교하나(API 정의) | 예 | 주의할 점 |
| --- | --- | --- | --- |
| `partition_field_name` | 분석 자체를 나눕니다. 값마다 완전히 독립된 baseline을 가집니다. | 응답코드별 건수, host별 CPU iowait. 값마다 규모가 크게 다를 때 | 값 개수(cardinality)에 비례해 메모리가 늘어납니다. |
| `by_field_name` | 값마다 자기 자신의 과거와 비교합니다. split 안에서 평소와 다른 값을 찾습니다. | host별 드문 process(`rare` by process, partition host), APM transaction type별 지연 | `rare`와 `freq_rare`는 `by` field가 꼭 있어야 합니다. `partition`과 같이 쓸 수 있습니다. |
| `over_field_name` | 모든 split의 과거와 비교합니다. population 전체에서 튀는 값을 찾습니다. | 다른 client보다 URL을 유독 많이 훑는 IP, 다른 고객보다 구매액이 큰 고객 | forecast가 안 됩니다. cardinality가 10보다 작으면 잘 맞지 않을 수 있습니다. |

![왼쪽은 host마다 따로 baseline을 갖는 partition, 오른쪽은 같은 bucket 안에서 client끼리 비교하는 over를 그린 개념도](../../../../assets/ml-ad/partition-vs-over.png)

`by`와 `partition`은 둘 다 값마다 따로 모델링하지만 역할이 다릅니다.
`partition`은 분석을 바깥에서 쪼개는 단위이고, `by`는 그 안에서 값마다 과거를 보는 단위입니다.
그래서 Elastic이 제공하는 job도 "host마다(`partition`) 그 host에서 드문 process(`by`)", "service마다(`partition`) transaction type별(`by`) 지연"처럼 둘을 겹쳐 씁니다.

population 분석은 entity가 수십만, 수백만이어도 entity마다 시계열을 따로 만드는 것보다 자원을 적게 씁니다.
대신 entity끼리 행동이 너무 다르면 효과가 떨어집니다. 그럴 땐 datafeed query로 그룹을 나누거나 `partition`을 함께 씁니다.

`by`나 `partition` 값이 없는 문서는 기본적으로 분석에서 빠집니다. `use_null: true`를 주면 값이 없는 문서도 별도 시계열로 분석합니다.
Elastic이 제공하는 로그 job은 이 옵션으로 dataset 정보가 빠진 로그까지 지켜봅니다.

이름이 `by`, `count`, `over`인 field는 `by_field_name`이나 `over_field_name`에 쓸 수 없습니다. 그리고 Kibana wizard는 split field의 cardinality가 1,000을 넘으면 메모리 경고를 띄웁니다.

## Influencer

공식 문서는 influencer를 보통 3개 이하로 두라고 권합니다. 많아지면 결과가 복잡해지고 분석에 약간의 부담이 생깁니다.

다만 Elastic Security가 제공하는 job은 조사에 필요한 host, user, source IP, process 정보를 같이 남기려고 influencer를 7~8개씩 둡니다.
보안처럼 조사할 때 맥락이 중요한 용도라면 늘려도 괜찮다고 봅니다. 대신 PoC에서 메모리와 결과 양을 꼭 확인하세요.

influencer는 detector에서 쓰지 않은 field여도 됩니다. 다만 datafeed가 query로 읽는다면 detector field와 같은 문서에 있어야 하고, aggregation으로 읽는다면 aggregation 안에 포함돼 있어야 반영됩니다.
필요하면 datafeed의 `runtime_mappings`로 influencer용 field를 만들 수도 있습니다.

서로 다른 job의 결과를 같은 influencer 값(`trace.id`)으로 이어서 원인을 좇는 설계는 [09장 Influencer와 상관 분석](../09-manufacturing-aiops/#influencer와-상관-분석)에 정리했습니다.

influencer는 특정 값을 가진 데이터를 빼고 다시 평가했을 때 이상이 사라지는지를 보는 식으로 계산됩니다. 그래서 통계적으로 의미 있는 influencer만 결과에 남습니다.

## 참고 문서

- [Job types](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-anomaly-detection-job-types)
- [Working with anomaly detection at scale](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/anomaly-detection-scale)
- [Performing population analysis](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-populations)
- [Create an anomaly detection job (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-put-job)
- [View the results](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-view-results)
