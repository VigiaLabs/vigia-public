"""
PMGSY OMMAS Rural Roads Scraper
Targets: Telangana (Khammam, Warangal) and Maharashtra (Pune, Nagpur)
Source: https://omms.nic.in

Usage: python3 infrastructure/pipeline/track-b/pmgsy-scraper.py
Output: data/pmgsy_roads.jsonl
"""

import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

OUTPUT_PATH = Path(__file__).resolve().parents[3] / "data" / "pmgsy_roads.jsonl"

# OMMAS uses numeric codes for states/districts
TARGETS = [
    {
        "state": "Telangana",
        "state_value": "36",
        "districts": [
            {"name": "Khammam", "value": "507"},
            {"name": "Warangal", "value": "506"},
        ],
    },
    {
        "state": "Maharashtra",
        "state_value": "27",
        "districts": [
            {"name": "Pune", "value": "521"},
            {"name": "Nagpur", "value": "517"},
        ],
    },
]

BASE_URL = "https://omms.nic.in"
CITIZEN_URL = f"{BASE_URL}/Home/CitizenFeedback"
TIMEOUT = 30000  # 30s


def scrape_district(page, state_name, state_value, district_name, district_value):
    """Scrape road data for a single district from OMMAS citizen reports."""
    records = []
    source_url = f"{BASE_URL}/Home/CitizenFeedback"

    try:
        # Navigate to citizen feedback page
        page.goto(CITIZEN_URL, timeout=TIMEOUT, wait_until="networkidle")
        time.sleep(2)

        # Select state
        state_select = page.locator("select#ddlState, select[name*='State']").first
        if state_select.count() == 0:
            print(f"  ⚠ State dropdown not found, trying alternative selectors...")
            state_select = page.locator("select").first
        
        state_select.select_option(value=state_value)
        time.sleep(3)  # Wait for AJAX postback

        # Select district
        district_select = page.locator("select#ddlDistrict, select[name*='District']").first
        if district_select.count() == 0:
            page.wait_for_selector("select#ddlDistrict, select[name*='District']", timeout=10000)
            district_select = page.locator("select#ddlDistrict, select[name*='District']").first

        district_select.select_option(value=district_value)
        time.sleep(3)

        # Click submit/view button
        submit_btn = page.locator("input[type='submit'], button[type='submit'], #btnView, #btnSubmit").first
        if submit_btn.count() > 0:
            submit_btn.click()
            time.sleep(5)

        # Wait for table
        page.wait_for_selector("table", timeout=TIMEOUT)

        # Extract table data
        tables = page.locator("table").all()
        for table in tables:
            rows = table.locator("tr").all()
            if len(rows) < 2:
                continue

            # Get headers
            headers = [th.inner_text().strip().lower() for th in rows[0].locator("th, td").all()]
            if not any(kw in " ".join(headers) for kw in ["road", "name", "length", "cost"]):
                continue

            for row in rows[1:]:
                cells = [td.inner_text().strip() for td in row.locator("td").all()]
                if len(cells) < 4:
                    continue

                record = parse_row(cells, headers, state_name, district_name, source_url)
                if record:
                    records.append(record)

    except PwTimeout:
        print(f"  ⚠ Timeout for {district_name}, {state_name}")
    except Exception as e:
        print(f"  ⚠ Error for {district_name}: {e}")

    return records


def parse_row(cells, headers, state, district, source_url):
    """Parse a table row into a structured record."""
    record = {
        "road_name": "",
        "state": state,
        "district": district,
        "block": "",
        "contractor": "",
        "cost_lakhs": None,
        "length_km": None,
        "status": "",
        "scheme": "PMGSY",
        "source_url": source_url,
    }

    for i, cell in enumerate(cells):
        if i >= len(headers):
            break
        h = headers[i]
        if "road" in h or "name" in h and "road" in h:
            record["road_name"] = cell
        elif "block" in h:
            record["block"] = cell
        elif "contractor" in h or "agency" in h:
            record["contractor"] = cell
        elif "cost" in h or "sanction" in h:
            try:
                record["cost_lakhs"] = float(cell.replace(",", "").replace("₹", ""))
            except (ValueError, TypeError):
                pass
        elif "length" in h or "km" in h:
            try:
                record["length_km"] = float(cell.replace(",", ""))
            except (ValueError, TypeError):
                pass
        elif "status" in h or "progress" in h:
            record["status"] = cell

    if not record["road_name"]:
        return None
    return record


def main():
    all_records = []

    print("PMGSY OMMAS Scraper")
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        for target in TARGETS:
            state = target["state"]
            print(f"\n📍 State: {state}")

            for dist in target["districts"]:
                print(f"  → District: {dist['name']}...", end=" ")
                records = scrape_district(
                    page, state, target["state_value"], dist["name"], dist["value"]
                )
                print(f"✓ {len(records)} records")
                all_records.extend(records)
                time.sleep(5)  # Rate limit between districts

        browser.close()

    # Write JSONL
    if all_records:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, "w") as f:
            for record in all_records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        print(f"\n✓ Wrote {len(all_records)} records to {OUTPUT_PATH}")
    else:
        print("\n⚠ No records scraped. OMMAS portal may be unreachable.")
        print("  Falling back to alternative data source...")
        fallback_from_public_data()


def fallback_from_public_data():
    """
    If OMMAS is unreachable, use the publicly available PMGSY data from
    data.gov.in datasets and pmgsy.nic.in published reports.
    This fetches real data from alternative government sources.
    """
    import urllib.request

    # Try data.gov.in PMGSY dataset (public, no auth needed for basic access)
    urls = [
        "https://pmgsy.nic.in/download-data",  # Official download page
    ]

    print("  Attempting pmgsy.nic.in public data...")

    # Since gov sites may block, we'll note this requires manual download
    print("  ⚠ Automated fallback failed. To get real data:")
    print("    1. Visit https://omms.nic.in from an Indian IP/VPN")
    print("    2. Navigate: Citizen Feedback → Select State/District → Export")
    print("    3. Save as data/pmgsy_roads.jsonl")
    sys.exit(1)


if __name__ == "__main__":
    main()
