---
title: "How to manage field count and mappings"
description: What field count costs in heap and on the master, how standard, logsdb and failure store behave when the field limit is exceeded, how to handle field names that contain values, and mapping conflicts from template layering and integration upgrades, based on the official documentation and measurements on Elasticsearch 9.5.5.
translatedFrom: da98e87b83a16d1b31d76aafb958a5a81e48ef0b
sidebar:
  label: 06. Mappings and field count
  order: 6
---

When a "field limit exceeded" error shows up, the first fix people reach for is raising `index.mapping.total_fields.limit`.
Indexing works again for now, but fields cannot be removed from an index once it exists. After raising the limit a few times you have hundreds of indices with tens of thousands of fields each, and from that point heap and the master can no longer keep up.
When you look at why fields keep growing, the cause is usually in the data. The most common one is an ID or UUID inside the field name.

This article covers what one field costs, what happens when the limit is exceeded, and how to keep field count under control from the start.

:::note[Baseline]
- Elasticsearch 9.5.5. The official documentation was rechecked in November 2026.
- Measurements ran on a local single-node Elasticsearch 9.5.5 (1 vCPU, 1GB JVM heap) with a basic license. Experiment code and results are in [`labs/data/mappings-and-fields/`](https://github.com/Munsik/engineering-notes/tree/main/labs/data/mappings-and-fields).
:::

## Where fields start to cost

`index.mapping.total_fields.limit` (default 1,000) does not count only leaf fields. Object mappings, multi-fields, field aliases and mapped runtime fields all count ([Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)). A single `host.os.name` brings `host` and `os` object mappers with it.

| Cost | What happens | Source |
| --- | --- | --- |
| Cluster state | Every node holds the mappings as part of the cluster state | [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards) |
| Data node heap | Nodes that hold data use extra heap for every mapped field of each index. See `indices.mappings.total_estimated_overhead` in `_nodes/stats` | Same page |
| Segments | Each segment keeps a copy of the mapped field names. Grows with more segments and more fields | Same page |
| Master | Every new field sends a mapping update through the master to all nodes. In an explosion, `put-mapping` tasks back up | [Mapping explosion](https://www.elastic.co/docs/troubleshoot/elasticsearch/mapping-explosion) |
| Kibana | Data views read the field list. With many fields, Discover gets slow or rule payloads exceed limits | Same page |

Fields cannot be removed from an existing index (same page). To reduce them, reindex with a new mapping, or apply a new template from the next rollover and wait for the old indices to age out of retention.

### Measured: heap estimate by field count

Documents with n numeric fields were indexed into one index, and the increase in the node's `total_estimated_overhead` was recorded.

| Fields | Mapping JSON size | Heap estimate increase | First document (with mapping update) | Same document again |
| --- | --- | --- | --- | --- |
| 100 | 2.9KB | 117KB | 50ms | 23ms |
| 1,000 | 27KB | 0.99MB | 130ms | 51ms |
| 5,000 | 137KB | 4.9MB | 363ms | 171ms |
| 20,000 | 547KB | 19.5MB | 1,202ms | 640ms |
| 50,000 | 1.3MB | 48.8MB | 2,764ms | 1,932ms |

- The heap estimate grew by 1,024 bytes per field (mapper). This applies **per index**. With 300 backing indices of 50,000 fields each on a data node, the estimate alone is about 14GB (calculated).
- The gap between the first and second document is the time spent on the mapping update. With a single node it does not include propagation between nodes. With more nodes it takes longer.

### What raising the limit led to: field cases

In one cluster with the field limit raised to 300,000, indexing nodes repeatedly went down with OutOfMemory. The OOMs coincided with merges, and the analysis pointed to per-segment field information filling the heap. As the measurement above shows, one field costs little, but multiplied by field count, index count and segment count it fills the entire heap.

In another case, Agent 9.4.3 monitoring data produced field names containing UUIDs, and the field count kept climbing. Raising the limit to 3,000 filled up again right away. Raising the limit without fixing the cause just repeats the problem.

## What happens when the limit is exceeded

With the limit at 1,000, one document with 1,200 keys was sent to three targets.

| Target | Response | Result |
| --- | --- | --- |
| standard index | 400 | `Limit of total fields [1000] has been exceeded`. Document rejected |
| logsdb index | 201 | Only 498 keys mapped, 702 recorded in `_ignored`. Unmapped keys are not searchable |
| standard data stream + failure store | 201 | Document went to the failure store (`document_parsing_exception`) |

- logsdb and `logsdb_columnar` default `index.mapping.total_fields.ignore_dynamic_beyond_limit` to `true`. Dynamic fields beyond the limit are not mapped and are left in `_ignored`. Other index modes default to `false` and reject the document ([Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)). The original value stays in `_source`, but you cannot search or aggregate on that key.
- So in logsdb, exceeding the limit shows up not as an error but as **silently missing search results**. Watch the `_ignored` rate per data stream ([Ingest 06](../../ingest/06-flow-dashboard/)).
- Only 498 of the 1,200 keys were mapped because dynamic string mapping creates two fields, `text` and `.keyword`. That is the default for an index created without an index template. In `logs-*-*` data streams using the built-in `logs` template, new string fields were mapped as a single `keyword` (measured). With the same limit, the number of keys that fit differs by a factor of two depending on mapping rules.

## Field names that contain values

A common cause of field explosion is a structure that puts values in field names. Keys like `stats.<request ID>.latency` or `monitoring.dataset.<UUID>.events` keep appearing. 2,000 documents were indexed, each using 3 of 3,000 UUIDs as keys.

| Mapping | Documents indexed | Mapped fields | Search by a key from the first document | Search by a key from the last document |
| --- | --- | --- | --- | --- |
| object (default, standard) | 123 / 2,000 | 997 | Works | Fails (document was rejected) |
| object (logsdb) | 2,000 / 2,000 | 999 | Works | Fails (key went to `_ignored`) |
| `flattened` | 2,000 / 2,000 | 4 | Works | Works |

`flattened` maps a whole object as one field and indexes every value inside as keyword ([Flattened](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/flattened)). It gives some things up in return.

- Every value is a keyword. Numeric range queries compare as strings, and sorting is lexicographic.
- No wildcards in keys, and no highlighting.
- From 9.4, `properties` can map specific keys separately with their own types (same page). Use this for the few keys you query often.

The best fix is to change the structure. Move the value out of the key name, as in `{"dataset_id": "<UUID>", "events": 12}`, into an array or a separate document, and the field count stays fixed. If the source cannot change, do this in an ingest pipeline, or take it in as `flattened`.

## Settings that reduce mapper count

| Method | Effect | Caveat |
| --- | --- | --- |
| Dynamic template that maps strings as a single `keyword` | Two mappers per string key become one | Map fields that need full-text search explicitly as `text` or `match_only_text` |
| `subobjects: false` | No intermediate object mappers. In an ECS-style document, mappers went from 37 to 30 (measured). Searching `host.os.name` still works | Objects cannot be placed under it. Cannot be changed on an existing mapping, so it applies to new indices ([subobjects](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/subobjects)) |
| `dynamic: false` | Fields not in the mapping stay in `_source` only and are not mapped | Read them later with a runtime field or ES\|QL if needed. Search is slow |
| `dynamic: strict` | Documents with fields not in the mapping are rejected | Use with failure store to avoid losing data |

The official documentation also notes that `subobjects: false` reduces mappers substantially for ECS-style mappings ([Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)).

## Template layers and names

Where you put a setting decides whether it survives an integration upgrade.

- Elasticsearch's built-in templates (`logs-*-*`, `metrics-*-*` and others) have priority 100, and templates created by Fleet integrations use up to 200. On a cluster with Fleet, creating your own index template for these patterns can override the integration templates ([Templates](https://www.elastic.co/docs/manage-data/data-store/templates)).
- So put settings and mappings for integration data streams in `@custom` component templates. There are three, by scope ([Data streams](https://www.elastic.co/docs/reference/fleet/data-streams)).

| Name | Scope |
| --- | --- |
| `<type>@custom` (for example `logs@custom`) | All data streams of that type |
| `<package>@custom` (for example `system@custom`, GA in 9.1) | All data streams of that integration |
| `<type>-<dataset>@custom` (for example `logs-system.auth@custom`) | That one data stream |

- Changing a template does not touch existing backing indices. It applies from the next rollover.
- Namespaces are for splitting by environment, team or business unit (up to 100 bytes). Permissions can be granted by namespace pattern (same page). Split namespaces by something numerous, such as customers, and data streams and shards grow by the same factor ([04](../04-shards-and-bulk/#measured-300-per-tenant-data-streams-versus-shared-data-streams)).

## Integration upgrades and type conflicts

Upgrading an integration changes its template, and the new mapping applies from the next backing index. If a field's type changes, backing indices in the same data stream end up with different types for it.

- The data view shows the field as a conflict, and aggregations or sorting on it may fail. In one field case, about 60 fields showed up as `keyword` versus `long` conflicts after an upgrade.
- Values that do not fit the new type go to the failure store. In another case, millions of documents piled up in the failure store right after an upgrade.
- On data streams already near the field limit, the upgrade can fail once the new template's fields are added.

The checks before and after an upgrade are in [Ingest 02](../../ingest/02-where-to-parse/#운영). For fields that already conflict, convert the type when reading with ES|QL, or wait for the old backing indices to age out of retention.

## Decision guide

| Situation | Recommendation |
| --- | --- |
| Field limit exceeded error | Before raising the limit, find which keys are growing. If values are in field names, change the structure or use `flattened` |
| The limit has to go up | Raise it gradually from 1,000. Do not jump to tens of thousands. Calculate data node heap and index count together |
| logsdb data streams | Monitor the `_ignored` rate. Exceeding the limit does not show up as an error |
| Objects with unpredictable keys (labels, tags, external API responses) | `flattened`. Type only frequently used keys with `properties` (9.4 and later) |
| Indices with hand-written mappings | Map strings as a single `keyword` in the dynamic template. For deep ECS-style structures, consider `subobjects: false` |
| Changing mappings of integration data streams | Use `@custom` component templates, not your own index template |
| Integration upgrades | Right after the upgrade, check the failure store, `_ignored` and data view conflicts |

## References

- [Mapping limit settings](https://www.elastic.co/docs/reference/elasticsearch/index-settings/mapping-limit)
- [Mapping explosion](https://www.elastic.co/docs/troubleshoot/elasticsearch/mapping-explosion)
- [Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards)
- [Flattened field type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/flattened)
- [subobjects](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/subobjects)
- [Templates](https://www.elastic.co/docs/manage-data/data-store/templates)
- [Elastic Agent data streams](https://www.elastic.co/docs/reference/fleet/data-streams)
