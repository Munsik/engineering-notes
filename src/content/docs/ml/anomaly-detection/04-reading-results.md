---
title: 결과 읽는 법
description: bucket, record, influencer 결과의 차이, anomaly score가 정해지는 방식과 renormalization, severity 구간, detector가 여러 개인 job을 읽는 방법을 다룹니다.
sidebar:
  label: 04. 결과 읽는 법
  order: 4
---

## 결과의 세 층

| 결과 | 의미 | 주로 쓰는 곳 |
| --- | --- | --- |
| bucket `anomaly_score` | 그 bucket의 모든 record 이상 정도를 통계적으로 집계하고 정규화한 값입니다. detector가 여러 개면 모두 합쳐 하나로 요약합니다. | 상위 요약과 알림. "16:05에 시스템이 평소와 달랐다"를 알려 줍니다. |
| `record_score` | detector 하나, entity 하나의 이상 확률을 0~100으로 바꾼 값입니다. `detector_index`, `actual`, `typical`이 함께 기록됩니다. | 어떤 detector에서 무엇이 얼마나 벗어났는지 조사할 때 |
| `influencer_score` | 그 entity가 이상에 기여한 정도입니다. 특정 detector에 묶이지 않습니다. | 원인 entity 찾기. detector가 여러 개일 때 특히 유용합니다. |

Kibana Anomaly Explorer에서 timeline은 bucket 점수를, influencer swim lane과 top influencers는 influencer 점수를, 이상 목록은 record 점수를 씁니다.
그래서 같은 시점이라도 화면마다 숫자가 조금씩 다를 수 있습니다.

결과의 timestamp는 bucket의 시작 시각입니다. 15분 bucket 11:45~12:00의 결과는 11:45로 기록됩니다.

:::tip["어느 entity가 원인인가"를 물을 때]
bucket 점수는 시간대 전체의 요약입니다. 원인 후보를 고를 때는 그 bucket의 influencer 결과를 `influencer_score` 순으로 봅니다.
여러 job에서 동시에 높게 나오는 entity가 근본 원인일 가능성이 높고, 한 job에만 나오는 entity는 영향을 받은 쪽인 경우가 많습니다.
:::

## Score가 정해지는 방식

모델은 먼저 관측값이 나올 확률을 계산하고, 확률이 낮을수록 높은 점수를 줍니다.
점수는 절대값이 아니라 그 job이 지금까지 본 이상 중 상대적인 순위입니다. 100에 가까울수록 job이 지금까지 본 가장 큰 이상이라는 뜻입니다.

처음 기록되는 점수에는 세 가지 요인이 영향을 줍니다.

| 요인 | 내용 |
| --- | --- |
| single bucket impact | 해당 bucket 값의 확률입니다. 짧은 spike나 dip의 점수를 주로 결정합니다. |
| multi-bucket impact | 현재와 직전 11개, 즉 12개 bucket을 함께 봅니다. 현재 값이 정상 범위여도 직전 구간이 이상했으면 높게 나옵니다. Kibana에서는 점 대신 `+` 표시로 보입니다. |
| anomaly characteristics impact | 이상의 길이와 크기를 과거 평균과 비교합니다. 기본 동작은 긴 이상을 짧은 spike보다 높게 평가합니다. 짧은 이상은 데이터 오류인 경우가 많기 때문입니다. |

![기대 범위 안에서 움직이던 시계열에 한 bucket짜리 spike와 길게 이어지는 이상이 함께 나타난 개념 도식](../../../../assets/ml-ad/spike-vs-sustained.png)

점수를 낮추는 요인도 두 가지 있습니다.

- **high variance penalty**: 원래 변동이 큰 시간대(예: 매일 자정 배치)에서는 기대 범위가 넓어 점수가 낮아집니다.
- **incomplete bucket penalty**: 평소보다 데이터가 덜 들어온 bucket은 신뢰도가 낮아 점수가 낮아집니다. 수집 지연이 원인인 경우가 많습니다.

이 요인들은 record 결과의 `anomaly_score_explanation` field와 Kibana의 Anomaly explanation 영역에서 확인할 수 있습니다.

| field | 내용 |
| --- | --- |
| `anomaly_type` | `spike` 또는 `dip` |
| `anomaly_length` | 이상이 이어진 bucket 수 |
| `single_bucket_impact`, `multi_bucket_impact`, `anomaly_characteristics_impact` | 위 세 요인의 영향 |
| `high_variance_penalty`, `incomplete_bucket_penalty` | 점수 감소 요인이 적용됐는지 여부 |
| `typical_value`, `lower_confidence_bound`, `upper_confidence_bound` | 기대값과 95% 신뢰 구간 |

## Renormalization

