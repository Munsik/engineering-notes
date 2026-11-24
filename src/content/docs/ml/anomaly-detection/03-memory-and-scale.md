---
title: 메모리와 규모
description: model_memory_limit 산정, model pruning, 결과와 snapshot retention, model plot, ML node 구성 등 규모를 키울 때 먼저 볼 설정을 다룹니다.
sidebar:
  label: 03. 메모리와 규모
  order: 3
---

job이 늘어나거나 split field의 cardinality가 커지면 제일 먼저 부딪히는 게 메모리입니다.
모델은 job이 열려 있는 동안 ML node 메모리에 올라가 있는데, 한도에 닿으면 에러 없이 탐지 품질만 떨어지기 때문에, 따로 지켜보지 않으면 알아채기 어렵습니다.

## 규모를 키울 때 먼저 볼 설정

| 설정 | 기본값과 권장 | 왜 중요한가 |
| --- | --- | --- |
| `model_memory_limit` | 기본 `1024mb`. estimate API나 Kibana가 보여 주는 추정값으로 확인 | 한도에 가까워지면 pruning이 공격적으로 바뀌고, 넘어서면 새로 들어온 entity는 모델링하지 않습니다. |
| `model_prune_window` | 8.1 이후 만든 job은 `30d`와 bucket span 20배 중 큰 값 | 이 기간 동안 갱신이 없던 entity의 모델을 정리합니다. 너무 짧게 잡으면 필요한 정보까지 지워집니다. |
| `results_index_name` | 큰 job은 전용 결과 index | 결과를 지우거나 renormalization할 때 훨씬 효율적입니다. Elastic APM의 제공 job은 `custom-apm`을 씁니다. |
| `model_plot_config` | 큰 job은 끄고, 필요하면 `terms`로 일부 값만 저장 | entity가 많으면 부담이 큽니다. 그래도 Kibana에서 model bounds(음영)를 보려면 켜야 합니다. |
| `results_retention_days` | 기본은 무기한. 예를 들어 Elastic 로그 job은 120일 | 시스템이 만든 annotation도 같이 지워집니다. 사용자가 직접 남긴 annotation은 그대로 남습니다. |
| `renormalization_window_days` | 기본은 30일과 bucket span 100개 중 긴 쪽 | 더 큰 이상이 나오면 이 기간 안의 score를 다시 계산합니다. |
| model snapshot retention | `model_snapshot_retention_days` 기본 10일, `daily_model_snapshot_retention_after_days` 기본 1일 | 하루가 지난 snapshot은 그날 첫 snapshot만 남깁니다. 큰 행사 전 상태로 되돌릴 계획이 있다면 snapshot에 retain을 걸거나 기간을 늘려 두세요. |
| `background_persist_interval` | 기본 3~4시간 사이 임의 값, 최소 1시간 | 모델이 수 GB면 저장에만 10~20분이 걸릴 수 있어서 너무 짧게 두면 안 됩니다. |

## 메모리 상태 읽기

메모리 상태는 job stats의 `model_size_stats.memory_status`에서 봅니다.

| 상태 | 뜻 |
| --- | --- |
| `ok` | 정상입니다. |
| `soft_limit` | 설정한 한도의 60%를 넘었습니다. 한동안 쓰이지 않은 모델부터 정리(pruning)합니다. categorization job은 category 예시를 더 저장하지 않습니다. |
| `hard_limit` | 한도를 넘었습니다. 들어온 데이터를 다 처리하지 못했다는 뜻입니다. |

```json
GET _ml/anomaly_detectors/<job_id>/_stats
// jobs[0].model_size_stats.memory_status
// jobs[0].model_size_stats.model_bytes / model_bytes_memory_limit / peak_model_bytes
```

`hard_limit` 상태에서 datafeed가 멈춘 것처럼 보이더라도 datafeed만 다시 켜서는 해결되지 않습니다.
한도를 올리든, split field의 cardinality를 줄이든(job을 쪼개거나 datafeed query로 범위를 좁히는 식으로), 둘 다 하든 해야 합니다.
한도를 바꾸는 순서는 [운영 체크리스트](../06-operations/#설정을-바꾸는-순서)에 적어 두었습니다.

## 메모리 추정

job을 만들기 전에 estimate API로 메모리가 얼마나 필요할지 가늠해 봅니다.
`overall_cardinality`에는 field의 전체 고유 값 개수를, `max_bucket_cardinality`에는 bucket 하나 안에서 나올 수 있는 최대 고유 값 개수를 넣습니다. 잘 모르겠으면 둘 다 전체 값으로 넣어 넉넉하게 보면 됩니다.

```json
POST _ml/anomaly_detectors/_estimate_model_memory
{
  "analysis_config": {
    "bucket_span": "15m",
    "detectors": [
      { "function": "count", "partition_field_name": "host.name" }
    ],
    "influencers": ["host.name"]
  },
  "overall_cardinality": { "host.name": 500 },
  "max_bucket_cardinality": { "host.name": 500 }
}
```

추정값은 어디까지나 출발점입니다. 실제 사용량은 학습이 진행되면서 달라지니, PoC에서 `peak_model_bytes`를 보고 여유를 두고 정하세요.

## ML node 구성

직접 구축한 환경이라면 ML 전용 node를 두는 걸 권합니다. ML node에서 다른 프로세스가 돌지 않는다면 `xpack.ml.max_machine_memory_percent`를 기본값 30%보다 올려도 됩니다.

Elastic Cloud에서는 ML node autoscaling을 켜 두면 필요한 만큼 node가 늘었다 줄었다 합니다.

job은 ML node에 자리를 받아야 열립니다. 자리가 없을 때 에러 대신 기다리게 하고 싶다면 job의 `allow_lazy_open`을 켜세요.

## 참고 문서

- [Working with anomaly detection at scale](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/anomaly-detection-scale)
- [Estimate job model memory usage (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-estimate-model-memory)
- [Update an anomaly detection job (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-update-job)
- [Generating alerts for anomaly detection jobs](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-alerts)
