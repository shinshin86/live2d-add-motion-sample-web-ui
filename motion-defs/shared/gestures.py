"""Portable versions of the bundled nod, head shake and surprised gestures.

Values are relative to the model's base pose: 0 rests, -1 reaches the observed
minimum, +1 the maximum. Select entries with SHARED_MOTIONS in a model file.
"""


def define(curve, motion):
    motions = {}
    duration = 2.2
    motions["nod"] = motion(duration, [
        curve("ParamAngleY", [(0, 0), (0.35, -0.73), (0.7, -0.13), (1, -0.6), (1.5, 0), (duration, 0)]),
        curve("ParamBodyAngleY", [(0, 0), (0.4, -0.3), (1.1, -0.2), (1.6, 0), (duration, 0)]),
        *[curve(f"ParamEye{side}Open", [(0, 0), (0.35, -0.45), (0.7, -0.1), (1, -0.4), (1.5, 0), (duration, 0)]) for side in "LR"],
        *[curve(f"ParamBrow{side}Y", [(0, 0), (0.35, 0.3), (1.5, 0), (duration, 0)]) for side in "LR"],
        curve("ParamMouthForm", [(0, 0), (duration, 0)]),
    ])
    duration = 2.4
    motions["shakehead"] = motion(duration, [
        curve("ParamAngleX", [(0, 0), (0.3, -0.8), (0.7, 0.9), (1.1, -0.53), (1.5, 0.45), (1.9, 0), (duration, 0)]),
        curve("ParamBodyAngleX", [(0, 0), (0.35, -0.4), (0.75, 0.4), (1.15, -0.3), (1.55, 0.2), (2, 0), (duration, 0)]),
        *[curve(f"ParamEye{side}Open", [(0, 0), (0.3, -0.3), (1.5, -0.3), (1.9, 0), (duration, 0)]) for side in "LR"],
        *[curve(f"ParamBrow{side}Form", [(0, 0), (0.3, -0.5), (1.6, -0.5), (2.1, 0), (duration, 0)]) for side in "LR"],
        curve("ParamMouthForm", [(0, 0), (0.3, -0.6), (1.6, -0.6), (2.1, 0), (duration, 0)]),
    ])
    duration = 2.5
    motions["surprised"] = motion(duration, [
        *[curve(f"ParamEye{side}Open", [(0, 0), (0.15, 0.8), (1.4, 0.8), (2, 0), (duration, 0)]) for side in "LR"],
        *[curve(f"ParamBrow{side}Y", [(0, 0), (0.15, 0.9), (1.4, 0.9), (2, 0), (duration, 0)]) for side in "LR"],
        *[curve(f"ParamBrow{side}Form", [(0, 0), (0.15, 0.7), (1.4, 0.7), (2, 0), (duration, 0)]) for side in "LR"],
        curve("ParamMouthForm", [(0, 0), (0.15, -0.83), (1.4, -0.83), (2.1, 0), (duration, 0)]),
        curve("ParamMouthOpenY", [(0, 0), (0.15, 0.9), (1.4, 0.8), (2.1, 0), (duration, 0)]),
        curve("ParamAngleY", [(0, 0), (0.15, 0.6), (0.5, 0.4), (1.4, 0.4), (2.1, 0), (duration, 0)]),
        curve("ParamBodyAngleY", [(0, 0), (0.18, 0.8), (1.4, 0.6), (2.2, 0), (duration, 0)]),
    ])
    return motions, [
        ("nod", "共通: うなずき", 0.4, 0.5),
        ("shakehead", "共通: 首ふり", 0.4, 0.5),
        ("surprised", "共通: びっくり", 0.2, 0.5),
    ]
