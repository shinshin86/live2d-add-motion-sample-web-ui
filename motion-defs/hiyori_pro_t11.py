"""Motion definitions for Hiyori (hiyori_pro_t11).

Bundled sample definition — use it as the reference when writing definitions
for a new model. Format: define(curve, motion) returns
(MOTIONS, MANIFEST, EXPRESSIONS); the third item is optional.

Keyframe values stay within the ranges observed in the model's existing
motions (see tools/analyze_model.py) and every curve starts from and
returns to the base pose.
"""


def define(curve, motion):
    MOTIONS = {}

    # ---------------------------------------------------------------- happy
    D = 3.0
    MOTIONS["hiyori_happy"] = motion(D, [
        curve("ParamAngleY", [(0, 0), (0.4, 12), (0.8, -8), (1.2, 10), (1.6, -6), (2.2, 4), (D, 0)]),
        curve("ParamAngleZ", [(0, 0), (0.6, -8), (1.4, 8), (2.2, -3), (D, 0)]),
        curve("ParamBodyAngleY", [(0, 0), (0.4, 6), (0.8, -3), (1.2, 6), (1.6, -2), (2.2, 3), (D, 0)]),
        curve("ParamBodyAngleZ", [(0, 0), (0.7, -5), (1.5, 5), (2.3, -2), (D, 0)]),
        curve("ParamEyeLSmile", [(0, 0), (0.3, 1), (2.4, 1), (D, 0)]),
        curve("ParamEyeRSmile", [(0, 0), (0.3, 1), (2.4, 1), (D, 0)]),
        # On this model the smiling-arc eyes (^^) require EyeOpen=0 combined
        # with Smile=1, the same usage as the bundled motion m08
        curve("ParamEyeLOpen", [(0, 1), (0.3, 0), (2.4, 0), (D, 1)]),
        curve("ParamEyeROpen", [(0, 1), (0.3, 0), (2.4, 0), (D, 1)]),
        curve("ParamBrowLY", [(0, 0), (0.3, 0.6), (2.4, 0.6), (D, 0)]),
        curve("ParamBrowRY", [(0, 0), (0.3, 0.6), (2.4, 0.6), (D, 0)]),
        curve("ParamCheek", [(0, 0), (0.3, 0.8), (2.4, 0.8), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (D, 1)]),
        curve("ParamMouthOpenY", [(0, 0), (0.35, 0.8), (0.9, 0.4), (1.3, 0.7), (2.0, 0.5), (2.6, 0), (D, 0)]),
        curve("ParamShoulder", [(0, 0), (0.4, 0.8), (0.9, 0.2), (1.3, 0.7), (2.0, 0.3), (2.6, 0), (D, 0)]),
        curve("ParamHairAhoge", [(0, 0), (0.5, 6), (1.1, -5), (1.7, 4), (2.3, -2), (D, 0)]),
    ])

    # ---------------------------------------------------------------- wink
    D = 2.0
    MOTIONS["hiyori_wink"] = motion(D, [
        curve("ParamEyeROpen", [(0, 1), (0.3, 0), (1.2, 0), (1.5, 1), (D, 1)]),
        curve("ParamEyeRSmile", [(0, 0), (0.3, 1), (1.2, 1), (1.5, 0), (D, 0)]),
        curve("ParamEyeLOpen", [(0, 1), (D, 1)]),
        curve("ParamBrowRY", [(0, 0), (0.3, -0.3), (1.2, -0.3), (1.6, 0), (D, 0)]),
        curve("ParamAngleX", [(0, 0), (0.35, 6), (1.3, 6), (D, 0)]),
        curve("ParamAngleZ", [(0, 0), (0.35, -12), (1.3, -12), (D, 0)]),
        curve("ParamBodyAngleZ", [(0, 0), (0.4, -4), (1.3, -4), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (D, 1)]),
        curve("ParamMouthOpenY", [(0, 0), (0.35, 0.5), (1.2, 0.3), (1.7, 0), (D, 0)]),
    ])

    # ---------------------------------------------------------------- nod
    D = 2.2
    MOTIONS["hiyori_nod"] = motion(D, [
        curve("ParamAngleY", [(0, 0), (0.35, -22), (0.7, -4), (1.0, -18), (1.5, 0), (D, 0)]),
        curve("ParamBodyAngleY", [(0, 0), (0.4, -3), (1.1, -2), (1.6, 0), (D, 0)]),
        curve("ParamEyeLOpen", [(0, 1), (0.35, 0.55), (0.7, 0.9), (1.0, 0.6), (1.5, 1), (D, 1)]),
        curve("ParamEyeROpen", [(0, 1), (0.35, 0.55), (0.7, 0.9), (1.0, 0.6), (1.5, 1), (D, 1)]),
        curve("ParamBrowLY", [(0, 0), (0.35, 0.3), (1.5, 0), (D, 0)]),
        curve("ParamBrowRY", [(0, 0), (0.35, 0.3), (1.5, 0), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (D, 1)]),
    ])

    # ---------------------------------------------------------------- thinking
    D = 4.0
    MOTIONS["hiyori_thinking"] = motion(D, [
        curve("ParamAngleX", [(0, 0), (0.8, -12), (3.2, -12), (D, 0)]),
        curve("ParamAngleY", [(0, 0), (0.8, 6), (3.2, 6), (D, 0)]),
        curve("ParamAngleZ", [(0, 0), (0.8, 14), (3.2, 14), (D, 0)]),
        curve("ParamEyeBallX", [(0, 0), (0.7, -0.8), (2.0, -0.8), (2.4, -0.5), (3.2, -0.8), (D, 0)]),
        curve("ParamEyeBallY", [(0, 0), (0.7, 0.7), (3.2, 0.7), (D, 0)]),
        curve("ParamEyeLOpen", [(0, 1), (0.8, 0.75), (3.2, 0.75), (D, 1)]),
        curve("ParamEyeROpen", [(0, 1), (0.8, 0.75), (3.2, 0.75), (D, 1)]),
        curve("ParamBrowLY", [(0, 0), (0.8, -0.3), (3.2, -0.3), (D, 0)]),
        curve("ParamBrowRY", [(0, 0), (0.8, -0.3), (3.2, -0.3), (D, 0)]),
        curve("ParamBrowLForm", [(0, 0), (0.8, -0.7), (3.2, -0.7), (D, 0)]),
        curve("ParamBrowRForm", [(0, 0), (0.8, -0.7), (3.2, -0.7), (D, 0)]),
        curve("ParamBrowLAngle", [(0, 0), (0.8, -0.5), (3.2, -0.5), (D, 0)]),
        curve("ParamBrowRAngle", [(0, 0), (0.8, -0.5), (3.2, -0.5), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (0.8, -1.2), (3.2, -1.2), (D, 1)]),
        curve("ParamMouthOpenY", [(0, 0), (D, 0)]),
        curve("ParamBodyAngleZ", [(0, 0), (0.9, 6), (3.2, 6), (D, 0)]),
    ])

    # ---------------------------------------------------------------- surprised
    D = 2.5
    MOTIONS["hiyori_surprised"] = motion(D, [
        curve("ParamEyeLOpen", [(0, 1), (0.15, 1.2), (1.4, 1.2), (2.0, 1), (D, 1)]),
        curve("ParamEyeROpen", [(0, 1), (0.15, 1.2), (1.4, 1.2), (2.0, 1), (D, 1)]),
        curve("ParamBrowLY", [(0, 0), (0.15, 1), (1.4, 1), (2.0, 0), (D, 0)]),
        curve("ParamBrowRY", [(0, 0), (0.15, 1), (1.4, 1), (2.0, 0), (D, 0)]),
        curve("ParamBrowLForm", [(0, 0), (0.15, 0.3), (1.4, 0.3), (2.0, 0), (D, 0)]),
        # The right brow's form range only goes up to 0.21 on this model
        # (asymmetric with the left brow), so cap it at 0.2
        curve("ParamBrowRForm", [(0, 0), (0.15, 0.2), (1.4, 0.2), (2.0, 0), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (0.15, -1.5), (1.4, -1.5), (2.1, 1), (D, 1)]),
        curve("ParamMouthOpenY", [(0, 0), (0.15, 0.9), (1.4, 0.8), (2.1, 0), (D, 0)]),
        curve("ParamAngleY", [(0, 0), (0.15, 18), (0.5, 12), (1.4, 12), (2.1, 0), (D, 0)]),
        curve("ParamBodyAngleY", [(0, 0), (0.18, 8), (1.4, 6), (2.2, 0), (D, 0)]),
        curve("ParamShoulder", [(0, 0), (0.15, 1), (1.4, 0.8), (2.1, 0), (D, 0)]),
        curve("ParamHairAhoge", [(0, 0), (0.2, 8), (0.6, -6), (1.0, 4), (1.5, 0), (D, 0)]),
    ])

    # ---------------------------------------------------------------- shy
    D = 4.0
    MOTIONS["hiyori_shy"] = motion(D, [
        curve("ParamCheek", [(0, 0), (0.6, 1), (3.4, 1), (D, 0)]),
        curve("ParamAngleX", [(0, 0), (0.8, 10), (2.0, 6), (3.3, 9), (D, 0)]),
        curve("ParamAngleY", [(0, 0), (0.7, -14), (3.3, -12), (D, 0)]),
        curve("ParamAngleZ", [(0, 0), (0.9, 7), (2.2, 4), (3.3, 7), (D, 0)]),
        curve("ParamEyeBallX", [(0, 0), (0.7, 0.6), (2.0, 0.4), (3.3, 0.6), (D, 0)]),
        curve("ParamEyeBallY", [(0, 0), (0.7, -0.6), (3.3, -0.5), (D, 0)]),
        curve("ParamEyeLOpen", [(0, 1), (0.7, 0.65), (3.3, 0.65), (D, 1)]),
        curve("ParamEyeROpen", [(0, 1), (0.7, 0.65), (3.3, 0.65), (D, 1)]),
        curve("ParamEyeLSmile", [(0, 0), (0.7, 0.5), (3.3, 0.5), (D, 0)]),
        curve("ParamEyeRSmile", [(0, 0), (0.7, 0.5), (3.3, 0.5), (D, 0)]),
        curve("ParamBrowLY", [(0, 0), (0.7, -0.2), (3.3, -0.2), (D, 0)]),
        curve("ParamBrowRY", [(0, 0), (0.7, -0.2), (3.3, -0.2), (D, 0)]),
        curve("ParamBrowLForm", [(0, 0), (0.7, -0.6), (3.3, -0.6), (D, 0)]),
        curve("ParamBrowRForm", [(0, 0), (0.7, -0.6), (3.3, -0.6), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (0.7, 0.3), (3.3, 0.3), (D, 1)]),
        curve("ParamMouthOpenY", [(0, 0), (0.7, 0.15), (3.3, 0.1), (D, 0)]),
        curve("ParamBodyAngleZ", [(0, 0), (1.0, -6), (2.2, -3), (3.4, -6), (D, 0)]),
        curve("ParamShoulder", [(0, 0), (0.7, 0.5), (3.3, 0.5), (D, 0)]),
    ])

    # ---------------------------------------------------------------- head shake
    D = 2.4
    MOTIONS["hiyori_shakehead"] = motion(D, [
        curve("ParamAngleX", [(0, 0), (0.3, -24), (0.7, 20), (1.1, -16), (1.5, 10), (1.9, 0), (D, 0)]),
        curve("ParamBodyAngleX", [(0, 0), (0.35, -4), (0.75, 4), (1.15, -3), (1.55, 2), (2.0, 0), (D, 0)]),
        curve("ParamEyeLOpen", [(0, 1), (0.3, 0.7), (1.5, 0.7), (1.9, 1), (D, 1)]),
        curve("ParamEyeROpen", [(0, 1), (0.3, 0.7), (1.5, 0.7), (1.9, 1), (D, 1)]),
        curve("ParamBrowLForm", [(0, 0), (0.3, -0.5), (1.6, -0.5), (2.1, 0), (D, 0)]),
        curve("ParamBrowRForm", [(0, 0), (0.3, -0.5), (1.6, -0.5), (2.1, 0), (D, 0)]),
        curve("ParamMouthForm", [(0, 1), (0.3, -0.8), (1.6, -0.8), (2.1, 1), (D, 1)]),
    ])

    # Entries registered into the "Action" group of model3.json
    # (display name shown in the WebUI, fade-in/out seconds)
    MANIFEST = [
        ("hiyori_happy", "喜ぶ", 0.5, 0.5),
        ("hiyori_wink", "ウィンク", 0.5, 0.5),
        ("hiyori_nod", "うなずき", 0.4, 0.5),
        ("hiyori_thinking", "考え中", 0.5, 0.5),
        ("hiyori_surprised", "びっくり", 0.2, 0.5),
        ("hiyori_shy", "照れる", 0.5, 0.5),
        ("hiyori_shakehead", "首ふり", 0.4, 0.5),
    ]
    # Expressions stay on top of any motion until cleared. Keep MouthOpenY
    # free for speech; Multiply eye openness preserves blinking.
    EXPRESSIONS = {
        "smile": {
            "label": "笑顔", "fade_in": 0.4, "fade_out": 0.4,
            "parameters": [
                ("ParamEyeLOpen", 0, "Multiply"), ("ParamEyeROpen", 0, "Multiply"),
                ("ParamEyeLSmile", 1, "Overwrite"), ("ParamEyeRSmile", 1, "Overwrite"),
                ("ParamBrowLY", 0.3, "Add"), ("ParamBrowRY", 0.3, "Add"),
                ("ParamMouthForm", 1, "Overwrite"), ("ParamCheek", 0.5, "Overwrite"),
            ],
        },
        "shy": {
            "label": "照れ", "fade_in": 0.5, "fade_out": 0.5,
            "parameters": [
                ("ParamCheek", 1, "Overwrite"),
                ("ParamEyeLOpen", 0.65, "Multiply"), ("ParamEyeROpen", 0.65, "Multiply"),
                ("ParamBrowLY", -0.2, "Add"), ("ParamBrowRY", -0.2, "Add"),
                ("ParamBrowLForm", -0.6, "Overwrite"), ("ParamBrowRForm", -0.6, "Overwrite"),
                ("ParamMouthForm", 0.3, "Overwrite"),
            ],
        },
        # The bangs hide the brows and the existing motions have no angry
        # brows, so this model cannot express anger clearly. Use a sleepy face.
        "sleepy": {
            "label": "ねむい", "fade_in": 0.3, "fade_out": 0.4,
            "parameters": [
                ("ParamBrowLAngle", -1, "Overwrite"), ("ParamBrowRAngle", -1, "Overwrite"),
                ("ParamBrowLY", -0.4, "Overwrite"), ("ParamBrowRY", -0.4, "Overwrite"),
                ("ParamBrowLX", -0.4, "Overwrite"), ("ParamBrowRX", -0.4, "Overwrite"),
                ("ParamEyeLOpen", 0.5, "Multiply"), ("ParamEyeROpen", 0.5, "Multiply"),
                ("ParamEyeLSmile", 0, "Overwrite"), ("ParamEyeRSmile", 0, "Overwrite"),
                ("ParamBrowLForm", -1, "Overwrite"), ("ParamBrowRForm", -1, "Overwrite"),
                ("ParamCheek", 0, "Overwrite"),
                # MouthForm=-1 leaves a small "o" even with a closed mouth;
                # 0 gives a closed, downturned mouth instead.
                ("ParamMouthForm", 0, "Overwrite"),
            ],
        },
    }
    return MOTIONS, MANIFEST, EXPRESSIONS
