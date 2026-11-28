# 변화 관리 컬렉션 화면 캡처 목록

`src/content/docs/change/` 글에 넣을 Kibana 실제 화면 목록입니다. 캡처 규칙은 `engineering-notes-writing` 스킬 4절을 따릅니다.

- 저장 위치: `src/assets/change/`, jpg, 내용을 알 수 있는 파일 이름
- lab 객체 이름은 글의 예시를 그대로 씁니다(`logs-90d`, `logs@custom`, `web-logs-overview` 등). 고객 환경처럼 보이는 이름은 쓰지 않습니다.
- 캡처 전에 계정명, 개인정보가 화면에 없는지 확인하고 필요한 영역만 자릅니다.
- 본문 삽입 형식: `![화면에서 무엇을 봐야 하는지 한 문장.](../../../assets/change/<파일>.jpg)`
- 넣을 위치는 "절" 열의 제목 바로 아래 문단 뒤입니다. 해당 문단을 함께 적었습니다.
- 기준 버전: Kibana 9.5.x. 표시가 없는 화면은 Stack 9.5에서 캡처합니다.

## 준비할 lab 상태

1. Kibana 샘플 웹 로그 설치(06용)
2. Nginx integration 설치와 Agent 1대(03, 04용. Agent가 없으면 integration 자산만 설치해도 template, pipeline 화면은 나옴)
3. Elastic Security 사용 가능한 구독 또는 trial(03 prebuilt rule 화면)
4. `labs/change/managed-assets.console`의 `logs-90d` policy와 `logs@custom` component template 생성

## 목록

