---
"@coredrill/documents": patch
---

Patch the ProseMirror paste-handling dependency and update affected transitive
build dependencies. Keep Mammoth's accepted importer and CLI while replacing
its old CLI parser dependency with the compatible v1 API in argparse 2.0.1,
removing the unpatched sprintf-js dependency. No audit exclusions are added.
