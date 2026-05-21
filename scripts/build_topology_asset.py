import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_TOPOLOGY = ROOT / "croatia-counties.geojson"
OUTPUT_JS = ROOT / "data" / "croatia-counties-topology.js"


def main() -> None:
    topology = json.loads(SOURCE_TOPOLOGY.read_text(encoding="utf-8"))
    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JS.write_text(
        f"window.CROATIA_COUNTIES_TOPOLOGY = {json.dumps(topology, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_JS}")


if __name__ == "__main__":
    main()
