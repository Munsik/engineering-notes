---
title: "노드 하나를 잃어도 데이터를 잃지 않으려면"
description: 복구 목표(얼마나 잃어도 되는지, 얼마나 빨리 돌아와야 하는지)에 맞춰 replica, master 노드 수, zone과 rack 배치, snapshot 주기와 보관을 정하는 기준과, 공식 rolling restart 절차, 노드를 안전하게 빼는 절차, recovery 속도 설정을 정리합니다.
sidebar:
  label: 08. 장애 대비와 복구
  order: 8
---

장애 대응에서 가장 어려운 순간은 복사본이 없다는 것을 알게 될 때입니다. 비용을 아끼려고 replica를 0으로 둔 index가 있던 노드의 디스크가 망가지면, 남은 선택지는 snapshot 복원이나 데이터 포기뿐입니다([02의 남은 복사본이 없을 때](../02-red-yellow/#남은-복사본이-없을-때)).
복구 가능성은 장애가 난 뒤에 만들 수 없습니다. 평소 설계와 작업 절차로 정해집니다.

:::note[기준]
- Elasticsearch 9.x, self-managed 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- Elastic Cloud Hosted와 ECE는 zone 배치를 플랫폼이 맡고, 노드 속성을 직접 정할 수 없어 shard allocation awareness 설정을 쓰지 않습니다. Elastic Cloud Hosted에는 `cloud-snapshot-policy` SLM 정책이 기본으로 들어 있습니다.
- 명령 모음은 [`labs/operations/recoverability.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/operations/recoverability.console)에 있습니다.
:::

## 복구 목표부터 정한다

설계는 두 질문에서 출발합니다.

- 얼마나 잃어도 되는가: 장애가 나면 마지막 몇 분, 몇 시간치 데이터를 잃어도 되는지
- 얼마나 빨리 돌아와야 하는가: 검색과 적재가 몇 분, 몇 시간 안에 돌아와야 하는지

| 장애 | 막는 장치 | 잃는 것 |
| --- | --- | --- |
| 노드 하나 | replica 1 이상 | 없음. 남은 복사본이 primary가 됨 |
| 랙, zone 하나 | zone마다 복사본(allocation awareness), master 후보 분산 | 없음. 남은 zone의 용량만큼 느려짐 |
| 클러스터 전체, 사람의 실수(삭제) | snapshot | 마지막 snapshot 이후 데이터 |
| 데이터센터 하나 | 다른 데이터센터의 클러스터(cross-cluster replication)와 snapshot | 복제 지연 또는 마지막 snapshot 이후 |

replica는 노드 장애를 막지만 삭제나 잘못된 업데이트는 막지 못합니다. 복사본에도 그대로 적용되기 때문입니다. 사람의 실수에 대비하는 장치는 snapshot뿐입니다.

## 최소 구성

공식 문서가 말하는 장애에 견디는 클러스터의 조건입니다([Design for resilience](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience)).

- master 후보 노드 3대 이상. 하나가 죽어도 남은 둘이 과반이라 선출할 수 있습니다.
- 역할마다 노드 2대 이상
- shard마다 복사본 2개 이상(primary와 replica 하나 이상). searchable snapshot index는 예외입니다.

노드 2대 구성은 운영에 권하지 않습니다. 선출이 과반으로 이뤄지므로 어느 한쪽이 죽어도 버티게 만들 수 없습니다. 운영에 쓸 수 있는 가장 작은 구성은 data 노드 2대와 tiebreaker 역할의 master 후보 노드 1대입니다. tiebreaker는 `voting_only`를 둔 전용 master 후보로 두고 client 요청을 보내지 않습니다([Resilience in small clusters](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience/resilience-in-small-clusters)).

### replica 0의 비용과 위험

| | replica 0 | replica 1 |
| --- | --- | --- |
| 디스크 | 1배 | 2배 |
| 적재 비용 | 1배 | 대략 2배. primary와 replica가 같은 일을 함 |
| 노드 하나 장애 | 그 노드의 shard가 RED. 노드가 돌아오거나 snapshot 복원까지 검색, 적재 불가 | 영향 없음 |
| 디스크 고장 | 그 shard의 데이터 손실 | 영향 없음 |

replica 0이 맞는 경우는 소스에서 다시 넣을 수 있고, 그동안 검색이 안 돼도 되는 데이터뿐입니다. 적재 속도 때문에 replica를 0으로 둔다면, 대량 적재 동안만 0으로 두고 끝나면 1로 되돌립니다. 오래된 로그의 저장 비용이 문제라면 replica 0보다 frozen tier가 낫습니다. frozen의 searchable snapshot은 snapshot 저장소가 복사본 역할을 합니다([데이터 설계 05](../../data/05-tiers-and-retention/)).

## zone과 rack에 나눠 두기

노드가 전원, 스위치, 랙을 공유하면 함께 죽습니다. 같이 죽을 노드를 zone으로 묶고, shard 복사본이 zone마다 하나씩 가도록 설정합니다([Shard allocation awareness](https://www.elastic.co/docs/deploy-manage/distributed-architecture/shard-allocation-relocation-recovery/shard-allocation-awareness)).

```yaml
# elasticsearch.yml (노드마다 자기 zone)
node.attr.zone: zone-a
cluster.routing.allocation.awareness.attributes: zone
# zone 하나가 죽었을 때 남은 zone에 복사본을 몰아넣지 않으려면
cluster.routing.allocation.awareness.force.zone.values: zone-a,zone-b
```

- forced awareness를 켜면 zone 하나가 죽을 때 그 zone 몫의 replica는 할당하지 않고 남겨 둡니다. 남은 zone의 디스크와 부하가 갑자기 두 배가 되는 것을 막는 대신, 그동안 YELLOW입니다.
- master 후보는 zone 셋에 하나씩 둡니다. zone이 둘뿐이면 한쪽에 master 후보를 더 많이 두거나, 세 번째 위치에 tiebreaker를 둡니다. 두 zone에 같은 수를 두면 어느 쪽이 죽어도 선출할 수 없습니다([Resilience in larger clusters](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience/resilience-in-larger-clusters)).
- 멀리 떨어진 데이터센터에 클러스터 하나를 걸쳐 두지 않습니다. 공식 문서는 데이터센터마다 클러스터를 따로 두고 cross-cluster search나 cross-cluster replication으로 잇도록 권합니다(같은 문서).
- zone 하나를 잃어도 남은 zone이 전체 부하를 받을 수 있어야 합니다. 평소 사용률은 그만큼 낮아야 합니다.

## snapshot

### 복사본이 아니라 snapshot

공식 문서는 snapshot만이 믿을 수 있고 지원되는 백업 방법이라고 설명합니다. 노드의 data 디렉터리를 복사한 것으로는 복원할 수 없습니다. 한 시점의 일관된 상태가 아니고, 노드를 멈춘 상태에서 복사해도 클러스터 전체에 걸친 일관성 조건을 맞추지 못하기 때문입니다([Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)).

### SLM으로 주기와 보관을 정한다

```console
PUT _slm/policy/nightly
{
  "schedule": "0 30 1 * * ?",
  "name": "<nightly-snap-{now/d}>",
  "repository": "backup-repo",
  "config": {
    "indices": "*",
    "include_global_state": true
  },
  "retention": {
    "expire_after": "30d",
    "min_count": 5,
    "max_count": 50
  }
}
```

- snapshot은 증분입니다. 이전 snapshot에 이미 있는 segment는 다시 올리지 않으므로 주기를 짧게 해도 비용이 생각보다 작습니다.
- 잃어도 되는 시간이 짧으면 하루 한 번이 아니라 몇 시간마다 찍습니다. 공식 문서는 주기가 다른 policy를 여러 개 두는 방법(예: 30분마다 짧게 보관, 하루 한 번 길게 보관)도 설명합니다([Create snapshots](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/create-snapshots)).
- SLM은 시스템 시계로 일정과 보관 기간을 계산합니다. 노드 시계를 맞춥니다(같은 문서).
- 실패는 `GET _slm/stats`와 health report의 `slm` indicator로 봅니다. [01의 매주 점검](../01-daily-checks/#매주)에 넣어 둡니다.

### 저장소와 복원 연습

```console
POST _snapshot/backup-repo/_verify
GET _snapshot/backup-repo/_all?verbose=false
POST _snapshot/backup-repo/<snapshot>/_restore
{
  "indices": "logs-app-2026.11.01",
  "rename_pattern": "(.+)",
  "rename_replacement": "restored-$1"
}
```

- snapshot 저장소는 클러스터와 다른 장애 영역에 둡니다. 같은 스토리지 장비에 있으면 그 장비와 함께 잃습니다.
- `_verify`는 모든 노드가 저장소에 쓸 수 있는지만 확인합니다. 실제로 복원되는지는 복원해 봐야 압니다.
- 분기마다 index 하나를 다른 이름으로 복원해 시간을 잽니다. 이 시간이 "얼마나 빨리 돌아와야 하는가"의 실제 값입니다.

## rolling restart

설정 변경이나 업그레이드로 노드를 하나씩 재시작할 때의 공식 절차입니다([Full cluster restart and rolling restart procedures](https://www.elastic.co/docs/deploy-manage/maintenance/start-stop-services/full-cluster-restart-rolling-restart-procedures)).

```console
# 1. replica 할당을 멈춘다
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.enable": "primaries" } }

# 2. 가능하면 필수가 아닌 적재를 멈추고 flush
POST _flush

# 3. (선택) ML job을 잠시 멈춘다
POST _ml/set_upgrade_mode?enabled=true

# 4. 노드 하나를 내리고 작업, 다시 올린 뒤 합류 확인
GET _cat/nodes?v

# 5. 할당을 되돌린다
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.enable": null } }

# 6. green이 되면 다음 노드
GET _cat/health?v
GET _cat/recovery?v&active_only=true

# 7. 모두 끝나면 ML upgrade mode 해제
POST _ml/set_upgrade_mode?enabled=false
```

1단계가 필요한 이유는 `index.unassigned.node_left.delayed_timeout`(기본 1분) 때문입니다. 1분 안에 노드가 돌아오지 않으면 그 노드의 replica를 다른 노드에 새로 만들기 시작하고, 돌아온 뒤에는 또 옮깁니다. 재시작이 1분을 넘기는 환경에서는 이 복사가 rolling restart를 몇 배로 늘립니다.

rolling restart가 오래 걸리는 흔한 이유입니다.

| 원인 | 확인 |
| --- | --- |
| 디스크가 low watermark(85%)를 넘음 | 공식 문서가 재시작 전에 85% 아래로 내리라고 경고. [04](../04-disk-full/) |
| 할당을 멈추지 않았거나 되돌리지 않음 | `GET _cluster/settings`. 되돌리지 않으면 YELLOW가 풀리지 않음([02](../02-red-yellow/#원인별-조치)) |
| 적재를 계속해 재시작 동안 쌓인 변경이 많음 | 적재를 줄이고 flush |
| recovery 속도 제한 | 아래 설정 |
| green을 기다리지 않고 다음 노드로 넘어감 | 복사본이 모두 돌아오기 전에 다음 노드를 내리면 RED가 될 수 있음 |

### recovery 속도

| 설정 | 기본값 | 비고 |
| --- | --- | --- |
| `indices.recovery.max_bytes_per_sec` | 40MB/s(노드마다). 전용 cold, frozen 노드는 메모리에 따라 더 큼 | 동적. 노드마다 따로 적용되므로 클러스터 전체 합은 더 큼 |
| `cluster.routing.allocation.node_concurrent_recoveries` | 2 | 공식 문서가 기본값에서 바꾸지 말라고 권함 |
| `cluster.routing.allocation.node_initial_primaries_recoveries` | 4 | 재시작 뒤 로컬 디스크에서 primary를 여는 수. 역시 바꾸지 말라고 권함 |

근거: [Index recovery settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/index-recovery-settings), [Cluster-level shard allocation settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/cluster-level-shard-allocation-routing-settings). 디스크와 네트워크에 여유가 있을 때 `max_bytes_per_sec`를 작업 시간 동안만 올리고 끝나면 되돌립니다. 너무 높이면 recovery가 검색과 적재의 자원을 가져가고, 심하면 클러스터가 불안정해진다고 공식 문서가 설명합니다.

## 노드를 영구히 뺄 때

```console
# 1. shard를 다른 노드로 옮긴다
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.exclude._name": "data-4" } }

# 2. 그 노드의 shard가 0이 될 때까지 기다린다
GET _cat/allocation/data-4?v

# 3. 노드를 내린 뒤 exclude를 지운다
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.exclude._name": null } }
```

- master 후보 노드를 짧은 시간에 절반 이상 뺄 때만 voting configuration exclusion이 필요합니다. 예를 들어 master 후보가 2대 남은 상태에서 1대를 빼는 경우입니다. 이때는 `POST _cluster/voting_config_exclusions?node_names=<name>`을 먼저 부르고, 노드를 뺀 뒤 `DELETE _cluster/voting_config_exclusions`로 지웁니다([Add and remove nodes](https://www.elastic.co/docs/deploy-manage/maintenance/add-and-remove-elasticsearch-nodes)).
- 노드를 내리기 전에 남은 노드의 디스크가 옮겨 올 shard를 받을 수 있는지 계산합니다. 받을 수 없으면 2단계에서 멈춥니다.

## 판단 기준

| 상황 | 권장 |
| --- | --- |
| 운영 데이터 | replica 1, master 후보 3대, snapshot 하루 이상 |
| 다시 넣을 수 있는 대량 적재 | 적재 동안만 replica 0, 끝나면 1 |
| 오래된 로그의 저장 비용 | replica 0보다 frozen tier |
| 랙, zone 장애에 대비 | allocation awareness, master 후보를 세 위치에 |
| 데이터센터 장애에 대비 | 클러스터를 걸치지 말고 데이터센터마다 클러스터 + cross-cluster replication |
| 사람의 실수에 대비 | snapshot 주기를 잃어도 되는 시간에 맞추고 복원 연습 |
| rolling restart가 오래 걸림 | 할당 중지, 디스크 85% 아래, green 확인 뒤 다음 노드 |

## 참고 문서

- [Design for resilience](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience)
- [Resilience in small clusters](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience/resilience-in-small-clusters)
- [Shard allocation awareness](https://www.elastic.co/docs/deploy-manage/distributed-architecture/shard-allocation-relocation-recovery/shard-allocation-awareness)
- [Resilience in larger clusters](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience/resilience-in-larger-clusters)
- [Snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)
- [Create snapshots](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/create-snapshots)
- [Full cluster restart and rolling restart procedures](https://www.elastic.co/docs/deploy-manage/maintenance/start-stop-services/full-cluster-restart-rolling-restart-procedures)
- [Index recovery settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/index-recovery-settings)
- [Cluster-level shard allocation settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/cluster-level-shard-allocation-routing-settings)
- [Add and remove nodes](https://www.elastic.co/docs/deploy-manage/maintenance/add-and-remove-elasticsearch-nodes)
