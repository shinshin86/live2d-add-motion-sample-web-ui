"""Non-destructive edits for version 1 camera recordings (standard library only)."""
import math


def normalize_edit(rec, edit):
    """Trim bounds are absolute seconds in the original source, end inclusive."""
    if not isinstance(edit, dict) or set(edit) - {"trimStart", "trimEnd", "speed", "smooth", "loop"}:
        raise ValueError("編集設定の項目が正しくありません")
    duration = (len(next(iter(rec["params"].values()))["values"]) - 1) / rec["fps"]
    values = {"trimStart": 0, "trimEnd": duration, "speed": 1, "smooth": 0, **edit}
    for key in ("trimStart", "trimEnd", "speed", "smooth"):
        value = values[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{key} は有限の数値で指定してください")
    if not 0 <= values["trimStart"] < values["trimEnd"] <= duration + 1e-6:
        raise ValueError("開始・終了は元の録画の範囲内で、開始 < 終了にしてください")
    values["trimEnd"] = min(duration, values["trimEnd"])
    if not 0.25 <= values["speed"] <= 4 or not 0 <= values["smooth"] <= 1:
        raise ValueError("速度は0.25〜4倍、なめらかさは0〜1で指定してください")
    if (values["trimEnd"] - values["trimStart"]) / values["speed"] < 1 / rec["fps"] - 1e-6:
        raise ValueError("編集後の長さは1フレーム以上にしてください")
    if "loop" in values and not isinstance(values["loop"], bool):
        raise ValueError("ループ設定は真偽値で指定してください")
    return values


def resample(values, positions):
    out = []
    for position in positions:
        position = max(0, min(len(values) - 1, position))
        left = int(position)
        right = min(left + 1, len(values) - 1)
        out.append(values[left] + (values[right] - values[left]) * (position - left))
    return out


def apply_edit(rec):
    """Return edited samples; never change raw params or other source metadata.

    No edit means the exact legacy path. Trim, symmetric 11-frame moving average
    blended by smooth, then speed/resampling; motion easing/seams follow later.
    """
    if "edit" not in rec:
        return rec
    edit = normalize_edit(rec, rec["edit"])
    fps = rec["fps"]
    start, end = edit["trimStart"], edit["trimEnd"]
    source_duration = (len(next(iter(rec["params"].values()))["values"]) - 1) / fps
    if start == 0 and end == source_duration and edit["speed"] == 1 and edit["smooth"] == 0:
        return {**rec, "loop": edit.get("loop", rec["loop"])}
    trim_frames = max(2, round((end - start) * fps) + 1)
    frames = max(2, round((end - start) / edit["speed"] * fps) + 1)
    positions = [(start + (end - start) * i / (trim_frames - 1)) * fps for i in range(trim_frames)]
    output_positions = [i * (trim_frames - 1) / (frames - 1) for i in range(frames)]
    params = {}
    for pid, entry in rec["params"].items():
        values = resample(entry["values"], positions)
        if edit["smooth"]:
            prefix = [0.0]
            for value in values:
                prefix.append(prefix[-1] + value)
            smoothed = []
            for i, value in enumerate(values):
                a, b = max(0, i - 5), min(len(values), i + 6)
                average = (prefix[b] - prefix[a]) / (b - a)
                smoothed.append(value + (average - value) * edit["smooth"])
            values = smoothed
        params[pid] = {**entry, "values": resample(values, output_positions)}
    return {**rec, "params": params, "loop": edit.get("loop", rec["loop"]), "duration": (frames - 1) / fps}
