# English translation guide

The Korean pages are the source. English pages under `src/content/docs/en/` translate them one to one: same file name, same sections, same tables, same code. If the two ever disagree, the Korean page wins.

## Workflow

1. Translate from the latest `main`. Put the commit of the Korean source in frontmatter: `translatedFrom: <full commit hash>`.
2. Keep `sidebar.order` the same as the Korean page. Translate `title`, `description` and `sidebar.label` (keep the `01.` prefix).
3. Links between pages stay relative. Anchors change because headings are translated, so fix every `#anchor` to the English heading slug (lowercase, spaces to `-`, punctuation dropped).
4. Images point to the same files in `src/assets/`. Translate the alt text.
5. Run `npm run build`, `npm run check:links` and `npm run check:translations`.
6. When the Korean page changes later, `check:translations` lists the translation as outdated and the English page shows a notice. Update the translation and move `translatedFrom` to the new commit.

Review is by glossary and samples (2026-11-29 decision): the owner reviews `planning/en-glossary.md` and a few sample pages per collection, not every sentence.

## Voice

- Plain, direct English for engineers. Short sentences, one point each.
- Same rules as the Korean style guide: no preview sentences ("In this article we will..."), no filler ("key", "robust", "seamless", "leverage", "crucial", "delve"), no em dashes, no bold scattered through sentences, no question headings.
- First person only for judgment, as in Korean: "This is the order I use." Do not add "(my interpretation)" or similar labels.
- Mark what was not verified with "(unverified)". Measured values keep the wording "measured" and the source of a claim stays next to it ("Elasticsearch 9.5.5 source, `MergePolicyConfig.java`").
- Headings in sentence case. Keep technical terms and product names exactly as in the Korean page (`refresh_interval`, data stream, frozen tier).
- US spelling. Numbers with commas (300,000), units with a space (8 GB is fine as `8GB` when it was written that way in a table copied from output; follow the Korean page).

## Korea-specific context

Translate the meaning, not the local term. Add half a sentence of context when a reader outside Korea would not know the practice. Examples are in the glossary (air-gapped networks, data export review).

## Code and diagrams

- Code blocks stay identical, except human-readable strings that are Korean (job `description`, `detector_description`, comments, Mermaid labels). Translate those.
- Do not change values, field names, IDs or numbers.
- Screenshots stay the same. If a screenshot shows Korean text that matters, say so in the alt text; recapture later.
