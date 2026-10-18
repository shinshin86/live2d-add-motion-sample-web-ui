"""Map opted-in normalized motion templates to a model's safe parameter ranges."""
import glob
import importlib.util
import json
import math
import os
import re


def finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def merge_selection(selection, declaration, location):
    """Local declarations override individual options, or disable an entry with False."""
    if not isinstance(declaration, dict):
        raise ValueError(f"{location}: SHARED_MOTIONS must be a dictionary")
    for pack, entries in declaration.items():
        if not isinstance(pack, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", pack) or not isinstance(entries, dict):
            raise ValueError(f"{location}: invalid shared pack {pack!r}")
        selected = selection.setdefault(pack, {})
        for name, options in entries.items():
            if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", name):
                raise ValueError(f"{location}: invalid shared motion name {name!r}")
            if options is False:
                selected[name] = False
            elif isinstance(options, dict) and not set(options) - {"name", "label", "scale", "parameters"}:
                selected[name] = {**(selected.get(name) or {}), **options}
            else:
                raise ValueError(f"{location}: {pack}:{name} needs an options dictionary or False")


def conventional_reference(pid):
    """Fallback only for familiar standard IDs; custom parameters need observed ranges."""
    if re.fullmatch(r"ParamAngle[XYZ]", pid):
        return 0, (-30, 30)
    if re.fullmatch(r"ParamBodyAngle[XYZ]", pid):
        return 0, (-10, 10)
    if pid in ("ParamEyeLOpen", "ParamEyeROpen"):
        return 1, (0, 1)
    if pid in ("ParamEyeLSmile", "ParamEyeRSmile", "ParamMouthOpenY", "ParamCheek", "ParamBreath"):
        return 0, (0, 1)
    if pid in ("ParamEyeBallX", "ParamEyeBallY", "ParamMouthForm") or re.fullmatch(r"ParamBrow[LR](?:X|Y|Angle|Form)", pid):
        return 0, (-1, 1)
    return None


def template_curve(pid, keys, loop=False, smooth=False):
    return {"id": pid, "keys": list(keys), "loop": loop, "smooth": smooth}


def template_motion(duration, curves, loop=False):
    return {"duration": duration, "curves": curves, "loop": loop}


def owned_files(runtime):
    ledger = os.path.join(runtime, ".generated-shared-motions.json")
    return json.load(open(ledger)) if os.path.exists(ledger) else []


def shared_ownership(runtime, model3, names):
    """Remember generated files even after opting out, never overwrite shipped data."""
    owned = owned_files(runtime)
    files = [f"motion/{name}.motion3.json" for name in names]
    shipped = {os.path.normpath(entry["File"]) for group, entries in
               model3.get("FileReferences", {}).get("Motions", {}).items() if group != "Action" for entry in entries}
    for file in files:
        if os.path.normpath(file) in shipped or (os.path.exists(os.path.join(runtime, file)) and file not in owned):
            raise ValueError(f"shared motion conflicts with an unmanaged file: {file}")
    return os.path.join(runtime, ".generated-shared-motions.json"), sorted(set(owned) | set(files))


def load_shared_motions(selection, folder, runtime, model3, available, base, ranges, curve, motion):
    """Return additional motions/manifest; no writes, including on name conflicts."""
    motions, manifest = {}, []
    if not any(options is not False for entries in selection.values() for options in entries.values()):
        return motions, manifest
    refs = model3.get("FileReferences", {})
    physics_files = [os.path.join(runtime, refs["Physics"])] if refs.get("Physics") else glob.glob(os.path.join(runtime, "*.physics3.json"))
    outputs = {entry["Destination"]["Id"] for path in physics_files
               for setting in json.load(open(path)).get("PhysicsSettings", []) for entry in setting.get("Output", [])}
    known = available if available is not None else set(ranges)
    for pack, entries in selection.items():
        enabled = {name: options for name, options in entries.items() if options is not False}
        if not enabled:
            continue
        path = os.path.join(folder, pack + ".py")
        if not os.path.isfile(path):
            raise ValueError(f"shared pack not found: {pack}")
        spec = importlib.util.spec_from_file_location(f"shared_motion_{pack}", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        templates, descriptions = module.define(template_curve, template_motion)
        if len(descriptions) != len(templates) or {entry[0] for entry in descriptions} != set(templates):
            raise ValueError(f"shared {pack}: MANIFEST and MOTIONS keys must match uniquely")
        descriptions = {entry[0]: entry[1:] for entry in descriptions}
        for name, options in enabled.items():
            context = f"shared {pack}:{name}"
            if name not in templates:
                raise ValueError(f"{context}: motion not found")
            template = templates[name]
            output_name = options.get("name", f"shared_{pack}_{name}")
            label, fade_in, fade_out = descriptions[name]
            label = options.get("label", label)
            scale = options.get("scale", 1)
            mapping = options.get("parameters", {})
            if not isinstance(output_name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", output_name):
                raise ValueError(f"{context}: output name must use letters, digits, _ or -")
            if output_name in motions:
                raise ValueError(f"{context}: shared motion name collision: {output_name}")
            if not isinstance(label, str) or not label.strip() or not all(finite(v) and v >= 0 for v in (fade_in, fade_out)):
                raise ValueError(f"{context}: invalid label or fade times")
            if not finite(scale) or not -1 <= scale <= 1:
                raise ValueError(f"{context}: scale must be a finite number in [-1,1]")
            source_ids = {entry["id"] for entry in template["curves"]}
            if not isinstance(mapping, dict) or set(mapping) - source_ids or any(v is not None and not isinstance(v, str) for v in mapping.values()):
                raise ValueError(f"{context}: parameters must map source IDs to target IDs or None")
            duration, loop = template["duration"], template["loop"]
            if not finite(duration) or duration <= 0 or not isinstance(loop, bool):
                raise ValueError(f"{context}: invalid duration or loop flag")
            curves, used = [], set()
            for entry in template["curves"]:
                source, keys = entry["id"], entry["keys"]
                if len(keys) < 2 or any(not finite(t) or not finite(v) or not -1 <= v <= 1 for t, v in keys):
                    raise ValueError(f"{context}:{source}: use finite times and normalized values in [-1,1]")
                if keys[0][0] != 0 or keys[-1][0] != duration or any(a[0] >= b[0] for a, b in zip(keys, keys[1:])):
                    raise ValueError(f"{context}:{source}: keys must increase from 0 to duration")
                if entry["loop"] != loop or (not loop and (keys[0][1] != 0 or keys[-1][1] != 0)):
                    raise ValueError(f"{context}:{source}: match the motion loop flag; one-shots start/end at normalized 0")
                pid = mapping.get(source, source)
                reference = (base[pid], ranges[pid]) if pid in ranges else conventional_reference(pid or "")
                reason = "disabled by mapping" if pid is None else "not present" if pid not in known else "physics output" if pid in outputs else "no safe range" if reference is None else None
                if reason:
                    print(f"{context}: skip {source} -> {pid or '(none)'} ({reason})")
                    continue
                if pid in used:
                    raise ValueError(f"{context}: multiple source parameters map to {pid}")
                rest, (lo, hi) = reference
                values = [(t, rest + (v * scale) * (hi - rest if v * scale >= 0 else rest - lo)) for t, v in keys]
                curves.append(curve(pid, values, loop=loop, smooth=entry["smooth"]))
                used.add(pid)
            if not curves:
                raise ValueError(f"{context}: no usable parameters for this model")
            motions[output_name] = motion(duration, curves, loop=loop)
            manifest.append((output_name, label, fade_in, fade_out))
            print(f"{context} -> {output_name} ({len(curves)} parameters)")
    return motions, manifest
