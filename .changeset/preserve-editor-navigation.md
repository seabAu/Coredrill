---
"@coredrill/documents": patch
"@coredrill/ui": patch
"@coredrill/web": patch
---

Flush pending document edits before sidebar, search, and browser-history navigation. Keep the editor and restore its route after a failed save, warn before unloading unsaved text, ignore abandoned editor loads, and show the library when navigating to Documents. Share one serialized autosave drain across concurrent flush callers. Constrain editor input/select intrinsic sizing so long version labels remain within narrow layouts across browser font metrics.
