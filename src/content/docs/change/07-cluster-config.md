---
title: 버전은 그대로 두고 클러스터 구성을 바꿀 때
description: 버전 업그레이드가 아닌 클러스터 구성 변경을 다룹니다. rolling restart, 노드 추가와 제거, master 후보 교체, node role 변경, TLS 인증서 교체, 라이선스 만료, JDK와 OS 변경, plugin, 동적 cluster settings, role과 API key, snapshot repository 교체에서 확인할 것과 순서를 정리합니다.
sidebar:
  label: 07. 클러스터 구성 변경
  order: 7
---

업그레이드는 계획을 세우고 승인을 받지만, 인증서 교체나 노드 교체는 "간단한 작업"으로 처리되곤 합니다. 그런데 인증서는 만료일에 갑자기 노드 간 통신을 끊고, master 후보 노드 두 대를 한꺼번에 빼면 클러스터가 master를 뽑지 못합니다.
버전 업그레이드가 아닌 구성 변경도 종류마다 영향과 순서가 다릅니다.

:::note[기준]
- Elasticsearch 9.5.x, self-managed 기준입니다. 공식 문서는 2026년 11월에 다시 확인했습니다.
- ECH와 ECE에서는 노드 교체, 재시작, 인증서, JDK를 플랫폼이 관리합니다. ECK에서는 operator가 manifest 변경을 rolling 방식으로 적용합니다.
- 명령 모음은 [`labs/change/cluster-config.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/change/cluster-config.console)에 있습니다.
:::

## 변경별 영향 요약

| 변경 | 재시작 필요 | 위험 | 먼저 볼 절 |
| --- | --- | --- | --- |
| `elasticsearch.yml` 정적 설정 | 노드마다 | 낮음에서 중간 | [rolling restart](#rolling-restart) |
| 노드 추가 | 새 노드만 | 낮음. shard 이동 부하 | [노드 추가와 제거](#노드-추가와-제거) |
| data 노드 제거 | 없음 | 중간. 남은 노드의 디스크 | [노드 추가와 제거](#노드-추가와-제거) |
| master 후보 노드 교체 | 교체 노드 | 높음. 과반 유지 | [master 후보 노드 교체](#master-후보-노드-교체) |
| node role 변경 | 그 노드 | 중간 | [node role 변경](#node-role-변경) |
| TLS 인증서 교체 | 권장 | 높음. 만료 시 통신 단절 | [TLS 인증서 교체](#tls-인증서-교체) |
| 라이선스 갱신 | 없음 | 만료 시 기능 제한 | [라이선스](#라이선스) |
| JDK, OS, kernel | 노드마다 | 중간 | [JDK와 OS](#jdk와-os) |
| plugin | 노드마다 | 버전 불일치 시 노드 시작 실패 | [plugin](#plugin) |
| 동적 cluster settings | 없음 | 즉시 반영 | [동적 cluster settings](#동적-cluster-settings) |
| role, role mapping, API key | 없음 | 즉시 반영. 권한 상실 | [보안 구성](#보안-구성) |
| snapshot repository 교체 | 설정에 따라 | 백업 공백 | [snapshot repository 교체](#snapshot-repository-교체) |

## rolling restart

설정 변경, JDK와 OS 패치처럼 노드를 재시작해야 하는 작업은 공식 rolling restart 절차를 따릅니다. 절차와 recovery 속도 설정은 [안정성 운영 08의 rolling restart](../../operations/08-recoverability/#rolling-restart)에 정리했습니다. 요지는 재시작하는 동안 replica 할당을 막아 불필요한 shard 이동을 피하고, 노드가 돌아오면 할당을 되돌린 뒤 GREEN을 확인하고 다음 노드로 넘어가는 것입니다.

```console
# 재시작 전: primary만 할당
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.enable": "primaries" } }

# 노드 재시작 후: 기본값으로 되돌림
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.enable": null } }

GET _cluster/health?wait_for_status=green&timeout=30m
```

`cluster.routing.allocation.enable`을 되돌리는 것을 잊는 일이 흔합니다. 작업이 끝나면 `GET _cluster/settings?flat_settings=true`로 남은 임시 설정이 없는지 확인합니다.

node shutdown API(`PUT _nodes/<id>/shutdown`)는 ECE, ECH, ECK 같은 오케스트레이터가 쓰는 API입니다. Elasticsearch REST API spec에서 visibility가 private이고, self-managed에서 사용자가 직접 호출하는 API가 아닙니다. self-managed에서는 위 절차와 아래의 allocation filtering을 씁니다.

## 노드 추가와 제거

노드를 추가하면 Elasticsearch가 shard를 새 노드로 옮겨 균형을 맞춥니다. 옮기는 양이 많으면 네트워크와 디스크 부하가 커지므로, 업무 시간에는 recovery 속도 설정을 낮게 둡니다.

data 노드를 뺄 때는 먼저 shard를 비웁니다.

```console
# 1. 대상 노드에서 shard를 빼도록 지정
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.exclude._name": "data-hot-05" } }

# 2. 대상 노드의 shard가 0이 될 때까지 확인
GET _cat/allocation/data-hot-05?v
GET _cat/shards?v&h=index,shard,prirep,state,node&s=node | grep data-hot-05

# 3. 노드 중지 후 exclude 해제
PUT _cluster/settings
{ "persistent": { "cluster.routing.allocation.exclude._name": null } }
```

빼기 전에 남은 노드의 디스크가 옮겨 올 데이터를 감당할 수 있는지 계산합니다. 남은 노드의 사용률이 low watermark(기본 85%)를 넘으면 shard가 옮겨지지 않고 멈춥니다([안정성 운영 04](../../operations/04-disk-full/)). 노드 하나를 뺀 상태에서도 replica가 다른 노드에 들어갈 자리가 있어야 합니다. zone awareness를 쓴다면 zone별 용량도 따로 봅니다.

## master 후보 노드 교체

master 후보 노드는 과반으로 master를 뽑습니다. 세 대 중 두 대를 동시에 잃으면 master를 뽑을 수 없습니다.

- 한 번에 한 대씩 교체합니다. 새 노드를 먼저 추가해 클러스터에 들어온 것을 확인하고, 그다음 이전 노드를 뺍니다.
- master 후보의 절반 이상을 한 번에 빼야 하는 경우에는 voting configuration exclusions API로 먼저 투표 구성에서 제외합니다. 제외한 노드를 실제로 뺀 뒤에는 exclusion을 지웁니다.

```console
POST _cluster/voting_config_exclusions?node_names=master-01,master-02
# 노드 제거 후
DELETE _cluster/voting_config_exclusions
```

voting configuration exclusions는 데이터센터를 옮기면서 master 후보 세 대 중 두 대를 같은 날 새 장비로 바꿔야 할 때, 장애로 master 후보 두 대가 영구히 사라질 예정이라 미리 투표에서 빼야 할 때 씁니다. 한 대씩 빼는 일반 교체에는 필요 없습니다. Elasticsearch가 투표 구성을 자동으로 조정합니다.

현재 투표 구성은 `GET _cluster/state?filter_path=metadata.cluster_coordination`으로 봅니다. 교체 중에는 master 교체가 일어나므로 [안정성 운영 07](../../operations/07-unstable-cluster/#master가-자주-바뀔-때)의 신호를 같이 봅니다.

## node role 변경

`node.roles`는 `elasticsearch.yml`에 있어 재시작해야 바뀝니다. 주의할 경우는 data role을 빼는 것입니다. data role이 없는 노드는 shard 데이터가 남아 있으면 시작하지 않습니다. role을 빼기 전에 [노드 제거](#노드-추가와-제거)와 같은 방법으로 shard를 비우고, 남은 데이터를 정리해야 하면 `elasticsearch-node repurpose` 도구를 씁니다.

tier를 새로 만들 때(예: warm 추가)는 노드를 먼저 추가하고, ILM policy에서 그 tier로 옮기는 phase를 나중에 켭니다. 순서가 반대면 ILM이 옮길 곳이 없어 index가 phase 안에서 멈춥니다.

## TLS 인증서 교체

인증서는 만료일에 바로 문제가 됩니다. 노드 간 transport 인증서가 만료되면 노드가 서로 연결하지 못하고, HTTP 인증서가 만료되면 Kibana, Agent, 애플리케이션이 연결하지 못합니다.

만료일은 API로 미리 봅니다. 결과의 `expiry`를 정기 점검이나 alert에 넣어 두면 만료 전에 알 수 있습니다. 응답이 배열이라 `filter_path`에는 `*.` 없이 필드 이름만 씁니다. `*.path`처럼 쓰면 빈 응답이 옵니다(9.5.5 lab 실행 결과).

```console
GET _ssl/certificates?filter_path=path,subject_dn,expiry
```

![`GET _ssl/certificates` 결과의 일부. 인증서마다 `expiry`가 나오므로 이 값을 정기 점검에 넣어 만료 전에 알 수 있습니다.](../../../assets/change/ssl-certificates-expiry.jpg)

교체 절차는 같은 CA로 새로 서명하느냐, CA 자체를 바꾸느냐에 따라 다릅니다([Updating certificates](https://www.elastic.co/docs/deploy-manage/security/updating-certificates)).

| 경우 | 절차 요지 |
| --- | --- |
| 같은 CA | 노드마다 인증서와 key 파일을 같은 파일 이름으로 바꾸면 Elasticsearch가 파일을 다시 읽어 새 인증서를 씁니다. 재시작이 필수는 아니지만 새 TLS 연결을 강제하기 위해 노드마다 재시작하는 것을 권장합니다 |
| keystore 비밀번호도 바뀜 | 비밀번호가 secure settings에 있으므로 rolling restart가 필요합니다. 재시작 전에 파일을 다시 읽지 않도록 새 keystore는 다른 파일 이름으로 둡니다 |
| CA 변경 | 새 CA를 먼저 모든 노드와 client의 신뢰 목록에 추가하고, 그다음 인증서를 바꾸고, 마지막에 이전 CA를 신뢰 목록에서 뺍니다. 단계마다 rolling restart가 필요합니다 |

`GET _ssl/certificates`는 요청을 받은 노드가 읽은 인증서를 돌려줍니다. lab에서 같은 요청을 두 번 보내자 서로 다른 노드의 인증서가 나왔습니다. 그래서 모든 노드를 보려면 노드마다 직접 요청해야 합니다(해석). 이 API는 분기 점검에서 노드별 인증서 만료일을 모을 때, 인증서 파일을 바꾼 뒤 Elasticsearch가 새 파일을 실제로 읽었는지 볼 때, 노드마다 다른 인증서가 들어가 있지 않은지 확인할 때 씁니다. 교체 뒤에는 이 API로 새 인증서가 읽혔는지 확인합니다([Same CA](https://www.elastic.co/docs/deploy-manage/security/same-ca), [Different CA](https://www.elastic.co/docs/deploy-manage/security/different-ca)).

Elasticsearch 인증서만 보면 안 됩니다. Kibana의 Elasticsearch 연결 설정, Fleet Server와 Agent, Logstash output, Beats, 애플리케이션의 신뢰 설정이 모두 같은 CA 변경의 영향을 받습니다. CA를 바꾸는 작업은 client 목록부터 만듭니다.

## 라이선스

self-managed에서는 라이선스 만료일을 직접 관리합니다. 만료되면 구독 등급에 묶인 기능이 제한됩니다. 만료일은 `GET _license`의 `expiry_date`로 보고, 30일 전쯤 알림을 둡니다. 갱신한 라이선스는 `PUT _license`로 적용하고, 적용 직후 `GET _license`의 `status`와 `type`을 확인합니다. 만료 때 기능별로 정확히 어떤 동작이 제한되는지는 [subscription 페이지](https://www.elastic.co/subscriptions)와 라이선스 관리 문서에서 확인합니다.

## JDK와 OS

Elasticsearch는 OpenJDK를 함께 배포하고, 공식 문서는 모든 설치에서 이 번들 JVM을 쓰라고 강하게 권합니다. 번들 JVM은 Elasticsearch의 다른 의존성과 같이 취급돼서, Elastic이 업데이트와 보안 대응을 맡습니다([Installing Elasticsearch](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/installing-elasticsearch)). 번들 JVM을 쓰면 JDK 패치는 Elasticsearch patch 업그레이드와 같은 일이 됩니다. `ES_JAVA_HOME`으로 별도 JDK를 쓰고 있다면 그 JDK의 패치와 호환 확인은 직접 해야 합니다.

OS나 kernel을 바꾼 뒤에는 Elasticsearch가 요구하는 OS 설정(`vm.max_map_count`, 파일 핸들, 메모리 잠금, swap)이 유지됐는지 확인합니다. 운영 모드에서는 bootstrap check가 맞지 않는 설정을 잡아 노드를 띄우지 않습니다([안정성 운영 03](../../operations/03-node-failure-triage/)).

## plugin

plugin은 Elasticsearch 버전과 정확히 맞아야 합니다. patch 업그레이드에서도 plugin을 같은 버전으로 다시 설치해야 노드가 뜹니다. plugin을 쓰는 환경은 plugin 파일을 버전별로 보관하고, 업그레이드 절차에 plugin 교체를 넣습니다. 맞는 버전의 plugin이 아직 나오지 않았다면 그 plugin이 업그레이드를 막는 셈이므로, 업그레이드 계획 단계에서 먼저 확인합니다([Prepare to upgrade](https://www.elastic.co/docs/deploy-manage/upgrade/prepare-to-upgrade)).

## 동적 cluster settings

API로 바꾸는 cluster settings는 바로 반영됩니다. 변경 관리에서 지킬 것은 이렇습니다.

- `persistent`만 씁니다. `transient`는 deprecated이고, 재시작하면 사라져 원인 추적을 어렵게 합니다.
- 값을 지울 때는 `null`을 넣습니다. 기본값으로 돌아갑니다.
- 설정의 우선순위는 transient, persistent, `elasticsearch.yml`, 기본값 순입니다. `elasticsearch.yml`을 고쳤는데 반영되지 않으면 같은 설정이 persistent로 들어가 있지 않은지 봅니다.
- 직접 바꾼 값 전체는 `GET _cluster/settings?flat_settings=true`로 보고, 기본값까지 보려면 `include_defaults=true`를 붙입니다. `include_defaults`는 설정의 현재 값을 확인할 때 씁니다. 예를 들어 recovery 속도를 바꿀지 판단하기 전에 현재 `indices.recovery.max_bytes_per_sec`가 기본값인지, `elasticsearch.yml`에서 바꾼 값인지 볼 때입니다. 응답이 길므로 `filter_path`로 필요한 설정만 고릅니다.
- 장애 중에 바꾼 설정(recovery 속도, allocation 제한 등)은 장애가 끝난 뒤 되돌리는 작업을 [장애 대응](../../operations/10-incident-runbook/) 기록에 남깁니다.

이 설정들도 Git에 요청 파일로 두고 PR로 바꿉니다. 그러면 [01의 drift 확인](../01-change-map/#drift-확인)으로 원본과 실제를 비교할 수 있습니다.

## 보안 구성

role, role mapping, API key, service account token은 바꾸는 즉시 반영됩니다. 잘못 바꾸면 사용자와 수집기가 바로 권한을 잃습니다.

- role을 바꾸기 전에 그 role을 쓰는 사용자, role mapping, API key를 찾습니다. API key는 만들 때의 권한을 key에 담기 때문에, role을 바꿔도 key의 권한이 함께 바뀌는지는 key 종류에 따라 다릅니다. 확인 필요.
- API key의 만료를 정기적으로 봅니다. 수집기와 자동화가 쓰는 key가 만료되면 적재나 배포가 경고 없이 멈춥니다.

```console
GET _security/api_key?active_only=true&filter_path=api_keys.name,api_keys.expiration,api_keys.username
```

- 외부 인증(SAML, OIDC, LDAP)의 설정이나 인증서를 바꿀 때는 내장 `elastic` 사용자나 다른 realm으로 들어갈 길을 남겨 둡니다. 로그인이 안 될 때의 대응은 [안정성 운영 10](../../operations/10-incident-runbook/#로그인이-안-될-때)에 있습니다.

## snapshot repository 교체

저장소를 새 스토리지로 옮길 때 순서는 이렇습니다.

1. 새 저장소를 등록하고 repository analysis API로 검증합니다. 이 API는 저장소가 Elasticsearch가 요구하는 동작(읽기 일관성, 동시 쓰기 등)을 지키는지 부하를 주며 확인합니다.
2. SLM policy가 새 저장소에 쓰도록 바꾸고, 첫 snapshot이 성공하는지 봅니다.
3. 이전 저장소는 `readonly: true`로 다시 등록해서 복원용으로 남깁니다. 보관 기간이 지나면 해제합니다.

```console
POST _snapshot/new-repo/_analyze?blob_count=100&max_blob_size=10mb&timeout=300s
```

repository analysis는 S3 호환 스토리지나 NAS를 처음 snapshot 저장소로 쓸 때, 스토리지 펌웨어나 게이트웨이를 바꾼 뒤, snapshot이 가끔 알 수 없는 이유로 실패할 때 씁니다. 공식 문서는 S3 호환이라고 해도 Elasticsearch가 요구하는 동작을 모두 지키지 않는 스토리지가 있다고 안내합니다. 분석은 저장소에 실제로 읽고 쓰는 부하를 주므로 업무 시간을 피하고, 운영 저장소라면 snapshot이 돌지 않는 시간에 합니다. `blob_count`, `max_blob_size`를 작게 시작해서 늘립니다.

같은 저장소를 두 클러스터에서 동시에 쓰기 가능하게 등록하면 저장소가 손상될 수 있습니다. 다른 클러스터에서 읽어야 하면 `readonly: true`로 등록합니다. searchable snapshot이 쓰는 저장소는 이전 저장소를 지우면 frozen 데이터를 잃습니다([데이터 설계 05](../../data/05-tiers-and-retention/)). 교체 전에 searchable snapshot index가 어느 저장소를 쓰는지 확인합니다.

## 참고 문서

- [Rolling restart](https://www.elastic.co/docs/deploy-manage/maintenance/start-stop-services/full-cluster-restart-rolling-restart-procedures)
- [Updating certificates](https://www.elastic.co/docs/deploy-manage/security/updating-certificates)
- [Installing Elasticsearch (bundled JVM)](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/installing-elasticsearch)
- [Voting configuration exclusions API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-post-voting-config-exclusions)
- [Repository analysis API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-snapshot-repository-analyze)
- [Get SSL certificates API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-ssl-certificates)
