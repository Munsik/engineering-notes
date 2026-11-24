---
title: Bucket span을 정하는 기준
description: TODO
draft: true
sidebar:
  label: 03. Bucket Span
  order: 3
---

:::note[기준]
- Elastic Stack 버전: TODO
- 관련 기능 상태: GA / tech preview 여부 TODO
- 실험 코드: `labs/anomaly-detection/03-bucket-span/`
:::

## 이 글이 답하는 질문

- bucket span을 결정하는 주요 변수는 무엇인가
- 이벤트 발생 주기와 bucket span은 어떤 관계인가
- bucket span을 줄이면 탐지 지연과 탐지 품질은 어떻게 달라지는가
- 같은 데이터에 여러 bucket span을 적용했을 때 결과를 어떻게 비교할 것인가
- cardinality가 높은 데이터에서는 무엇을 더 고려해야 하는가

## 문제 정의

<!-- 어떤 상황에서 이 결정이 문제가 되는가. 현장 사례는 업종 수준으로 일반화 -->

## 결정해야 할 것

<!-- 선택지와 각 선택지의 trade-off -->

## 실험

<!-- 데이터 구성, job 설정, 비교 지표, 결과. 수치는 직접 측정한 값만 -->

## 판단 기준

<!-- "이 조건이면 이렇게, 이유는 위 실험" 형태로 -->

## 프로덕션에서 주의할 점

## 정리
