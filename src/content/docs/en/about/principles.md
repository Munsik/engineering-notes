---
title: How this site works
description: Where Engineering Notes articles start, what they contain and how they are written.
translatedFrom: da98e87b83a16d1b31d76aafb958a5a81e48ef0b
sidebar:
  order: 2
---

> Start with the business problem. Document the engineering decisions that turn technology into a working production solution.

Official documentation explains what a product does and how to configure it.
This site starts from a business problem and the result you expect, and covers the design, implementation and verification decisions needed to apply a technology and run it in a real environment.

## The unit is a use case

Articles are not organized by product feature. Each one picks a problem to solve and follows the decisions that come up along the way, in order.
Most articles try to answer these questions:

1. What business problem are we solving, and what result do we expect?
2. Under what conditions does this technology fit, and what are its limits?
3. What has to be decided at design time?
4. How is it implemented and applied in a real environment?
5. How do we verify that we got the expected result?
6. What can go wrong in production, and how do we run it?

Not every article answers all six. Each one picks the questions that fit its scope and goes deep on those.
Collections, which group several articles, work the same way.

The site has three levels: area, collection and article. An area is a technology (currently Elastic Stack). A collection is built around one business problem, not around a feature.

## What goes into one article

- **Design decisions and reasons**: why this setup and these settings, and how they compare with the alternatives
- **How to apply it**: settings, APIs, queries, workflows and lab code you can follow as written
- **How to run it**: what can go wrong in production, and how to verify and respond

These are not types of article. Each article includes as much of each as the topic needs.

## Writing rules

I try not to stop at "it depends on your data". The goal is to show which result came out under which conditions, together with the settings.
The synthetic data generators and settings used in experiments are in the `labs/` folder of the repository, so readers can run them.

The articles are based on my field experience and judgment. Facts confirmed in the official documentation link to their source. Judgments and recommendations without a source are my experience and opinion, and anything I have not been able to confirm is marked "(unverified)".
When something was confirmed from source code or by running it rather than from the documentation, the article says so.
Measured results and example values are kept apart. Numbers I have not reproduced are never presented as measurements.

Every article states its baseline version and the date it was checked at the top, and features that are not GA carry their status, such as tech preview.
Field experience is described at industry level only, without anything that could identify a specific environment.

If you find a mistake, please open a GitHub issue. Corrections stay in the repository history.

The Korean pages are the originals. See the [English translation guide](https://github.com/Munsik/engineering-notes/blob/main/planning/en-style-guide.md) for how translations are kept in sync.
