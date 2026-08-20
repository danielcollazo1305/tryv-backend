from datetime import date

from fastapi import HTTPException, status


def parse_period_days(period: str) -> int:
    """Aceita o formato 'Nd' (ex: '30d', '7d'); qualquer valor fora desse
    formato cai no padrao de 30 dias em vez de dar erro."""
    if period.endswith("d") and period[:-1].isdigit():
        return int(period[:-1])
    return 30


def validate_date_range(start_date: date, end_date: date, max_days: int = 90) -> None:
    """
    Validacao compartilhada pro seletor de intervalo livre da Exportacao PDF
    (home-summary, period-comparison, heart-rate/report) — mesmo teto de 90
    dias que ja existia fixo no parametro `days` desses endpoints antes
    disso, so que agora tambem se aplica quando o intervalo vem como
    start_date/end_date.
    """
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date deve ser igual ou posterior a start_date",
        )
    if (end_date - start_date).days + 1 > max_days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"O periodo nao pode ultrapassar {max_days} dias",
        )
