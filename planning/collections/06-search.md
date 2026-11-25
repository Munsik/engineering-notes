# 6. 검색 품질을 측정하고 개선하기

Observability, Security 중심 독자와 관심사가 달라서 별도 축으로 둡니다.
한국어 검색을 기본 시나리오로 씁니다.

- 예정 폴더: `src/content/docs/search/`
- 예정 labs: `labs/search/`

---

## 6-1. semantic search를 도입하기 전에 무엇을 측정해야 하는가

상태: `미착수`
예정 파일: `search/01-measure-before-semantic.md`, `labs/search/measure-before-semantic/`

### 이 글이 답하는 질문

- semantic search로 바꾸면 검색이 정말 좋아지나. 어떻게 확인하나
- 평가용 질의와 정답(judgment list)은 어떻게 만드나
- 한국어에서 Nori 기반 lexical, semantic, hybrid는 각각 어떤 질의에 강하고 약한가
- 오프라인 평가 이후 실제 사용자 반응은 어떻게 측정하나

### 독자와 전제

- 검색 서비스를 운영하거나 개선을 검토하는 개발자와 기획자
- 기준: Elasticsearch 9.x, Nori 플러그인, semantic_text

### 범위

다룸:

- judgment list 만들기와 ranking evaluation API로 지표 계산
- 같은 질의 세트로 lexical, semantic, hybrid(RRF 등) 비교
- semantic이 불리한 질의 유형: 짧은 질의, 코드나 모델명, 고유명사 (실측으로 확인한 범위만)
- 온라인 지표: click, conversion 측정 방법 (공개 Labs 시리즈 기준)

다루지 않음:

- 모델 학습이나 fine-tuning
- 비용 비교

### 목차 초안

1. 업무 문제: "semantic으로 바꾸자는데 근거가 없다"
2. 측정 없이 바꾸면 생기는 일
3. 설계 결정: 질의 세트 구성, 지표 선택(precision, recall, NDCG 등)
4. 구현: judgment list 형식, rank_eval 요청 예시
5. 검증: 한국어 데이터셋으로 세 방식 비교 실측
6. 운영: 온라인 지표 수집, 변경 전후 비교 절차
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 데이터: 라이선스가 명확한 한국어 데이터셋, 없으면 synthetic 상품이나 문서 카탈로그를 직접 생성
- 질의 세트: 질의 유형별(일반 서술형, 짧은 키워드, 모델명과 코드, 오타 포함) 각 20~50개, 정답 등급 부여
- 비교: Nori 분석기 lexical / semantic_text / hybrid
- 지표: rank_eval의 precision@k, recall@k, NDCG 등, 질의 유형별로 분리
- 산출물: 데이터 생성 또는 출처, judgment list, 평가 스크립트, 결과

### 공식 출처

