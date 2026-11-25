# 0. 사이트 구조와 공통 규칙

새 컬렉션을 넣기 전에 정해 둘 것들입니다. 한 번 정하면 URL과 폴더를 다시 옮기기 어렵기 때문에 가장 먼저 처리합니다.

## 0-1. 최상위 sidebar 재구성과 URL 정책

상태: `부분 결정` (2026-11-25)

결정한 것: 기존 AD 컬렉션 URL(`/ml/anomaly-detection/...`)은 그대로 둔다(A안). 새 컬렉션은 문제 축 폴더에 둔다. 첫 컬렉션은 `data/`(sidebar "데이터 설계")이고, sidebar 그룹은 첫 글을 공개할 때 추가한다.
남은 것: 기존 "Machine Learning" 그룹 label을 "탐지와 알림"으로 바꿀지, 나머지 그룹을 언제 추가할지.

현재 sidebar의 최상위 그룹은 `Machine Learning`이라는 제품 분류입니다. 이 사이트의 원칙은 "제품 기능별이 아니라 풀어야 할 문제별"이므로, 최상위 그룹을 문제 축으로 바꾸는 것을 검토합니다.

결정할 것:

- 최상위 그룹 이름 6개. 후보:
  - 데이터 설계 / 수집 / 안정성 운영 / 변화 관리 / 탐지와 알림 / 검색
- 폴더 이름(URL에 들어감). 후보:
  - `data/`, `ingest/`, `operations/`, `change/`, `detection/`, `search/`
- 기존 AD 컬렉션 URL(`/ml/anomaly-detection/...`) 처리 방법:
  - A안: 폴더는 그대로 두고 sidebar에서 그룹 label만 "탐지와 알림"으로 바꾼다. URL이 바뀌지 않으므로 외부 링크가 깨지지 않는다.
  - B안: `detection/anomaly-detection/`로 옮기고 Astro `redirects` 설정으로 기존 URL을 넘겨준다. 구조는 깔끔하지만 redirect를 계속 관리해야 한다.
  - 판단 기준: 이미 외부에 공유한 링크가 있는지, redirect가 GitHub Pages(정적 호스팅)에서 어떻게 동작하는지 확인한 뒤 고른다.

작업:

- [ ] 외부에 공유된 기존 AD 글 링크가 있는지 확인
- [ ] Astro `redirects`가 정적 빌드에서 만드는 결과물(meta refresh 페이지)을 로컬 빌드로 확인
- [ ] A안 또는 B안 결정, 결정 이유를 이 문서에 기록
- [ ] `astro.config.mjs`의 `sidebar` 수정. 아직 글이 없는 그룹은 추가하지 않거나, 첫 글 발행 시점에 추가
- [ ] 홈(`src/content/docs/index.mdx`)의 소개 문구와 컬렉션 안내를 새 구조에 맞게 수정

## 0-2. 컬렉션 개요(`index.md`) 뼈대

상태: `미착수`

- [ ] 컬렉션마다 `index.md`를 `draft: true`로 만든다. AD 컬렉션 `index.md`와 같은 구성(소개, 기준, 구성 표, 자주 받는 질문, 읽는 순서)을 따른다
- [ ] 구성 표의 각 행은 "예정"으로 두고, 글이 발행될 때 링크로 바꾼다
- [ ] 단계 1을 시작할 때 "데이터 설계" 컬렉션 개요부터 채운다

## 0-3. labs 디렉터리 규칙과 공통 환경

상태: `미착수`

- [ ] 폴더 규칙 확정: `labs/<collection>/<slug>/` 아래에 `README.md`, 데이터 생성 스크립트, 설정, 결과 요약
- [ ] 공통 실험 환경 `labs/_env/`: Elasticsearch, Kibana를 docker compose로 띄우는 파일. 버전은 `.env`로 바꿀 수 있게 하고 기본값은 글 기준 버전으로 둔다
- [ ] snapshot repository 실험용 S3 호환 저장소(MinIO 등) 서비스를 compose에 선택적으로 추가
- [ ] 공통 synthetic 로그 생성기 `labs/_datagen/`: host 수, 필드 수, message 길이, 배열과 객체 비율, 시간 범위를 파라미터로 받는다. 단계 1~3이 같이 쓴다
- [ ] 측정 스크립트 공통 규칙: 결과를 CSV나 JSON으로 남기고, 실행 환경(CPU, 메모리, 디스크, 버전)을 함께 기록
- [ ] 라이선스가 필요한 기능 실험은 trial 라이선스 사용 여부와 기간을 README에 적는다

## 0-4. 템플릿과 원칙 문서 보강

상태: `미착수`

- [ ] `templates/use-case.md`의 `참고 문서` 절에 출처 등급(A 공식 문서, B Labs, C 공개 소스, D labs 실측)을 주석으로 안내
- [ ] 템플릿 `기준과 전제`에 "배포 형태" 항목 추가
- [ ] About의 "개인의 경험과 의견에 기반" 문구가 각 컬렉션 개요에서도 한 번 보이도록 할지 결정
- [ ] `about/principles.md`에 "공개 출처만 근거로 쓴다"는 문장이 필요한지 검토 (현재는 공식 문서와 소스, 직접 실행 결과를 근거로 쓴다고 되어 있음)
