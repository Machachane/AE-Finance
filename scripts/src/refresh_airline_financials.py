"""Rebuild the public airline financial data from the canonical workbook.

Run `pnpm --filter @workspace/scripts run refresh-airline-financials`.
The export field list is intentionally explicit: derived USD and FX columns
from the workbook are never copied into the public bundle.
"""

from __future__ import annotations

import argparse
import json
import math
import posixpath
import re
import sys
import tempfile
import zipfile
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[2]
SOURCE_WORKBOOK = ROOT / "attached_assets" / "Airline_Financials_1792691285180.xlsx"
PUBLIC_BUNDLE = (
    ROOT
    / "artifacts"
    / "airline-financial-research"
    / "public"
    / "data"
    / "airline-financials.json"
)

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
XML_NS = {"main": MAIN_NS, "rel": REL_NS}

# Keep this allowlist in sync with the original-currency public data contract.
EXCLUDED_SOURCE_COLUMNS = frozenset(
    {"AMOUNT (USD)", "FX RATE (units per USD)", "FX BASIS"}
)
EXPORT_FIELDS = (
    ("AIRLINE", "airline", "text"),
    ("ID_METRIC", "metricId", "number"),
    ("METRIC", "metric", "text"),
    ("ID_CATEGORY", "categoryId", "number"),
    ("CATEGORY", "category", "text"),
    ("FINANCIAL YEAR", "financialYear", "text"),
    ("REPORTING PERIOD", "reportingPeriod", "text"),
    ("FISCAL YEAR-END", "fiscalYearEnd", "text"),
    ("CURRENCY", "currency", "text"),
    ("STATUS", "status", "text"),
    ("AMOUNT", "amount", "number"),
    ("DATE", "date", "date"),
    ("Reporting Scope", "reportingScope", "text"),
    ("IFRS16/ASC842 Adoption", "ifrs16Asc842Adoption", "text"),
    ("In Administration", "inAdministration", "text"),
    ("UNIT", "unit", "text"),
    ("VALUE BASIS", "valueBasis", "text"),
    ("REPORTING ENTITY", "reportingEntity", "text"),
    ("SOURCE LINK", "sourceUrl", "text"),
    ("SOURCE NOTE", "note", "text"),
)


def _read_xml(archive: zipfile.ZipFile, path: str) -> ElementTree.Element:
    try:
        return ElementTree.fromstring(archive.read(path))
    except KeyError as error:
        raise ValueError(f"Workbook is missing {path}") from error
    except ElementTree.ParseError as error:
        raise ValueError(f"Workbook contains invalid XML in {path}") from error


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = _read_xml(archive, "xl/sharedStrings.xml")
    return [
        "".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
        for item in root.findall("main:si", XML_NS)
    ]


def _first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = _read_xml(archive, "xl/workbook.xml")
    sheets = workbook.findall("main:sheets/main:sheet", XML_NS)
    if not sheets:
        raise ValueError("Workbook contains no sheets")

    relationship_id = sheets[0].attrib.get(f"{{{REL_NS}}}id")
    if not relationship_id:
        raise ValueError("The first workbook sheet has no relationship")

    relationships = _read_xml(archive, "xl/_rels/workbook.xml.rels")
    for relationship in relationships.findall(
        f"{{{PACKAGE_REL_NS}}}Relationship"
    ):
        if relationship.attrib.get("Id") == relationship_id:
            target = relationship.attrib.get("Target")
            if not target:
                break
            if target.startswith("/"):
                return target.lstrip("/")
            return posixpath.normpath(posixpath.join("xl", target))

    raise ValueError("Could not locate the first worksheet in the workbook")


def _column_number(cell_reference: str) -> int:
    match = re.match(r"([A-Z]+)", cell_reference)
    if not match:
        raise ValueError(f"Invalid worksheet cell reference: {cell_reference}")
    number = 0
    for character in match.group(1):
        number = number * 26 + ord(character) - ord("A") + 1
    return number


def _cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t", "n")
    if cell_type == "inlineStr":
        return "".join(
            node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t")
        )

    value_node = cell.find("main:v", XML_NS)
    if value_node is None or value_node.text is None:
        return None

    value = value_node.text
    if cell_type == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError) as error:
            raise ValueError(f"Invalid shared-string index {value}") from error
    if cell_type in ("str",):
        return value
    if cell_type == "b":
        return value == "1"
    if cell_type == "e":
        raise ValueError(f"Workbook contains an Excel error value: {value}")
    if cell_type != "n":
        raise ValueError(f"Unsupported Excel cell type: {cell_type}")

    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"Invalid numeric cell value: {value}") from error
    if not number.is_finite():
        raise ValueError(f"Non-finite numeric cell value: {value}")
    if number == number.to_integral_value():
        return int(number)
    converted = float(number)
    if not math.isfinite(converted):
        raise ValueError(f"Numeric cell value is outside the supported range: {value}")
    return converted