- [Ranking evaluation](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-rank-eval)
- [Korean (nori) analysis plugin](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori)
- [Semantic search with the inference API](https://www.elastic.co/docs/solutions/search/semantic-search/semantic-search-inference)
- Search Labs: [When hybrid search truly shines](https://www.elastic.co/search-labs/blog/elasticsearch-hybrid-search)
- Search Labs: [Search relevance tuning](https://www.elastic.co/search-labs/blog/search-relevance-tuning-in-semantic-search)
- Search Labs: [Search analytics with OpenTelemetry](https://www.elastic.co/search-labs/blog/series/search-analytics-opentelemetry)

### 확인할 사실

- [ ] rank_eval이 지원하는 지표 목록과 retriever 사용 가능 여부
- [ ] semantic_text 기본 inference endpoint와 다국어 지원 모델(버전별)
- [ ] hybrid 결합 방식(RRF, linear 등)의 버전별 상태
- [ ] Nori 사용자 사전 관련 제약
- [ ] 사용할 데이터셋의 라이선스

### 작업 항목

- [ ] 데이터셋 선정과 라이선스 확인
- [ ] 질의 세트와 judgment list 작성
- [ ] 평가 스크립트 작성과 실행
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 6-2. 외부 embedding, LLM 제공자가 바뀌어도 버티는 설계

상태: `미착수`
예정 파일: `search/02-model-dependency.md`, `labs/search/model-dependency/`

### 이 글이 답하는 질문

- 외부 embedding 모델이 바뀌거나 출력이 조금 달라졌더니 색인이 거부된다. 왜 그런가
- `dot_product`와 `cosine` 중 무엇을 골라야 하나
- 모델을 교체할 때 서비스 중단 없이 재색인하려면
- 외부 LLM 제공자의 파라미터나 제한이 바뀔 때 영향을 줄이려면

### 독자와 전제

- 외부 모델 API로 vector search나 RAG를 운영하는 개발자
- 기준: Elasticsearch 9.x, dense_vector, inference endpoint

### 범위

다룸:

- similarity 선택: `dot_product`가 요구하는 정규화 조건과 `cosine`의 차이 (공식 문서 기준)
- inference endpoint로 모델 의존성을 한곳에 모으는 구성
- 모델 교체 절차: 새 필드나 새 index에 색인 → 검증 → alias 전환
- 차원 수와 quantization 선택이 교체에 주는 영향
- 외부 호출 실패와 지연을 감시하는 방법

다루지 않음:

- 특정 외부 제공자의 정책 변경 이력

### 목차 초안

1. 업무 문제: "모델 쪽이 바뀌었을 뿐인데 검색이 깨졌다"
2. 외부 모델에 의존하는 지점: 색인 시점, 검색 시점
3. 설계 결정: similarity, endpoint 구성, 교체 전략
4. 구현: 매핑 예시, alias 전환 절차
5. 검증: labs에서 정규화되지 않은 벡터 주입, 모델 교체 시나리오
6. 운영: 감시 지표, 교체 체크리스트
7. 판단 기준 요약 (해석)

### labs 실험 설계

- 로컬에서 생성한 벡터로 재현 (외부 API 없이)
  - `dot_product` 매핑에 단위 길이에서 약간 벗어난 벡터를 넣어 동작 확인
  - 같은 데이터를 `cosine`으로 넣어 비교
- 모델 교체 시나리오: 차원이 다른 두 벡터 집합으로 새 index 구성 → alias 전환, 전환 중 검색 결과 확인
- 산출물: 매핑, 스크립트, 결과

### 공식 출처

- [Dense vector field type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/dense-vector)
- [Dense vector search](https://www.elastic.co/docs/solutions/search/vector/dense-vector)
- [Semantic search with the inference API](https://www.elastic.co/docs/solutions/search/semantic-search/semantic-search-inference)

### 확인할 사실

- [ ] `dot_product`의 정규화 요구와 허용 오차에 대한 공식 문구
- [ ] dense_vector 기본 similarity와 기본 index_options(quantization)
- [ ] inference endpoint의 재시도, timeout 관련 설정 공개 범위
- [ ] semantic_text에서 inference endpoint를 바꿀 때의 제약

### 작업 항목

- [ ] 재현 스크립트 작성과 실행
- [ ] 교체 절차 체크리스트 작성
- [ ] 초안 작성 → [공통 체크리스트](../ARTICLE-CHECKLIST.md)

---

## 6-3. Agent Builder, Workflows를 프로덕션에 올릴 때

상태: `보류`

### 착수 조건

- [ ] 배포 형태별(Serverless, ECH, self-managed) GA 상태가 공식 문서에 명시됨
- [ ] 권한, 확장, 백업과 복구, 스케줄 보장에 대한 공식 문서가 있음

### 착수하면 답할 질문 (메모)

- 어떤 권한 모델로 사용자와 agent의 접근을 제한하나
- 사용자와 실행 수가 늘 때 무엇이 병목이 되나
- agent와 workflow 정의를 어떻게 백업하고 복구하나
- 스케줄 실행이 누락되면 어떻게 알아채나
- 외부 LLM 연결을 바꿀 때 영향은 무엇인가 (6-2와 연결)

### 작업 항목

- [ ] 분기마다 착수 조건 재확인, 확인 날짜를 이 문서에 기록
