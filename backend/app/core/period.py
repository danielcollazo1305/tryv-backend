def parse_period_days(period: str) -> int:
    """Aceita o formato 'Nd' (ex: '30d', '7d'); qualquer valor fora desse
    formato cai no padrao de 30 dias em vez de dar erro."""
    if period.endswith("d") and period[:-1].isdigit():
        return int(period[:-1])
    return 30
