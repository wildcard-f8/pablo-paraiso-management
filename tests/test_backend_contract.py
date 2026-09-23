from pathlib import Path

BACKEND = Path(__file__).parents[1] / "backend" / "Code.js"


def source():
    return BACKEND.read_text()


def test_public_booking_uses_script_lock_and_idempotency():
    text = source()
    assert "LockService.getScriptLock()" in text
    assert "idempotencyKey" in text
    assert "booking_idempotency_" in text


def test_public_booking_writes_the_actual_booking_status():
    text = source()
    assert "writeWebBookingRow(data, booking.id, calendarEventId, now, clientIP, booking.status)" in text
    assert "bookingStatus || \"pending\"" in text


def test_public_booking_rejects_oversized_or_malformed_input():
    text = source()
    assert "MAX_PUBLIC_BODY_BYTES" in text
    assert "MAX_PUBLIC_FIELD_LENGTH" in text
    assert "data.website" in text


def test_backend_has_production_health_endpoint():
    text = source()
    assert "healthCheck" in text
    assert "getHealthStatus" in text
