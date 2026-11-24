---
title: 메모리와 규모
description: model_memory_limit 산정, 모델 pruning, 결과와 snapshot 보존, model plot, ML node 구성 등 규모를 키울 때 먼저 볼 설정을 다룹니다.
sidebar:
  label: 03. 메모리와 규모
  order: 3
---

job이 많아지거나 split field의 cardinality가 커지면 가장 먼저 부딪히는 것이 메모리입니다.
모델은 job이 열려 있는 동안 ML node의 메모리에 올라가고, 한도에 닿으면 탐지 품질이 조용히 떨어집니다.

## 규모를 키울 때 먼저 볼 설정

| 설정 | 기본값과 권장 | 이유 |
| --- | --- | --- |
| `model_memory_limit` | 기본 `1024mb`. estimate API나 Kibana 추정값으로 확인 | 한도에 가까워지면 pruning이 공격적으로 바뀌고, 넘으면 새 entity를 모델링하지 않습니다. |
| `model_prune_window` | 8.1 이후 생성한 job은 `30d`와 bucket span 20배 중 큰 값 | 이 기간 동안 갱신이 없는 entity의 모델을 정리합니다. 너무 짧으면 중요한 정보가 사라집니다. |
| `results_index_name` | 큰 job은 전용 결과 index | 결과 삭제와 renormalization이 효율적입니다. Elastic APM이 제공하는 job은 `custom-apm`을 씁니다. |
| `model_plot_config` | 대규모 job은 끔. 필요하면 `terms`로 일부 값만 저장 | entity가 많으면 부하가 큽니다. Kibana에서 기대 범위(음영)를 보려면 켜야 합니다. |
| `results_retention_days` | 기본은 무기한. 예: Elastic 로그 job은 120일 | 시스템이 만든 annotation도 같이 삭제됩니다. 사용자가 만든 annotation은 남습니다. |
| `renormalization_window_days` | 기본은 30일과 bucket span 100개 중 긴 쪽 | 더 큰 이상이 나오면 이 범위의 점수를 다시 계산합니다. |
| model snapshot 보존 | `model_snapshot_retention_days` 기본 10일. `daily_model_snapshot_retention_after_days` 기본 1일 | 1일이 지난 snapshot은 하루 첫 snapshot만 남습니다. 행사 전 상태로 되돌릴 계획이면 snapshot에 retain을 걸거나 보존 기간을 늘립니다. |
| `background_persist_interval` | 기본 3~4시간 사이 임의 값, 최소 1시간 | 수 GB 모델은 저장에 10~20분이 걸릴 수 있어 너무 짧게 두지 않습니다. |

## 메모리 상태 읽기

job stats의 `model_size_stats.memory_status`로 상태를 확인합니다.

| 상태 | 의미 |
| --- | --- |
| `ok` | 정상 |
| `soft_limit` | 설정한 한도의 60%를 넘었습니다. 오래 쓰이지 않은 모델을 정리(pruning)하기 시작합니다. categorization job은 category 예시를 더 저장하지 않습니다. |
| `hard_limit` | 한도를 넘었습니다. 들어온 데이터를 모두 처리하지 못했습니다. |

```json
GET _ml/anomaly_detectors/<job_id>/_stats
// jobs[0].model_size_stats.memory_status
// jobs[0].model_size_stats.model_bytes / model_bytes_memory_limit / peak_model_bytes
```

`hard_limit`에서 datafeed가 멈춘 것처럼 보이면 datafeed만 다시 시작해서는 해결되지 않습니다.
한도를 올리거나, split field의 cardinality를 줄이거나(job 분할, datafeed query로 범위 축소), 둘 다 해야 합니다.
한도를 바꾸는 순서는 [운영 체크리스트](../06-operations/#설정을-바꾸는-순서)에 정리했습니다.

## 메모리 추정

job을 만들기 전에 estimate API로 필요한 메모리를 추정합니다.
`overall_cardinality`는 field의 전체 고유 값 수, `max_bucket_cardinality`는 한 bucket 안의 최대 고유 값 수입니다. 모르면 전체 값을 넣어 넉넉하게 봅니다.

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

추정값은 출발점입니다. 실제 사용량은 학습이 진행되며 바뀌므로, 사전 검증 단계에서 `peak_model_bytes`를 보고 여유를 두고 정합니다.

## ML node 구성

- 직접 구축한 환경이라면 ML 전용 node를 권장합니다. ML node에 다른 프로세스가 없다면 `xpack.ml.max_machine_memory_percent`를 기본값 30%보다 높일 수 있습니다.
- Elastic Cloud에서는 ML node autoscaling을 켜면 요구량에 맞춰 node가 늘고 줄어듭니다.
- job은 ML node에 할당돼야 열립니다. capacity가 부족할 때 기다리게 하려면 job의 `allow_lazy_open`을 씁니다.

## 참고 문서

- [Working with anomaly detection at scale](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/anomaly-detection-scale)
- [Estimate job model memory usage (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-estimate-model-memory)
- [Update an anomaly detection job (API)](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ml-update-job)
- [Generating alerts for anomaly detection jobs](https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection/ml-configuring-alerts)
