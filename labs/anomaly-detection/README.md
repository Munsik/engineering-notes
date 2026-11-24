# Anomaly Detection Labs

[Anomaly Detection in Production](https://munsik.github.io/engineering-notes/ml/anomaly-detection/) 컬렉션의 실험 코드와 설정입니다.

글마다 폴더를 하나씩 둡니다. 폴더 이름은 글의 파일 이름과 같습니다.

```
labs/anomaly-detection/
  03-bucket-span/
    README.md        실험 목적, 기준 버전, 실행 순서, 결과 요약
    generate_data.py synthetic data 생성
    jobs/            비교에 쓴 job, datafeed 설정 (JSON)
    results/         측정 결과
```

실제 고객 데이터는 쓰지 않습니다. 모든 데이터는 synthetic data로 만듭니다.
