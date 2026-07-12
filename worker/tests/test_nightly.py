from decimal import Decimal

from perpfarm.jobs.nightly import _f


def test_f_converts_decimal_to_float():
    result = _f(Decimal("1.5"))
    assert isinstance(result, float)
    assert result == 1.5


def test_f_passes_none_through():
    assert _f(None) is None


def test_f_accepts_plain_float():
    assert _f(2.0) == 2.0
