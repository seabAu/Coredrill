---
"@coredrill/web": patch
---

Finish restore progress messages when archive reading fails or a commit cannot enter the shared mutation guard. Distinguish stopped-before-submit from an unconfirmed commit, preserve the reviewed preview when appropriate, and never imply an automatic retry or a still-running operation after it has ended.
