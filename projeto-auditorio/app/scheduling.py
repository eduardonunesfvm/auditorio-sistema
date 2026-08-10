from datetime import date, datetime, time
from zoneinfo import ZoneInfo


AUDITORIUM_TIMEZONE_NAME = "America/Campo_Grande"
AUDITORIUM_TIMEZONE = ZoneInfo(AUDITORIUM_TIMEZONE_NAME)

WORKDAY_START = time(7, 0)
LUNCH_START = time(11, 0)
LUNCH_END = time(13, 0)
WORKDAY_END = time(20, 0)


def auditorium_today() -> date:
    """Return the current calendar date in Campo Grande."""
    return datetime.now(AUDITORIUM_TIMEZONE).date()


def is_valid_schedule_window(start: time, end: time) -> bool:
    """Accept a positive interval fully contained in morning or afternoon hours."""
    if start >= end:
        return False

    is_morning = WORKDAY_START <= start and end <= LUNCH_START
    is_afternoon = LUNCH_END <= start and end <= WORKDAY_END
    return is_morning or is_afternoon


def format_schedule_time(value: time) -> str:
    """Keep legacy second precision when present, otherwise expose HH:MM."""
    if value.second or value.microsecond:
        return value.isoformat()
    return value.strftime("%H:%M")