더 큰 이상이 나오면 과거 점수가 낮아집니다. 이를 renormalization이라고 합니다.
그래서 처음 기록된 점수(`initial_record_score`, `initial_anomaly_score`)와 현재 점수(`record_score`, `anomaly_score`)가 따로 있습니다.

- 결과 index를 직접 조회해 알림이나 리포트를 만든다면 initial 점수를 기준으로 삼아야 합니다. 그래야 나중에 점수가 낮아져 기록이 빠지는 일을 피할 수 있습니다.
- "어제 90이던 점수가 오늘 55가 됐다"는 질문의 대부분은 renormalization입니다. 설정을 의심하기 전에 두 점수를 나란히 봅니다.
- 조정 범위는 `renormalization_window_days`로 정해집니다.

## Severity 구간

Kibana는 점수에 따라 이상을 다음과 같이 표시합니다. 구간 경계는 Kibana 소스 코드([`anomaly_threshold.ts`](https://github.com/elastic/kibana/blob/main/x-pack/platform/packages/shared/ml/anomaly_utils/anomaly_threshold.ts))의 값입니다.

| 점수 | 표기 | 운영 활용 예 |
| --- | --- | --- |
| 75 이상 | critical | 즉시 알림. alert rule의 기본 임계값이 75입니다. |
| 50~75 | major | 주간 리뷰 또는 낮은 우선순위 알림 |
| 25~50 | minor | 추세 리뷰, 튜닝 후보 수집 |
| 3~25 | warning | 평상시 노이즈 수준 |
| 3 미만 | low | 리뷰 대상 아님 |

:::note
점수가 낮은 이상도 여러 job에서 같은 시각에 함께 나오면 의미가 있습니다. 한 job의 높은 점수만 보지 말고, [overall buckets](../06-operations/#job을-나눴을-때-묶어-보기)로 동시에 나타나는 이상을 함께 봅니다.
:::

## Detector가 여러 개인 job 읽기

- overall swim lane은 job 전체의 bucket 점수입니다. influencer swim lane의 단순 합이 아니라서, influencer 쪽에 이상이 있어도 overall 칸이 비어 있을 수 있습니다.
- top influencers 목록은 각 influencer의 bucket별 최고 점수를 모든 detector에 걸쳐 모으고, 점수 합계도 함께 보여 줍니다. 여러 증상에 동시에 등장하는 entity가 위로 올라옵니다.
- Anomalies 표는 기본적으로 detector와 entity별로 가장 높은 이상만 보여 줍니다. 모두 보려면 Interval을 Show all로 바꿉니다.
- 차트에서는 어느 detector가 이상을 잡았는지 구분돼 보입니다. 차트의 View Series를 누르면 그 시계열을 Single Metric Viewer에서 엽니다.
- API로 볼 때는 record 결과의 `detector_index`로 detector를 구분합니다. `detector_index`는 `analysis_config`에 넣은 순서(0부터)입니다.

## Kibana에서 보는 곳

| 화면 | 보는 것 |
| --- | --- |
| Machine Learning → Anomaly Detection → Anomaly Explorer | 여러 job의 전체 흐름. timeline swim lane, influencer swim lane, top influencers, Anomalies 표, 알림 rule이 있으면 Alerts 패널 |
| Machine Learning → Anomaly Detection → Single Metric Viewer | 시계열 하나의 실제 값과 기대 범위(95% 신뢰 구간). 음영은 model plot이 켜진 job에서만 보입니다. |
| Anomalies 표에서 행 펼치기 → Anomaly explanation | 이상 유형, 영향 요인, 점수 감소 요인 |
| Anomalies 표 → Actions → Raw data | 해당 구간의 원본 문서를 Discover에서 엽니다. |

## ES|QL로 결과 조회하기

Elastic Cloud Serverless에서는 `.ml-anomalies` reserved view로 bucket, record, influencer 결과를 ES|QL로 조회할 수 있습니다(GA).
Elastic Stack(자체 구축, Elastic Cloud Hosted)은 공식 문서에 "Planned"로 표기되어 있으니, 그 환경에서는 결과 API나 `.ml-anomalies-*` index 검색을 씁니다.

```sql
FROM .ml-anomalies
| WHERE job_id == "response_code_rates"
| WHERE is_interim == false
| STATS max_score = MAX(score)
    WHERE result_type == "record"
    BY timestamp = BUCKET(timestamp, 600s)
| WHERE max_score > 0
| SORT max_score DESC NULLS LAST
```

## 참고 문서

- [View the results](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-view-results)
- [Anomaly score explanation](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-ad-explain)
- [Get anomaly records (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-get-records)
- [Tutorial: Getting started with anomaly detection](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-getting-started)
