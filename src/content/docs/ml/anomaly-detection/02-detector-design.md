---
title: Detector와 분석 단위를 어떻게 설계하는가
description: TODO
draft: true
sidebar:
  label: 02. Detector Design
  order: 2
---

:::note[기준]
- Elastic Stack 버전: TODO
- 관련 기능 상태: GA / tech preview 여부 TODO
- 실험 코드: `labs/anomaly-detection/02-detector-design/`
:::

## 이 글이 답하는 질문

- `count`, `high_mean`, `rare` 같은 function은 어떤 기준으로 고르는가
- single metric, multi-metric, population 분석은 각각 언제 쓰는가
- `by_field_name`, `over_field_name`, `partition_field_name`의 차이와 선택 기준은 무엇인가
- influencer를 어떻게 정해야 원인 분석에 도움이 되는가

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
