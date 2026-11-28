---
title: "How metrics are stored differently from logs"
description: How time series data streams (TSDS) build document IDs, the time range they accept and what happens to late data, past backing index creation in 9.5, storage size and downsampling, based on the official documentation and measurements on Elasticsearch 9.5.5.
translatedFrom: da98e87b83a16d1b31d76aafb958a5a81e48ef0b
sidebar:
  label: 07. Metrics and TSDS
  order: 7
---

Most `metrics-*-*` data streams collected by Elastic Agent are time series data streams (TSDS).
A TSDS looks the same as a log data stream from the outside, but it builds document IDs differently and accepts a different time range. Some techniques that work for logs do not carry over.
Fingerprint-based deduplication cannot be used, and when a collector stops for a few hours and then sends its backlog of metrics, documents for those times are rejected.

This article measures these differences and covers what to change when designing and running metrics.

:::note[Baseline]
- Elasticsearch 9.5.5. The official documentation was rechecked in November 2026.
- Measurements ran on a local single-node Elasticsearch 9.5.5 (1 vCPU, 1GB JVM heap). The time range, duplicate and past index experiments used a basic license, storage size was measured on both basic and trial, and downsampling used trial. Experiment code and results are in [`labs/data/time-series/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data/time-series).
:::

## How a TSDS is structured

A TSDS is a data stream created with `index.mode: time_series`. The mapping marks which fields identify a time series (dimensions) and which fields are measurements (metrics) ([Time series data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-series-data-stream-tsds)).

| Element | Meaning | Example |
| --- | --- | --- |
| dimension | Values that identify a time series. `time_series_dimension: true` | `host.name`, `metric.name` |
| metric | Measurements. `time_series_metric` is `gauge` (goes up and down) or `counter` (only increases) | `cpu.pct` (gauge), `net.bytes` (counter) |
| `@timestamp` | Measurement time | |

Documents with the same dimension values form one time series. Elasticsearch routes and sorts by dimension values, and that affects both storage size and document IDs.

## Duplicates and document IDs

A TSDS builds the document ID itself from dimension values and `@timestamp`. Documents for the same series and the same time were indexed:

| Document | Response |
| --- | --- |
| First document | 201 |
| Same dimensions, same time, **different value** | 409 version conflict |
| Same dimensions, one second later | 201 |
| User-supplied `_id` (`my-fingerprint`) | 400. Error saying `_id` must be empty or match the one Elasticsearch generates |

Two things stand out.

- **Fingerprint-based deduplication cannot be used on a TSDS.** Instead, the same series at the same time automatically returns 409. When a collector resends the same metrics, no duplicates are created, and Agent counts them as `duplicates` ([Ingest 05](../../ingest/05-count-reconciliation/#중복-찾기와-막기)).
- **It is 409 even when the value differs.** The first value stays and later ones are dropped. If a missing dimension merges different series into one, only one measurement per timestamp survives and the rest disappear as 409s. For example, if per-disk usage does not include the device name as a dimension, only one disk's value per host is kept. Define dimensions completely, using the test "if this value differs, is it a different series?"

## The time range a TSDS accepts for writes

Each TSDS backing index accepts a specific `@timestamp` range (`index.time_series.start_time`, `end_time`). The range is set when the data stream is created or rolled over. By default, the first backing index accepts from 2 hours before creation (`index.look_back_time`) to 30 minutes ahead (`index.look_ahead_time`) ([Time-bound TSDS](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-bound-tsds), [Time series index settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/time-series)).

Documents with different timestamps were sent to a newly created TSDS:

| Document time | Without failure store | With failure store |
| --- | --- | --- |
| Now | 201 | 201 |
| 1 hour ago | 201 | 201 |
| 3 hours ago | 400. Outside the range of any writable index | 201, sent to the failure store |
| 1 hour ahead | 400. Same error | 201, sent to the failure store |

- This range is designed for the normal case, where only recent data arrives. **When a collector stops for a few hours and then sends its backlog all at once, the part outside the range is rejected.** This kind of loss does not happen with log data streams.
- Metrics from hosts whose clock runs more than 30 minutes fast are also rejected. That can be a clue for finding hosts with broken NTP.
- Agent drops rejected documents by default ([Ingest 02](../../ingest/02-where-to-parse/#실패한-문서는-어디로-가나)). With failure store enabled, they are kept. A newly created `logs-*-*` data stream from the built-in template had failure store enabled, but `metrics-*-*` did not (measured, `failure_store.enabled` in `GET _data_stream/<name>`). To track rejected metrics too, enable it separately.

### Late data: automatic past backing index creation (9.5)

From 9.5, with the cluster setting `data_stream.past_tsdb_index_creation_enabled` turned on, a past document outside the range creates a new backing index that covers its time (same Time-bound TSDS page). How far back is accepted is bounded by whichever comes first: the first lifecycle action that makes backing indices read-only (downsample, searchable snapshot and so on) or the data stream's retention period. The period one past backing index covers is set by `data_streams.past_tsdb_index_interval`.

| Setting | Document from 5 hours ago | Document from 30 days ago |
| --- | --- | --- |
| Off (default) | 400 | 400 |
| On | 201. A past backing index covering one day is created | 201. Another one-day past backing index is created |

- In the lab, the past backing indices covered one day and had `index.lifecycle.indexing_complete: true`. The data stream had no retention set, so it accepted the 30-day-old document too.
- A past backing index is newly created, but `index.lifecycle.origination_date` is set to its `end_time`, so retention and ILM phases are calculated from the data's time (same page).
- Scattered past documents create equally many small backing indices. If the backfill covers a long period, check whether the shard count grows ([04](../04-shards-and-bulk/)).

## Storage size

100 minutes of metrics from 200 hosts reporting every 10 seconds (120,000 documents, each with 2 dimensions, 1 gauge and 1 counter) were stored with three index modes and measured after a force merge.

| Index mode | basic: size | basic: per doc | trial: size | trial: per doc |
| --- | --- | --- | --- | --- |
| standard | 7.2MB | 60.2B | 7.2MB | 59.6B |
| logsdb | 4.9MB | 41.2B | 3.1MB | 25.8B |
| time_series | 4.2MB | 35.2B | 2.0MB | 16.7B |

- With trial (Enterprise features included), time_series was about 28% of standard. With basic it was 58%. The difference comes from synthetic `_source`. As with logs, synthetic `_source` silently becomes stored `_source` without a license ([03](../03-storage-footprint/#without-a-license-synthetic-_source-silently-becomes-stored)).
- Indexing time was similar for all three, 4 to 7 seconds for 120,000 documents.
- The synthetic data has small, simple documents, so ratios for real integration metrics may differ. Use the ratios only as a reference.

## Downsampling

Downsampling stores older time series at a longer interval ([Downsampling concepts](https://www.elastic.co/docs/manage-data/data-store/data-streams/downsampling-concepts)). One hour of 10-second data (200 hosts, 72,000 documents) was downsampled to 5-minute intervals.

| | Original | 5-minute downsample |
| --- | --- | --- |
| Documents | 72,000 | 2,600 |
| Size (after force merge) | 967KB | 171KB |
| Time taken | | 1.4s |

A downsampled document looks like this:

- A gauge (`cpu.pct`) becomes an `aggregate_metric_double` with four values: `min`, `max`, `sum` and `value_count`. The average is `sum / value_count`.
- A counter (`net.bytes`) keeps only the last value of the interval.
- Dimensions stay as they are, and the number of original documents grouped is kept as `_doc_count` (20).

Things to watch in operation:

- Downsampling only works on backing indices that are no longer written to (read-only). Actions such as downsample, force merge and searchable snapshot in ILM or data stream lifecycle start only after the backing index's `end_time` has passed (Time-bound TSDS page).
- After downsampling, values at the original interval are gone. Keep the period you need for detecting short spikes or for capacity analysis in the phase before downsampling.
- The document count dropped to about 1/28, but size only to about 1/6, because each gauge becomes four values.

## Decision guide

| Situation | Recommendation |
| --- | --- |
| Designing metrics yourself | Use a TSDS. Define dimensions completely, using "if this value differs, is it a different series?" |
| Some measurements at the same time go missing | Check Agent's `duplicates` count for 409s caused by a missing dimension |
| Collectors can stop for hours | On 9.5 and later, consider `data_stream.past_tsdb_index_creation_enabled`. On earlier versions, expect to lose part of the backlog |
| Rejected metrics need tracking | Enable failure store on metrics data streams too |
| Deduplicating metrics | Rely on the TSDS automatic 409 instead of fingerprints |
| Long-term retention | Downsample. Keep the period that needs short intervals in the phase before downsampling |
| Estimating storage | Check the license first. Size differs by close to a factor of two depending on synthetic `_source` |

## References

- [Time series data streams](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-series-data-stream-tsds)
- [Time-bound TSDS](https://www.elastic.co/docs/manage-data/data-store/data-streams/time-bound-tsds)
- [Time series index settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/time-series)
- [Downsampling concepts](https://www.elastic.co/docs/manage-data/data-store/data-streams/downsampling-concepts)
- [Failure store](https://www.elastic.co/docs/manage-data/data-store/data-streams/failure-store)
