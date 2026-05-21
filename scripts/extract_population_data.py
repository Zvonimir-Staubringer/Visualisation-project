import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_XLSX = ROOT / "stanovnistvo-pregled-po-zupanijama.xlsx"
OUTPUT_JSON = ROOT / "data" / "population-data.json"
OUTPUT_JS = ROOT / "data" / "population-data.js"

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


TEXT_REPLACEMENTS = str.maketrans(
    {
        "ð": "đ",
        "Ð": "Đ",
    }
)


def clean_text(value: str) -> str:
    return (value or "").translate(TEXT_REPLACEMENTS)


def slugify(value: str) -> str:
    value = clean_text(value)
    value = value.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower().replace("grad zagreb", "grad-zagreb")
    ascii_text = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return ascii_text


def parse_year(value: str) -> int | None:
    match = re.search(r"(19|20)\d{2}", value or "")
    return int(match.group(0)) if match else None


def column_index(ref: str) -> int:
    letters = re.match(r"([A-Z]+)", ref).group(1)
    idx = 0
    for char in letters:
        idx = (idx * 26) + ord(char) - 64
    return idx - 1


def read_xlsx_rows(path: Path) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", NS):
                shared_strings.append(
                    clean_text("".join(text.text or "" for text in item.iterfind(".//main:t", NS)))
                )

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        sheets = {}
        for sheet in workbook.find("main:sheets", NS):
            rel_id = sheet.attrib[
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            ]
            target = "xl/" + rel_targets[rel_id]
            xml_root = ET.fromstring(archive.read(target))
            rows = []

            for row in xml_root.findall(".//main:sheetData/main:row", NS):
                values = {}
                for cell in row.findall("main:c", NS):
                    idx = column_index(cell.attrib["r"])
                    raw_value = cell.find("main:v", NS)
                    value = "" if raw_value is None else raw_value.text or ""
                    if cell.attrib.get("t") == "s" and value:
                        value = shared_strings[int(value)]
                    value = clean_text(value)
                    values[idx] = value

                if values:
                    max_idx = max(values)
                    rows.append([values.get(i, "") for i in range(max_idx + 1)])

            sheets[sheet.attrib["name"]] = rows

    return sheets


def row_is_county_header(row: list[str]) -> bool:
    return (
        bool(row and row[0].strip())
        and len(row) > 1
        and bool(row[1].strip())
        and not any(cell.strip() for cell in row[2:])
    )


def to_int_map(years: list[int], values: list[str]) -> dict[str, int]:
    parsed = {}
    for year, value in zip(years, values, strict=False):
        if value == "":
            continue
        parsed[str(year)] = int(value)
    return parsed


def parse_natural_change(rows: list[list[str]]) -> tuple[list[int], dict[str, dict[str, int]]]:
    years = [year for year in (parse_year(value) for value in rows[7][2:]) if year is not None]
    county_values = {}

    for index, row in enumerate(rows):
        if row_is_county_header(row) and row[0] != "Republika Hrvatska":
            county_name = row[0]
            natural_row = rows[index + 3]
            county_values[county_name] = to_int_map(years, natural_row[2 : 2 + len(years)])

    return years, county_values


def parse_migration(rows: list[list[str]]) -> tuple[list[int], dict[str, dict[str, int]]]:
    years = [year for year in (parse_year(value) for value in rows[7][2:]) if year is not None]
    county_values = {}

    for index, row in enumerate(rows):
        if row_is_county_header(row) and row[0] != "Republika Hrvatska":
            county_name = row[0]
            saldo_row = rows[index + 1]
            county_values[county_name] = to_int_map(years, saldo_row[2 : 2 + len(years)])

    return years, county_values


def parse_population(rows: list[list[str]]) -> tuple[list[int], dict[str, dict[str, int]], dict[str, str]]:
    years = [year for year in (parse_year(value) for value in rows[7][2:]) if year is not None]
    county_values = {}
    county_english_names = {}

    for row in rows[9:30]:
        if not row or row[0] == "Republika Hrvatska" or row[0].startswith("1)"):
            continue
        county_name = row[0]
        county_values[county_name] = to_int_map(years, row[2 : 2 + len(years)])
        county_english_names[county_name] = row[1]

    return years, county_values, county_english_names


AGE_GROUPS = {
    "children": {"0 – 4", "5 – 9", "10 – 14"},
    "youth": {"15 – 19", "20 – 24", "25 – 29"},
    "middleAge": {"30 – 34", "35 – 39", "40 – 44", "45 – 49", "50 – 54", "55 – 59", "60 – 64"},
    "elderly": {"65 – 69", "70 – 74", "75 – 79", "80 – 84", "85 i više"},
}


def parse_age_groups(rows: list[list[str]]) -> tuple[list[int], dict[str, dict[str, dict[str, int]]]]:
    years = [year for year in (parse_year(value) for value in rows[5][4::3]) if year is not None]
    county_values = {}

    grouped_rows: dict[str, list[list[str]]] = {}
    for row in rows[7:]:
        if not row or not row[0].strip() or row[0] == "Republika Hrvatska":
            continue
        grouped_rows.setdefault(row[0], []).append(row)

    for county_name, county_rows in grouped_rows.items():
        yearly_totals = {
            str(year): {"children": 0, "youth": 0, "middleAge": 0, "elderly": 0}
            for year in years
        }

        for row in county_rows:
            age_label = row[2]
            if age_label == "Ukupno":
                continue

            bucket = next(
                (group_name for group_name, labels in AGE_GROUPS.items() if age_label in labels),
                None,
            )
            if bucket is None:
                continue

            for offset, year in enumerate(years):
                value_index = 4 + (offset * 3)
                if value_index < len(row) and row[value_index]:
                    yearly_totals[str(year)][bucket] += int(row[value_index])

        county_values[county_name] = yearly_totals

    return years, county_values


def build_dataset() -> dict:
    sheets = read_xlsx_rows(SOURCE_XLSX)

    natural_years, natural_data = parse_natural_change(sheets["7.4.1."])
    migration_years, migration_data = parse_migration(sheets["7.4.2."])
    population_years, population_data, english_names = parse_population(sheets["7.4.3."])
    age_years, age_data = parse_age_groups(sheets["7.4.4."])

    counties = []
    for county_name, population_series in population_data.items():
        counties.append(
            {
                "id": slugify(county_name),
                "name": county_name,
                "nameEn": english_names[county_name],
                "metrics": {
                    "population": population_series,
                    "naturalChange": natural_data[county_name],
                    "migrationBalance": migration_data[county_name],
                },
                "ageComposition": age_data[county_name],
            }
        )

    counties.sort(key=lambda county: county["name"])

    return {
        "source": {
            "title": "STANOVNIŠTVO – PREGLED PO ŽUPANIJAMA",
            "publisher": "Državni zavod za statistiku Republike Hrvatske",
            "file": SOURCE_XLSX.name,
        },
        "years": {
            "population": population_years,
            "naturalChange": natural_years,
            "migrationBalance": migration_years,
            "ageComposition": age_years,
        },
        "ageBuckets": {
            "children": "Djeca (0-14)",
            "youth": "Mladi (15-29)",
            "middleAge": "Srednja dob (30-64)",
            "elderly": "Stariji (65+)",
        },
        "counties": counties,
    }


def main() -> None:
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    dataset = build_dataset()
    json_text = json.dumps(dataset, ensure_ascii=False, indent=2)
    OUTPUT_JSON.write_text(json_text, encoding="utf-8")
    OUTPUT_JS.write_text(f"window.POPULATION_DATA = {json_text};\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_JS}")


if __name__ == "__main__":
    main()
