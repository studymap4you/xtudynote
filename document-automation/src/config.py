from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def load_config(root: Path, config_path: Path | None = None) -> dict[str, Any]:
    path = config_path or (root / "config.yaml")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("config.yaml must parse to a mapping at the top level.")
    return data