def _coerce_value(value: Any, value_type: str, header: str) -> Any:
    if value is None or value == "":
        return None

    if value_type == "text":
        return str(value)

    if value_type == "number":
        if isinstance(value, bool):
            raise ValueError(f"Expected a number in {header}, got a boolean")
        if isinstance(value, (int, float)):
            return value
        try:
            number = Decimal(str(value))
        except InvalidOperation as error:
            raise ValueError(f"Expected a number in {header}, got {value!r}") from error
        if not number.is_finite():
            raise ValueError(f"Expected a finite number in {header}, got {value!r}")
        return int(number) if number == number.to_integral_value() else float(number)

    if value_type == "date":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return (datetime(1899, 12, 30) + timedelta(days=value)).date().isoformat()
        if isinstance(value, (date, datetime)):
            return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
        text = str(value)
        try:
            return date.fromisoformat(text[:10]).isoformat()
        except ValueError as error:
            raise ValueError(f"Expected an Excel date in {header}, got {value!r}") from error

    raise ValueError(f"Unknown export type {value_type!r} for {header}")


def build_public_records(workbook_path: Path) -> list[dict[str, Any]]:
    included_source_columns = {source for source, _, _ in EXPORT_FIELDS}
    leaked_conversion_columns = included_source_columns & EXCLUDED_SOURCE_COLUMNS
    if leaked_conversion_columns:
        raise ValueError(
            "Conversion-only source columns cannot be exported: "
            + ", ".join(sorted(leaked_conversion_columns))
        )

    if not workbook_path.is_file():
        raise ValueError(f"Canonical workbook not found: {workbook_path}")

    try:
        archive = zipfile.ZipFile(workbook_path)
    except (OSError, zipfile.BadZipFile) as error:
        raise ValueError(f"Could not open workbook: {workbook_path}") from error

    with archive:
        shared_strings = _shared_strings(archive)
        sheet = _read_xml(archive, _first_sheet_path(archive))
        source_rows = sheet.findall("main:sheetData/main:row", XML_NS)
        if not source_rows:
            raise ValueError("First workbook sheet is empty")

        header_cells = {
            _column_number(cell.attrib["r"]): _cell_value(cell, shared_strings)
            for cell in source_rows[0].findall("main:c", XML_NS)
        }
        headers = [
            header_cells.get(index)
            for index in range(1, max(header_cells, default=0) + 1)
        ]
        if len(headers) != len(set(headers)):
            raise ValueError("Workbook has duplicate column headers")

        required_headers = {source for source, _, _ in EXPORT_FIELDS}
        missing = sorted(required_headers - set(headers))
        if missing:
            raise ValueError(
                "Workbook is missing required source columns: " + ", ".join(missing)
            )

        header_indexes = {
            header: index + 1 for index, header in enumerate(headers)
        }
        records: list[dict[str, Any]] = []
        for row in source_rows[1:]:
            values = {
                _column_number(cell.attrib["r"]): _cell_value(cell, shared_strings)
                for cell in row.findall("main:c", XML_NS)
            }
            if not values or all(value is None or value == "" for value in values.values()):
                continue

            record: dict[str, Any] = {}
            for source_header, output_key, value_type in EXPORT_FIELDS:
                raw_value = values.get(header_indexes[source_header])
                record[output_key] = _coerce_value(
                    raw_value, value_type, source_header
                )
            records.append(record)

    if not records:
        raise ValueError("Workbook contains no financial records")

    expected_keys = {output for _, output, _ in EXPORT_FIELDS}
    for row_number, record in enumerate(records, start=2):
        if set(record) != expected_keys:
            raise ValueError(f"Unexpected public fields in workbook row {row_number}")
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify that the public bundle matches the canonical workbook",
    )
    arguments = parser.parse_args()

    try:
        records = build_public_records(SOURCE_WORKBOOK)
        serialized = json.dumps(records, ensure_ascii=False, separators=(",", ":"))

        if arguments.check:
            try:
                current = json.loads(PUBLIC_BUNDLE.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise ValueError(f"Could not read public bundle: {PUBLIC_BUNDLE}") from error
            if current != records:
                raise ValueError(
                    "Public bundle differs from the canonical workbook; "
                    "run the refresh command to regenerate it"
                )
            print(f"Verified {len(records):,} records in {PUBLIC_BUNDLE.relative_to(ROOT)}")
            return 0

        PUBLIC_BUNDLE.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=PUBLIC_BUNDLE.parent,
                delete=False,
            ) as temporary_file:
                temporary_file.write(serialized)
                temporary_path = Path(temporary_file.name)
            temporary_path.replace(PUBLIC_BUNDLE)
        finally:
            if temporary_path is not None and temporary_path.exists():
                temporary_path.unlink()

        print(f"Refreshed {len(records):,} records in {PUBLIC_BUNDLE.relative_to(ROOT)}")
        print(
            "Included original AMOUNT, CURRENCY, and SOURCE LINK; "
            "excluded AMOUNT (USD) and FX conversion fields."
        )
        return 0
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Airline financial refresh failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
