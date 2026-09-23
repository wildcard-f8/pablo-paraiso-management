from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

path = Path(__file__).with_name("test_backend_contract.py")
spec = spec_from_file_location("test_backend_contract", path)
module = module_from_spec(spec)
spec.loader.exec_module(module)

failures = []
for name in sorted(dir(module)):
    if name.startswith("test_"):
        try:
            getattr(module, name)()
            print(f"PASS {name}")
        except Exception as exc:
            failures.append((name, exc))
            print(f"FAIL {name}: {exc}")

if failures:
    raise SystemExit(1)
print("All backend contract tests passed")
