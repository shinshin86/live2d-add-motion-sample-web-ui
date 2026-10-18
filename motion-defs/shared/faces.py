"""Portable expression templates; Add/Overwrite use normalized safe ranges."""


def define(curve, motion):
    def eyes(openness, smile=0):
        return [(f"ParamEye{side}Open", openness, "Multiply") for side in "LR"] + [
            (f"ParamEye{side}Smile", smile, "Overwrite") for side in "LR"]

    def brows(y, angle, form):
        return [(f"ParamBrow{side}{key}", value, "Overwrite")
                for side in "LR" for key, value in (("Y", y), ("Angle", angle), ("Form", form))]

    expressions = {
        "smile": {"label": "笑顔", "fade_in": 0.4, "fade_out": 0.4,
            "parameters": eyes(0, 1) + [
                ("ParamBrowLY", 0.3, "Add"), ("ParamBrowRY", 0.3, "Add"),
                ("ParamMouthForm", 1, "Overwrite"), ("ParamCheek", 0.45, "Overwrite")]},
        "shy": {"label": "照れ", "fade_in": 0.5, "fade_out": 0.5,
            "parameters": [("ParamCheek", 1, "Overwrite")] + [
                (f"ParamEye{side}Open", 0.65, "Multiply") for side in "LR"] + [
                (f"ParamBrow{side}Y", -0.3, "Overwrite") for side in "LR"] + [
                (f"ParamBrow{side}Form", -0.6, "Overwrite") for side in "LR"] + [
                # Both sample rigs rest at MouthForm=1; a factor keeps their
                # restrained smile alike despite different negative ranges.
                ("ParamMouthForm", 0.3, "Multiply")]},
        "surprised": {"label": "びっくり", "fade_in": 0.25, "parameters":
            [(f"ParamEye{side}Open", 1, "Overwrite") for side in "LR"] +
            [(f"ParamEye{side}Smile", 0, "Overwrite") for side in "LR"] + brows(0.8, 0, 0.2) + [
                ("ParamMouthForm", -0.83, "Overwrite"), ("ParamMouthOpenY", 0.55, "Overwrite"),
                ("ParamAngleY", 0.3, "Add")]},
        "glare": {"label": "ジト目", "parameters": eyes(0.38) + brows(-0.3, -0.5, -0.5) + [
            ("ParamEyeBallX", -0.7, "Overwrite"), ("ParamEyeBallY", -0.1, "Overwrite"),
            ("ParamMouthForm", -0.33, "Overwrite")]},
    }
    return {}, [], expressions
