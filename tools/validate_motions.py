#!/usr/bin/env python3
"""Independent validator for the generated motions (implemented separately
from the generator so it can cross-check it).

Checks:
 1. Meta.CurveCount / TotalSegmentCount / TotalPointCount match the actual data
 2. keyframe times are monotonically increasing, start at t=0, end at Duration
 3. bezier control-point times stay inside their segment
 4. every value stays within the range observed in the pre-existing motions
    (also flags parameters the existing motions never use)
 5. one-shot motions: first and last frames equal the base pose (actions
    start from and return to the base pose)
    loop motions (Meta.Loop=true): every curve ends on its first value and
    with the slope it starts with, so the seam neither jumps nor jerks
 6. motions are registered in model3.json and the referenced files exist
 7. the sampled bezier stays inside the observed range (non-flat loop
    tangents could bulge past the keys)
 8. warning only: loop Actions animating a LipSync-group parameter
    (the player's lip sync fights over it while speaking)

For models that ship without any motions, checks 4 and 5 are skipped with a
warning. Visual verification in the browser is then the only quality gate,
so perform it extra carefully.

Usage: python3 tools/validate_motions.py [runtime dir]
(without an argument, the model registered in model.config.json is used)
Exit code: 0 = pass / 1 = violations found
"""
import collections
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GROUP = "Action"
EPS = 1e-6
SLOPE_TOL = 0.05  # seam slope mismatch allowed after rounding (units/s) ...
SLOPE_REL_TOL = 0.01  # ... plus this fraction of the slope


def resolve_runtime():
    if len(sys.argv) > 1:
        return sys.argv[1]
    cfg_path = os.path.join(ROOT, "model.config.json")
    if not os.path.exists(cfg_path):
        sys.exit("ERROR: model.config.json not found. Run python3 tools/setup_model.py first.")
    cfg = json.load(open(cfg_path))
    return os.path.join(ROOT, os.path.dirname(cfg["model3"]))


RUNTIME = resolve_runtime()


def points(curve):
    """Return (time, value) keyframes plus (segment count, point count,
    control-point violations)."""
    seg = curve["Segments"]
    pts = [(seg[0], seg[1])]
    nseg, npt, ctrl_errors = 0, 1, []
    i = 2
    prev_t = seg[0]
    while i < len(seg):
        nseg += 1
        if seg[i] == 1:  # bezier
            c1t, _, c2t, _, t, v = seg[i + 1:i + 7]
            if not (prev_t - EPS <= c1t <= c2t <= t + EPS):
                ctrl_errors.append(t)
            npt += 3
            pts.append((t, v))
            prev_t = t
            i += 7
        else:
            t, v = seg[i + 1], seg[i + 2]
            npt += 1
            pts.append((t, v))
            prev_t = t
            i += 3
    return pts, nseg, npt, ctrl_errors


def seam_slopes(curve):
    """Slope leaving the first key and slope arriving at the last key."""
    seg = curve["Segments"]
    t0, v0 = seg[0], seg[1]
    # bezier: toward the first control point / linear: along the segment;
    # both sit at seg[3:5]. stepped segments have no slope
    start = (seg[4] - v0) / (seg[3] - t0) if seg[2] in (0, 1) else 0.0
    i, prev_t, prev_v = 2, t0, v0
    end = 0.0
    while i < len(seg):
        if seg[i] == 1:
            c2t, c2v, t, v = seg[i + 3:i + 7]
            end = (v - c2v) / (t - c2t)
            i += 7
        else:
            t, v = seg[i + 1], seg[i + 2]
            end = (v - prev_v) / (t - prev_t) if seg[i] == 0 else 0.0
            i += 3
        prev_t, prev_v = t, v
    return start, end


def sampled_values(curve, steps=8):
    """Values along each bezier segment (the keys alone can hide a bulge)."""
    seg = curve["Segments"]
    out = [seg[1]]
    i, v0 = 2, seg[1]
    while i < len(seg):
        if seg[i] == 1:
            _, c1v, _, c2v, _, v1 = seg[i + 1:i + 7]
            for k in range(1, steps + 1):
                u = k / steps
                out.append((1 - u) ** 3 * v0 + 3 * (1 - u) ** 2 * u * c1v
                           + 3 * (1 - u) * u ** 2 * c2v + u ** 3 * v1)
            i += 7
        else:
            v1 = seg[i + 2]
            out.append(v1)
            i += 3
        v0 = v1
    return out


