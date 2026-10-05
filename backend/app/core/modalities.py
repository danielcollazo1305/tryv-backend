"""
As 4 modalidades da tela "Treinar" e o mapeamento tipo de atividade -> modalidade, num UNICO lugar.

Modalidades fixas (ordem de exibicao): bike, halter, luva, tenis.

Mapeamento (decisao de produto):
- Run.activity_type: run, walk -> tenis; bike -> bike. (Outros tipos de Run -- swim, fight, hiit, other -- ficam FORA.)
- ManualActivity.activity_type: fight -> luva. (hiit, swim, other -- e run/walk/bike importados SEM rota, que
  chegam como manuais sem distancia -- ficam FORA das 4 modalidades: viram "Outras atividades" no app.)
- WorkoutSession (de plano e livre) -> halter.

So tenis e bike tem distancia (vem de Run.distance_meters).
"""

MODALITY_IDS: list[str] = ["bike", "halter", "luva", "tenis"]

RUN_ACTIVITY_TO_MODALITY: dict[str, str] = {"run": "tenis", "walk": "tenis", "bike": "bike"}

MANUAL_ACTIVITY_TO_MODALITY: dict[str, str] = {"fight": "luva"}

WORKOUT_SESSION_MODALITY = "halter"

# Modalidades que somam distancia (as demais devolvem distance_km null).
DISTANCE_MODALITIES: set[str] = {"tenis", "bike"}
