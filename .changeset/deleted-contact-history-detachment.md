---
"@coredrill/storage-core": patch
"@coredrill/web": patch
---

Advance the shared schema through paired166/167 migrations so deliberate contact deletion can detach its existing interaction foreign-key links without rewriting recorded history. Ordinary history editing and contact relinking remain forbidden. Preserve schema165 human-readable export compatibility and the unchanged58-dataset mapping; intermediate166 is not an export/restore milestone. This storage correction alone adds no normal deletion or field-use qualification controls.