def main():
    model3_path = glob.glob(os.path.join(RUNTIME, "*.model3.json"))[0]
    model3 = json.load(open(model3_path))
    entries = model3["FileReferences"]["Motions"].get(GROUP, [])
    if not entries:
        print(f"NG: model3.json has no {GROUP} group")
        return 1
    lipsync_ids = {pid for g in model3.get("Groups", []) if g.get("Name") == "LipSync"
                   for pid in g.get("Ids", [])}

    new_files = [os.path.join(RUNTIME, e["File"]) for e in entries]
    # Motion folder names vary between models (motion/, motions/, ...),
    # so search recursively instead of assuming a directory name
    all_files = set(os.path.normpath(f) for f in
                    glob.glob(os.path.join(RUNTIME, "**", "*.motion3.json"), recursive=True))
    existing = sorted(all_files - set(os.path.normpath(f) for f in new_files))

    # Observe safe value ranges and the base pose (majority first-frame value)
    # from the pre-existing motions
    safe = {}
    first_vals = collections.defaultdict(collections.Counter)
    for f in existing:
        for c in json.load(open(f))["Curves"]:
            if c["Target"] != "Parameter":
                continue
            pts, *_ = points(c)
            vals = [v for _, v in pts]
            lo, hi = safe.get(c["Id"], (float("inf"), float("-inf")))
            safe[c["Id"]] = (min(lo, min(vals)), max(hi, max(vals)))
            first_vals[c["Id"]][round(pts[0][1], 3)] += 1
    base_pose = {pid: cnt.most_common(1)[0][0] for pid, cnt in first_vals.items()}

    has_reference = bool(existing)
    if not has_reference:
        print("WARN: this model has no pre-existing motions; skipping the range and base-pose checks.")
        print("WARN: be sure to verify visually in the browser.")

    errors = []
    warnings = []
    for f in new_files:
        name = os.path.basename(f)
        if not os.path.exists(f):
            errors.append(f"{name}: referenced by model3.json but the file does not exist")
            continue
        d = json.load(open(f))
        meta = d["Meta"]
        loop = bool(meta.get("Loop"))
        nseg_total = npt_total = 0
        for c in d["Curves"]:
            pid = c["Id"]
            pts, nseg, npt, ctrl_errors = points(c)
            nseg_total += nseg
            npt_total += npt
            for t in ctrl_errors:
                errors.append(f"{name}:{pid}: bezier control point outside its segment (t={t})")
            times = [t for t, _ in pts]
            if times != sorted(times):
                errors.append(f"{name}:{pid}: keyframe times are not monotonically increasing")
            if abs(times[0]) > EPS:
                errors.append(f"{name}:{pid}: does not start at t=0")
            if abs(times[-1] - meta["Duration"]) > EPS:
                errors.append(f"{name}:{pid}: last key ({times[-1]}) != Duration ({meta['Duration']})")
            if loop and c["Target"] == "Parameter":
                if abs(pts[-1][1] - pts[0][1]) > EPS:
                    errors.append(f"{name}:{pid}: loop seam jumps: last value {pts[-1][1]} != first value {pts[0][1]}")
                s_start, s_end = seam_slopes(c)
                if abs(s_start - s_end) > SLOPE_TOL + SLOPE_REL_TOL * max(abs(s_start), abs(s_end)):
                    errors.append(f"{name}:{pid}: loop seam jerks: end slope {s_end:.3f}/s != start slope {s_start:.3f}/s")
                if pid in lipsync_ids:
                    warnings.append(f"{name}:{pid}: loop Action animates a LipSync parameter; it will fight the player's lip sync while speaking")
            if c["Target"] != "Parameter" or not has_reference:
                continue
            if pid not in safe:
                errors.append(f"{name}:{pid}: parameter never used by the existing motions (check its range; keep only if deliberate)")
            else:
                lo, hi = safe[pid]
                for t, v in pts:
                    if not (lo - EPS <= v <= hi + EPS):
                        errors.append(f"{name}:{pid}: value {v} (t={t}) outside the observed range [{lo},{hi}]")
                bulge = [v for v in sampled_values(c) if not (lo - 1e-3 <= v <= hi + 1e-3)]
                if bulge:
                    errors.append(f"{name}:{pid}: the curve between keys reaches {max(bulge, key=abs):.3f}, outside the observed range [{lo},{hi}]")
            if loop:
                continue  # a loop may idle anywhere; its seam is checked above
            base = base_pose.get(pid, 0)
            if abs(pts[0][1] - base) > EPS:
                errors.append(f"{name}:{pid}: first value {pts[0][1]} != base pose {base}")
            if abs(pts[-1][1] - base) > EPS:
                errors.append(f"{name}:{pid}: last value {pts[-1][1]} != base pose {base}")
        for key, actual in [("CurveCount", len(d["Curves"])),
                            ("TotalSegmentCount", nseg_total),
                            ("TotalPointCount", npt_total)]:
            if meta[key] != actual:
                errors.append(f"{name}: Meta.{key}={meta[key]} but the actual data has {actual}")
        print(f"checked {name}: curves={len(d['Curves'])} segs={nseg_total} pts={npt_total}"
              + (" loop" if loop else ""))

    print("---")
    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        print("\n".join(errors))
        print(f"NG: {len(errors)} violations")
        return 1
    print(f"OK: all checks passed for {len(new_files)} motions in the {GROUP} group")
    return 0


if __name__ == "__main__":
    sys.exit(main())
