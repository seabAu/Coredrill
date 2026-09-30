---
"@coredrill/application": patch
"@coredrill/documents": patch
"@coredrill/ui": patch
"@coredrill/web": patch
---

Harden local document handling with bounded DOCX archive preflight, isolated
DOCX conversion, structural IR preflight, and file-size rejection before
browser reads. Refresh reviewed transitive build-tool security pins without
changing runtime dependencies.
