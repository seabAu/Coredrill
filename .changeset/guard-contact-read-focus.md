---
"@coredrill/web": patch
---

Preserve focused company/contact read controls across an acknowledged revision
refresh, including engines that blur immediately when a control is disabled.
Keep stale notes/company-linked creation and contact continuation disabled,
capture read focus before its loading transition, and restore only inside the
same live owner after enabled controls commit. Retain foreign contact drafts
privately and prove actual vault-deletion retirement without repeating writes.