| # | 글 | 절 | 넣을 위치(이 문단 뒤) | 파일 이름 | 캡처할 화면 | alt 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 02 | 알림 억제 | "Kibana maintenance window를 씁니다. ..." 문단 | `maintenance-window-create.jpg` | Stack Management, Maintenance Windows, Create. 반복 일정과 rule category, filter 설정 영역 | Maintenance window 생성 화면. 일정, 반복, 적용할 rule category와 filter를 정합니다. |
| 2 | 03 | managed 자산을 알아보는 법 | "Kibana 쪽은 화면에 표시됩니다. ..." 문단 | `managed-dashboard-badge.jpg` | Nginx integration dashboard 상단의 Managed 배지를 누른 팝오버(Duplicate 버튼 보이게) | integration dashboard의 Managed 배지. 직접 편집할 수 없고 Duplicate로 복제해서 고칩니다. |
| 3 | 03 | managed 자산을 알아보는 법 | 위와 같은 절, `GET _index_template` 코드 블록 뒤 | `index-templates-managed.jpg` | Index Management, Index Templates 목록. `logs`, `logs-nginx.access` 등이 보이고 priority 열과 managed 표시가 보이게 | Index Templates 목록. built-in과 integration template은 managed로 표시되고 priority가 100, 200입니다. |
| 4 | 03 | component template의 `@custom` 계층 | 우선순위 표 다음 "`composed_of` 목록에서 뒤에 있는..." 문단 | `integration-template-composed-of.jpg` | `logs-nginx.access` index template 상세의 component template 목록. `@package` 뒤에 `@custom`들이 순서대로 보이게 | integration index template의 component template 순서. `@package` 뒤에 `@custom`이 와서 덮어씁니다. |
| 5 | 03 | component template의 `@custom` 계층 | `PUT _component_template/logs@custom` 코드 블록 뒤 | `data-stream-ilm-after-custom.jpg` | rollover 뒤 Data Streams 탭에서 `logs-nginx.access-default`를 열어 ILM policy가 `logs-90d`로 보이는 상세 | rollover 뒤 data stream 상세. 새 backing index부터 `logs-90d` policy가 적용됩니다. |
| 6 | 03 | prebuilt detection rule | 등급 표 다음 문단 | `prebuilt-rule-modified.jpg` | Enterprise 또는 trial에서 prebuilt rule 하나를 수정한 뒤 Modified 배지와 원본 비교 화면(9.1+) | 수정한 prebuilt rule의 Modified 배지와 Elastic 원본과의 비교. |
| 7 | 03 | 이미 managed 자산을 고쳐 놓은 환경 | 번호 목록 5번 뒤 | `fleet-reinstall-assets.jpg` | Integrations, 설치된 Nginx, Settings 탭의 Reinstall assets 버튼과 "Keep integration policies up to date automatically" 체크박스 | integration Settings 탭. 자산 재설치와 integration policy 자동 업그레이드 설정이 있습니다. |
| 8 | 04 | ILM policy 변경 | `_ilm/explain` 코드 블록 뒤 | `ilm-explain-backing-index.jpg` | Index Management에서 backing index 하나를 열어 lifecycle 정보(policy, phase, phase 정의) | backing index의 lifecycle 상세. 현재 phase와 적용 중인 policy를 봅니다. |
| 9 | 04 | 적용 전에 확인하는 API | `_ingest/_simulate` 코드 블록 뒤 | `ingest-simulate-result.jpg` | Dev Tools에서 `_ingest/_simulate` 실행 결과. `executed_pipelines`와 변환된 문서가 보이게 | `_ingest/_simulate` 결과. 실행된 pipeline 목록과 mapping 검증을 거친 문서가 나옵니다. |
| 10 | 05 | saved objects NDJSON의 규칙 | import 옵션 표 뒤 | `saved-objects-import-options.jpg` | Saved Objects, Import 플라이아웃의 충돌 처리 옵션(overwrite, new copies) | saved objects import 옵션. ID를 유지하려면 덮어쓰기를, 새 ID가 필요하면 새 복사본을 고릅니다. |
| 11 | 05 | ID 전략 | data view 생성 코드 블록 뒤 | `data-view-custom-id.jpg` | Data view 생성 화면에서 Show advanced settings를 펼쳐 Custom data view ID 입력란이 보이게 | data view 생성 화면의 Custom data view ID. 환경마다 같은 ID를 지정합니다. |
| 12 | 05 | rule과 API key | 현장 사례 목록 뒤 | `rule-execution-error.jpg` | Rules 목록에서 실행 상태가 Failed인 rule과 오류 메시지(API key 관련) 툴팁. lab에서 rule을 만든 사용자의 key를 무효화해 재현 | 실행에 실패한 rule. API key가 무효가 되면 알림이 오지 않고 실행 상태에만 오류가 남습니다. |
| 13 | 05 | 운영 space 권한과 변경 추적 | 첫 두 항목 뒤 | `dashboard-access-mode.jpg` | dashboard Share 메뉴의 편집 권한 설정(다른 사용자의 편집 제한) | dashboard 접근 설정. 소유자 외의 편집을 제한합니다. |
| 14 | 06 | export | "UI에서는 dashboard의 Export 메뉴에서..." 문단 | `dashboard-export-json.jpg` | `web-logs-overview` dashboard에서 Export, Export JSON 플라이아웃. Unsupported properties 영역이 보이면 더 좋음 | Export JSON 플라이아웃. API가 받는 형식의 JSON과 빠진 속성 목록을 보여 줍니다. |
| 15 | 06 | 배포 후 검증 | 첫 문단 뒤 | `dashboard-deployed.jpg` | `deploy.sh`로 배포한 "Web logs overview (as code)" dashboard. 두 metric 패널에 값이 보이게 | API로 배포한 dashboard. 외부 참조 없이 샘플 웹 로그를 읽습니다. |
| 16 | 07 | TLS 인증서 교체 | `GET _ssl/certificates` 코드 블록 뒤 | `ssl-certificates-expiry.jpg` | Dev Tools의 `GET _ssl/certificates` 결과에서 `expiry`가 보이는 부분(경로의 호스트명은 일반 이름으로) | 인증서 API 결과. `expiry`를 정기 점검에 넣어 만료 전에 알 수 있습니다. |
| 17 | 08 | 준비 절차, Upgrade Assistant와 deprecation | 첫 항목 뒤 | `upgrade-assistant-overview.jpg` | 8.19 Kibana의 Upgrade Assistant 개요(critical, warning 개수, 백업 단계). 8.19 lab이 있을 때만 | 8.19 Upgrade Assistant. critical 문제를 모두 해결해야 9.x로 올릴 수 있습니다. |
| 18 | 09 | 버전 인벤토리 | 표 뒤 | `fleet-agent-versions.jpg` | Fleet, Agents 목록에서 버전 필터를 연 화면(버전별 개수) | Fleet의 Agent 버전 필터. 공지가 나오면 영향받는 버전의 Agent 수를 바로 봅니다. |

## 캡처하지 않는 것

- 06의 GitHub Actions 실행 화면: GitHub UI라 사이트 규칙상 넣지 않습니다. 필요하면 workflow 로그 텍스트를 코드 블록으로 넣습니다.
- 10의 이관 화면: Kibana 화면이 아니라 API 결과라 넣지 않습니다.

## 캡처 결과(2026-11-28, ECH 9.5.5)

- 17장을 반영했습니다. 17번(8.19 Upgrade Assistant)은 8.19 lab이 없어 넣지 않았습니다.
- 3번: 9.5 Index Templates 목록에는 priority 열이 없어 Managed 배지만 보이게 찍었습니다. priority는 4번 상세 화면에 나옵니다.
- 6번: prebuilt rule 하나에 tag를 추가해 찍고, 원래 tag로 되돌렸습니다.
- 7번: integration policy가 없는 lab이라 policy 자동 업그레이드 체크박스는 화면에 나오지 않았습니다.
- 12번: API key로 rule을 만든 뒤 key를 무효화해 재현했고, 캡처 뒤 rule을 지웠습니다.
- 13번: 9.5에서는 Share 화면의 Permissions에서 Can edit, Can view로 바꿉니다.
- 16번: 인증서 subject의 클러스터, 계정 식별자가 들어간 항목은 잘라 냈습니다.
- 18번: 9.5 Fleet Agents 목록에는 버전 필터 버튼이 없어 KQL 검색으로 찍었습니다.
