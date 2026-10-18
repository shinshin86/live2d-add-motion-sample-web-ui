"""Adapt opted-in shared expressions without writing or owning model assets."""
import glob
import json
import os
import re

from shared_motions import conventional_reference, finite, load_pack


def load_shared_expressions(selection, folder, runtime, model3, available, base, ranges):
    """Map normalized Overwrite/Add and plain Multiply factors to safe exp3 values.

    Scale multiplies normalized values; for Multiply it scales the difference
    from factor 1. Clamp each blend's result at the base pose, reporting changes.
    Ownership and collisions are handled with ordinary model expressions.
    """
    expressions = {}
    if not any(options is not False for entries in selection.values() for options in entries.values()):
        return expressions
    refs = model3.get("FileReferences", {})
    physics_files = [os.path.join(runtime, refs["Physics"])] if refs.get("Physics") else glob.glob(os.path.join(runtime, "*.physics3.json"))
    outputs = {entry["Destination"]["Id"] for path in physics_files
               for setting in json.load(open(path)).get("PhysicsSettings", []) for entry in setting.get("Output", [])}
    known = available if available is not None else set(ranges)
    for pack, entries in selection.items():
        enabled = {name: options for name, options in entries.items() if options is not False}
        if not enabled:
            continue
        _, _, templates = load_pack(folder, pack)
        if not isinstance(templates, dict):
            raise ValueError(f"shared {pack}: EXPRESSIONS must be a dictionary")
        for name, options in enabled.items():
            context = f"shared expression {pack}:{name}"
            if name not in templates:
                raise ValueError(f"{context}: expression not found")
            template = templates[name]
            if not isinstance(template, dict):
                raise ValueError(f"{context}: expression must be a dictionary")
            output_name = options.get("name", f"shared_{pack}_{name}")
            if not isinstance(output_name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", output_name):
                raise ValueError(f"{context}: output name must use letters, digits, _ or -")
            if output_name in expressions:
                raise ValueError(f"{context}: shared expression name collision: {output_name}")
            label = options.get("label", template.get("label", name))
            if not isinstance(label, str) or not label.strip():
                raise ValueError(f"{context}: label must be nonempty")
            scale = options.get("scale", 1)
            if not finite(scale) or not -1 <= scale <= 1:
                raise ValueError(f"{context}: scale must be a finite number in [-1,1]")
            parameters = template.get("parameters")
            if not isinstance(parameters, (list, tuple)):
                raise ValueError(f"{context}: parameters must be a list of (ID, value, blend)")
            source_ids = set()
            for entry in parameters:
                if not isinstance(entry, (list, tuple)) or len(entry) != 3:
                    raise ValueError(f"{context}: parameters must contain (ID, value, blend)")
                source, value, blend = entry
                if not isinstance(source, str) or not source or source in source_ids:
                    raise ValueError(f"{context}: invalid or duplicate source parameter {source!r}")
                if blend not in ("Add", "Multiply", "Overwrite") or not finite(value):
                    raise ValueError(f"{context}:{source}: use a valid blend and finite value")
                if blend != "Multiply" and not -1 <= value <= 1:
                    raise ValueError(f"{context}:{source}: Add/Overwrite values must be in [-1,1]")
                source_ids.add(source)
            mapping = options.get("parameters", {})
            if not isinstance(mapping, dict) or set(mapping) - source_ids or any(v is not None and not isinstance(v, str) for v in mapping.values()):
                raise ValueError(f"{context}: parameters must map source IDs to target IDs or None")
            converted, used = [], set()
            for source, value, blend in parameters:
                pid = mapping.get(source, source)
                reference = (base[pid], ranges[pid]) if pid in ranges else conventional_reference(pid or "")
                reason = "disabled by mapping" if pid is None else "not present" if pid not in known else "physics output" if pid in outputs else "no safe range" if reference is None else None
                if reason:
                    print(f"{context}: skip {source} -> {pid or '(none)'} ({reason})")
                    continue
                if pid in used:
                    raise ValueError(f"{context}: multiple source parameters map to {pid}")
                rest, (lo, hi) = reference
                if blend == "Multiply":
                    factor = 1 + (value - 1) * scale
                    result = rest * factor
                else:
                    normalized = value * scale
                    result = rest + normalized * (hi - rest if normalized >= 0 else rest - lo)
                if not finite(result):
                    raise ValueError(f"{context}:{pid}: scaled result must be finite")
                clamped = max(lo, min(hi, result))
                if clamped != result:
                    print(f"{context}:{pid}: clamp base result {result:g} to {clamped:g} in [{lo:g},{hi:g}]")
                if blend == "Overwrite":
                    mapped = clamped
                elif blend == "Add":
                    mapped = clamped - rest
                else:
                    mapped = clamped / rest if rest else factor
                converted.append((pid, mapped, blend))
                used.add(pid)
            if not converted:
                raise ValueError(f"{context}: no usable parameters for this model")
            expressions[output_name] = {**template, "label": f"共通: {label}", "parameters": converted}
            print(f"{context} -> {output_name} ({len(converted)} parameters)")
    return expressions
