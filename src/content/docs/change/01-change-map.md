---
title: 변경 대상과 관리 기준
description: Elastic 환경에서 바뀌는 대상을 플랫폼, 클러스터 구성, 데이터 정의, Kibana 객체의 네 계층으로 나누고, 계층마다 source of truth와 적용, 롤백, 검증 방법을 정합니다. 롤백할 수 없는 변경, 코드화 도구 선택, drift 확인, 변경 추적, CI/CD 계정 설계를 함께 다룹니다.
sidebar:
  label: 01. 변경 대상과 관리 기준
  order: 1
---

변경 사고의 대부분은 "그게 어디 있었는지 몰랐다"에서 시작합니다. template은 누군가 Dev Tools에서 고쳤고, dashboard는 운영 Kibana에서 직접 수정했고, ILM policy는 업그레이드 때 덮어써졌는데 아무도 이전 값을 기록하지 않았습니다.
그래서 변경 관리는 무엇이 바뀔 수 있는지, 각각의 source of truth가 어디에 있는지를 정하는 데서 시작합니다.

:::note[기준]
- Elasticsearch, Kibana 9.5.x 기준입니다. 공식 문서와 Terraform provider 저장소는 2026년 11월에 다시 확인했습니다.
- 명령 모음은 [`labs/change/change-map.console`](https://github.com/Munsik/engineering-notes/blob/main/labs/change/change-map.console)에 있습니다.
:::

## 네 계층으로 나눈다

| 계층 | 대상 예 | source of truth | 적용 방법 | 롤백 방법 | 검증 |
| --- | --- | --- | --- | --- | --- |
| 플랫폼 | Elasticsearch, Kibana, Agent 버전, JDK, OS, 노드, 인증서, 라이선스 | 구성 관리 도구(Ansible 등), ECK manifest, ECH deployment 정의 | rolling upgrade, rolling restart | 버전은 롤백할 수 없음. snapshot에서 새 클러스터로 복원 | `_nodes`, `_health_report`, Kibana status |
| 클러스터 구성 | `elasticsearch.yml`, 동적 cluster settings, role, role mapping, snapshot repository, SLM | Git의 설정 파일과 API 요청, Terraform | 설정 파일 배포, API | 이전 값으로 다시 적용 | `GET _cluster/settings`, `GET _security/role` |
| 데이터 정의 | index template, component template, ingest pipeline, ILM policy, enrich policy, synonym set, transform, ML job | Git의 API 요청이나 Terraform | API, Terraform | 이전 정의로 다시 적용. 이미 만든 index에는 소급되지 않음 | simulate API, 새 backing index의 mapping |
| Kibana 객체와 설정 | dashboard, data view, rule, connector, SLO, space, Kibana role, `kibana.yml` | Git의 JSON, NDJSON, Terraform | Kibana API, import | 이전 정의로 다시 적용 | API로 되읽어 비교 |

여기에 하나가 더 있습니다. Elastic이 설치하고 업그레이드 때 갱신하는 managed 자산입니다. built-in `logs` template, integration이 설치한 template과 pipeline, `logs@lifecycle` 같은 policy, integration dashboard, prebuilt detection rule이 여기에 속합니다. 이 자산의 정의는 Elastic이 관리합니다. 직접 고치면 다음 갱신 때 사라지므로, managed 자산은 그대로 두고 그 설정을 덮어쓰는 `@custom` 자산만 관리합니다. 자세한 내용은 [03. managed 자산](../03-managed-assets/)에 있습니다.

## 롤백할 수 있는 변경과 없는 변경

변경을 얼마나 신중하게 계획할지는 롤백할 수 있는지에 달려 있습니다.

| 변경 | 롤백 | 이유 |
| --- | --- | --- |
| Elasticsearch 버전 업그레이드 | 없음 | 노드 하나라도 새 버전으로 올라가면 이전 버전으로 내릴 수 없습니다. 이전 버전 클러스터를 새로 만들고 업그레이드 전 snapshot에서 복원해야 합니다([Upgrade Elasticsearch](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/elasticsearch)) |
| Kibana 업그레이드 | 조건부 | saved object migration이 돌기 때문에 이전 버전 Kibana는 그대로 뜨지 않습니다. 업그레이드 전 snapshot의 `kibana` feature state를 복원해야 합니다([Roll back Kibana](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/kibana-roll-back)) |
| 이미 색인된 문서의 mapping | 없음 | 필드 type은 기존 index에서 바꿀 수 없습니다. 새 index로 reindex하거나 rollover 뒤 새 데이터부터 적용합니다 |
| index, 문서 삭제 | snapshot이 있을 때만 | replica에도 삭제가 그대로 적용됩니다 |
| template, pipeline, ILM policy 변경 | 있음 | 이전 정의를 다시 적용하면 됩니다. 다만 그사이 만들어진 index와 처리된 문서에는 소급되지 않습니다 |
| dashboard, rule 변경 | 있음 | 이전 정의가 남아 있을 때만입니다. 운영 Kibana에서 직접 고치면 이전 정의가 남지 않습니다 |
| integration 업그레이드 | 제한적 | Fleet에서 이전 버전으로 롤백할 수 있는 경우가 있지만, 새 버전으로 이미 처리된 문서와 새로 만든 backing index는 그대로입니다. 확인 필요 |
| encryption key 분실 | 없음 | `xpack.encryptedSavedObjects.encryptionKey`를 잃으면 그 key로 암호화한 connector, rule의 secret을 읽을 수 없습니다([05](../05-kibana-objects/#encryption-key)) |

롤백할 수 없는 변경은 검증 환경에서 먼저 해 봅니다. 롤백할 수 있는 변경은 정의를 Git에 두는 것만으로 충분한 경우가 많습니다.

## source of truth를 정한다

원칙은 하나입니다. source of truth는 Git이고, 운영 클러스터는 Git의 정의를 적용한 결과입니다.

이렇게 정하면 다음과 같이 됩니다.

- 모든 변경은 pull request로 들어오고, 리뷰와 승인 기록이 남습니다.
- 롤백은 `git revert` 후 다시 적용하면 됩니다.
- 운영 UI에서 직접 고친 것은 다음 배포 때 사라집니다. 이 점을 팀이 알고 있어야 합니다.

마지막 항목 때문에 UI 변경에 대한 정책이 필요합니다. 선택지는 둘입니다.

| 정책 | 방법 | 맞는 경우 |
| --- | --- | --- |
| UI 변경을 막는다 | 운영 space에서 해당 객체에 읽기 권한만 줍니다. 변경은 개발 space에서 하고 export해서 PR로 올립니다 | 운영 dashboard, rule처럼 정해진 사람만 바꾸는 객체 |
| UI 변경을 Git에 반영한다 | 정기적으로 export해서 Git과 비교하고, 차이를 PR로 만듭니다 | 분석가가 자주 고치는 dashboard |

현장에서는 두 번째로 시작했다가 drift가 쌓여 첫 번째로 옮기는 경우가 많았습니다. 처음부터 운영 space는 읽기 전용으로 두는 쪽을 권합니다.

## 코드로 관리하는 도구

같은 대상도 여러 도구로 관리할 수 있습니다. 한 대상에 도구를 하나만 정해야 서로 덮어쓰지 않습니다.

| 도구 | 다루는 범위 | 상태 | 맞는 경우 |
| --- | --- | --- | --- |
| API 요청 파일과 스크립트 | 모든 Elasticsearch, Kibana API | 각 API의 상태를 따름 | 도구를 늘리고 싶지 않을 때, 폐쇄망 |
| Terraform `elastic/elasticstack` provider | index template, component template, ILM, ingest pipeline, cluster settings, role, role mapping, SLM, snapshot repository, transform, watch, ML job, enrich policy, alerting rule, connector, data view, SLO, space, Fleet agent policy와 integration policy, detection rule, dashboard 등 | provider 자체는 Elastic Stack 8.0 이상을 지원. 리소스마다 상태가 다르고 dashboard 리소스는 tech preview | 이미 Terraform을 쓰는 조직 |
| ECK manifest | Kubernetes 위의 Elasticsearch, Kibana, Agent, Fleet Server 구성 | GA | Kubernetes 운영 |
| Terraform `elastic/ec` provider | ECH deployment 자체(크기, 버전, 설정) | GA | ECH |
| Elastic CLI | Elasticsearch, Kibana API를 명령줄에서 호출 | tech preview | 스크립트 작성 보조 |
| Synthetics project monitor | synthetic monitor를 코드로 작성하고 `push` | GA | synthetic monitor |
| detection-rules 저장소의 detections as code | detection rule의 import, export, 버전 관리 | 저장소 문서의 지원 범위를 따름 | detection rule을 많이 운영하는 보안 조직 |

Terraform 리소스 목록은 [provider 저장소의 docs/resources](https://github.com/elastic/terraform-provider-elasticstack/tree/main/docs/resources)에서 확인했습니다. detections as code는 [detection-rules 저장소](https://github.com/elastic/detection-rules#detections-as-code-dac)가 `kibana export-rules`, `kibana import-rules` 명령을 지원 범위로 밝히고 있습니다.

Terraform을 쓸 때 현장에서 자주 만난 문제가 두 가지 있습니다. UI에서 integration을 먼저 업그레이드하면 코드의 정의와 어긋나서 다음 `apply`가 실패하거나 되돌립니다. agent가 붙어 있는 agent policy는 지울 수 없어서, 코드에서 policy를 교체하려 하면 `apply`가 멈춥니다. 둘 다 UI 작업이 "코드가 source of truth"라는 원칙을 깨서 생깁니다.

## drift 확인

Git의 정의와 실제 클러스터 상태가 다른 것을 drift라고 합니다. 정기적으로 실제 상태를 읽어 Git과 비교합니다.

```console
# 동적으로 바꾼 cluster settings. 기본값은 빼고 직접 바꾼 값만 나온다
GET _cluster/settings?flat_settings=true

# index template과 component template의 version, _meta
GET _index_template?filter_path=index_templates.name,index_templates.index_template.version,index_templates.index_template._meta
GET _component_template?filter_path=component_templates.name,component_templates.component_template.version,component_templates.component_template._meta

# ingest pipeline의 version과 _meta
GET _ingest/pipeline?filter_path=*.version,*._meta

# ILM policy의 version(수정할 때마다 오름)과 마지막 수정 시각
GET _ilm/policy?filter_path=*.version,*.modified_date
```

이 요청들은 이럴 때 씁니다.

| 상황 | 쓰는 요청 |
| --- | --- |
| 작업 시간 직전, 바꾸기 전의 정의를 남겨 두고 싶다 | 대상 template, pipeline, policy를 GET해서 파일로 저장. 롤백 때 그대로 다시 PUT |
| 월간 점검에서 Git과 운영이 같은지 확인한다 | 위 요청을 스크립트로 돌려 Git의 정의와 비교 |
| 장애 대응 중에 누가 바꾼 설정이 남아 있는지 찾는다 | `GET _cluster/settings?flat_settings=true`. 기본값이 아닌 것만 나오므로 짧음 |
| 이전 담당자가 Dev Tools에서 고친 template이 있는지 의심된다 | `version`과 `_meta`가 비어 있거나 Git과 다른 template을 찾음 |

`version`은 사용자가 정하는 값이라 자동으로 오르지 않습니다(ILM policy의 `version`은 예외로, 수정할 때마다 Elasticsearch가 올립니다). 그래서 template과 pipeline을 Git에서 관리할 때는 PR마다 `version`을 올리고 `_meta`에 변경 근거(PR 번호, 담당 팀)를 적는 규칙을 둡니다. 그러면 위 요청만으로 운영에 적용된 정의가 Git의 어느 시점인지 알 수 있습니다.

```console
PUT _component_template/app-logs-mappings
{
  "version": 12,
  "_meta": {
    "owner": "platform-team",
    "source": "git:infra-elastic@a1b2c3d",
    "change": "PR-482 add http.response.time"
  },
  "template": {
    "mappings": {
      "properties": {
        "http.response.time": { "type": "long" }
      }
    }
  }
}
```

Kibana 객체는 saved objects export로 읽어서 Git의 파일과 비교합니다. dashboard라면 Dashboards API의 GET 응답이 비교하기 더 쉽습니다([06](../06-dashboards-as-code/#drift-검사)).

## 누가 바꿨는지 남긴다

Git 밖에서 일어난 변경을 찾으려면 audit log가 필요합니다.

- Elasticsearch audit log는 `elasticsearch.yml`의 `xpack.security.audit.enabled: true`로 켭니다. template이나 pipeline을 바꾼 요청은 action 이름(`indices:admin/index_template/put`, `cluster:admin/ingest/pipeline/put` 등)으로 찾습니다([Elasticsearch audit events](https://www.elastic.co/docs/reference/elasticsearch/elasticsearch-audit-events)).
- Kibana audit log는 `kibana.yml`의 `xpack.security.audit.enabled: true`로 켭니다. saved object 변경은 `saved_object_create`, `saved_object_update`, `saved_object_delete`, space 이동은 `saved_object_update_objects_spaces` 이벤트로 남습니다([Kibana audit events](https://www.elastic.co/docs/reference/kibana/kibana-audit-events)).

audit logging은 구독 조건이 있습니다. 적용 등급은 [subscription 페이지](https://www.elastic.co/subscriptions)에서 확인합니다. 로그 양이 많으므로 필요한 이벤트만 남기도록 include, exclude 설정을 같이 정합니다.

## CI/CD 계정 설계

자동화가 쓰는 계정은 사람 계정과 분리합니다. 이유는 다음과 같습니다.

- detection rule을 API key로 수정하면 그 key가 rule에 붙습니다. key가 삭제되거나 사용자가 비활성화되면 rule이 멈춥니다. key의 권한이 이전과 다르면 rule 동작도 달라질 수 있습니다([Patch a detection rule](https://www.elastic.co/docs/api/kibana/operation/operation-patchrule)). alerting rule도 같은 방식으로 API key를 씁니다.
- 사람이 운영 Kibana에서 자동화가 만든 객체를 한 번 수정하면, 그 객체의 key나 소유자가 사람 쪽으로 바뀝니다. 그 사람이 퇴사하면 같은 문제가 생깁니다. 현장에서 반복해서 만난 문제입니다.

그래서 다음을 지킵니다.

- 배포 전용 사용자나 service account를 만들고, 거기서 발급한 API key만 CI에 둡니다.
- key에는 필요한 권한만 줍니다. dashboard 배포라면 대상 space의 Dashboard 권한, template 배포라면 `manage_index_templates`, `manage_ilm`, `manage_pipeline`처럼 나눕니다.
- key에 만료를 두고, 교체 절차를 runbook으로 남깁니다. 교체 직후 rule을 다시 저장해야 새 key가 쓰이는지 검증 환경에서 확인합니다.
- 운영 space에서 사람이 rule을 직접 수정하지 않게 권한을 나눕니다.

## 정리

| 결정할 것 | 기본값으로 권하는 것 |
| --- | --- |
| source of truth | Git. 운영 클러스터는 적용 결과 |
| managed 자산 | 직접 관리하지 않음. `@custom`만 관리 |
| UI 변경 정책 | 운영 space는 읽기 전용 |
| 도구 | 대상마다 하나. 이미 Terraform이 있으면 Terraform, 없으면 API 요청 파일 |
| 버전 표시 | template, pipeline의 `version`과 `_meta`를 PR마다 갱신 |
| 추적 | Elasticsearch, Kibana audit log |
| 자동화 계정 | 전용 계정과 최소 권한 API key, 만료와 교체 절차 |

다음 글 [02. 변경 절차](../02-change-process/)는 변경 하나를 어떤 순서로 진행하는지 다룹니다.

## 참고 문서

- [Upgrade Elasticsearch](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/elasticsearch)
- [Roll back to a previous version of Kibana](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/kibana-roll-back)
- [Elasticsearch audit events](https://www.elastic.co/docs/reference/elasticsearch/elasticsearch-audit-events)
- [Kibana audit events](https://www.elastic.co/docs/reference/kibana/kibana-audit-events)
- [Terraform provider for Elastic Stack](https://registry.terraform.io/providers/elastic/elasticstack/latest/docs)
- [Patch a detection rule](https://www.elastic.co/docs/api/kibana/operation/operation-patchrule)
