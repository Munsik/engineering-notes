---
title: Data design
description: Guidelines for how much data to keep, where to keep it and in what structure, in order from shard internals to storage footprint, shards and bulk, data tiers, mappings and field count, and metrics (TSDS).
translatedFrom: da98e87b83a16d1b31d76aafb958a5a81e48ef0b
sidebar:
  label: Overview
  order: 0
---

When you are sizing a cluster or under pressure to cut costs, the first questions are usually data design questions.
How much more disk does a longer retention period need, how many shards to use, where to put old data.
Answering them starts with knowing how data builds up inside a shard. Measuring storage, bulk performance and the force merge before a searchable snapshot all run on the same structure.

So this collection starts with shard internals.

:::note[Baseline]
- Elasticsearch 9.x. Each article states its own version and test environment at the top.
- Statements checked against the official documentation link to their source. Judgments and recommendations without a source come from my field experience, and anything not yet verified is marked "(unverified)". Statements checked against source code or by running them name that evidence.
- Measurement code and results are in [`labs/data/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data) in the repository.
:::

## Contents

| # | Topic | Covers |
| --- | --- | --- |
| 01 | [Segment lifecycle](01-segments/) | Shards and Lucene indices, segment files, refresh and search idle, the indexing buffer, translog and flush, deletes and updates, soft deletes and retention leases |
| 02 | [Merge and force merge](02-merge-and-force-merge/) | TieredMergePolicy and LogByteSizeMergePolicy, when merges slow down indexing, when force merge is fine and when it is not, effects on disk and snapshots |
| 03 | [Storage footprint](03-storage-footprint/) | What `best_compression`, synthetic `_source`, logsdb and `logsdb_columnar` shrink and give up, the baseline behind savings figures, behavior that depends on license and template |
| 04 | [Shards and bulk](04-shards-and-bulk/) | Shard size guidelines and limits, how bulk is split per shard, bulk size, multi-tenant design, diagnosing hot spots |
| 05 | [Old data](05-tiers-and-retention/) | Data tiers, fully and partially mounted searchable snapshots, frozen query latency, `_tier` and detection rules, repository rules |
| 06 | [Mappings and field count](06-mappings-and-fields/) | Heap cost per field, how standard, logsdb and failure store behave past the field limit, field names that contain values and `flattened`, `subobjects`, template layers and `@custom`, type conflicts from integration upgrades |
| 07 | [Metrics and TSDS](07-time-series/) | Dimensions and metrics, automatic document IDs and 409s, the writable time range and late data, past backing index creation in 9.5, storage size, downsampling |

## FAQ

| Question | Short answer | Details |
| --- | --- | --- |
| Why is an indexed document not searchable right away? | A new segment becomes visible to search after a refresh. The default is one second, but indices with no search in the last 30 seconds skip the periodic refresh. | [01](01-segments/#refresh-and-search-idle) |
| Why does disk usage grow when I only update documents? | An update marks the old document as deleted and adds a new one. The old document stays until a merge rewrites its segment. | [01](01-segments/#deletes-and-updates) |
| Should refresh be disabled during bulk loads? | The official documentation recommends `-1` during bulk loads. If nobody searches during the load, the default behaves about the same because of search idle. | [01](01-segments/#measured-how-refresh_interval-shapes-segments) |
| Is it OK to run force merge on a schedule? | Only on indices that are no longer written to. On an index still being written to, it creates large segments that normal merges skip, and every snapshot uploads the full size. | [02](02-merge-and-force-merge/#when-not-to) |
| How much extra disk does force merge need? | With `max_num_segments=1`, up to three times the shard size. In measurements it reached 2.5 to 3 times. | [02](02-merge-and-force-merge/#measured-before-and-after-a-force-merge) |
| Do log and catalog indices merge differently? | Indices with `@timestamp` use LogByteSizeMergePolicy, which merges only adjacent segments. Indices without it use TieredMergePolicy. | [02](02-merge-and-force-merge/#there-are-two-merge-policies) |
| How much disk does logsdb save? | It depends on the baseline. Measured: 65% against the `default` codec and 45% against `best_compression`. Less with many hosts. | [03](03-storage-footprint/#size) |
| What happens if I enable logsdb on a basic license? | The index mode becomes logsdb, but `_source` is stored as before. There is no error or warning. | [03](03-storage-footprint/#without-a-license-synthetic-_source-silently-becomes-stored) |
| How many documents per bulk? | Find the size where throughput flattens. In measurements it was around 750KB (1,000 documents). With many shards, bulks are split per shard, so send larger bulks. | [04](04-shards-and-bulk/#measured-bulk-size-x-primary-shard-count) |
| Can I split data streams per customer? | Splitting into 300 made indexing 3.5 times slower and storage 1.7 times larger. Shared data streams with `tenant.id` are the recommended default. | [04](04-shards-and-bulk/#measured-300-per-tenant-data-streams-versus-shared-data-streams) |
| How slow is frozen data? | Only the first query is slow. Once in the cache it was close to a regular index. On object storage the first query is slower. | [05](05-tiers-and-retention/#first-query-and-repeated-queries) |
| Should I raise the limit when I hit the field limit error? | Each field costs about 1KB of heap per index. If the cause is values in field names, a higher limit fills up again. Change the structure or use `flattened`. | [06](06-mappings-and-fields/#field-names-that-contain-values) |
| logsdb never shows field limit errors. Is that fine? | Fields past the limit are not mapped and go to `_ignored`. They cannot be searched, so watch the `_ignored` rate. | [06](06-mappings-and-fields/#what-happens-when-the-limit-is-exceeded) |
| Do metrics need fingerprint deduplication too? | A TSDS rejects user-supplied `_id`. The same series at the same time automatically returns 409. | [07](07-time-series/#duplicates-and-document-ids) |
| What if a collector stops and then sends its backlog of metrics? | By default, documents outside the writable time range are rejected. From 9.5, automatic past backing index creation can be enabled. | [07](07-time-series/#the-time-range-a-tsds-accepts-for-writes) |
| How do I keep detection rules from querying frozen data? | Exclude frozen with a `_tier` condition or `securitySolution:excludedDataTiersForRuleExecution`. | [05](05-tiers-and-retention/#queries-and-rules-that-touch-frozen-data) |

## Reading order

Read 01 and 02 first. The later articles assume them when they explain how storage is measured and how force merge works.
06 and 07 can be read on their own, but the storage comparison in 07 assumes the synthetic `_source` explanation in 03.
03, 04 and 05 use the same synthetic log generator ([`labs/_datagen/`](https://github.com/Munsik/engineering-notes/tree/main/labs/_datagen)) but can be read independently.
