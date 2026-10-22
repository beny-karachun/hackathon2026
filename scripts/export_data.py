#!/usr/bin/env python3
"""Export sidestream.db to static JSON for the GitHub Pages site.

Usage:
  python3 scripts/export_data.py [path/to/sidestream.db] [output_dir]

Values are copied from SQLite. Null stays null. Numbers are not imputed,
rounded, or rescaled. The script checks a few identities that hold in this
database and records them in data/meta.json. If an identity fails, export stops
so a wrong legend is not published.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

VIEWS = [
    {
        "id": "v_rank_capped_global",
        "title": "Capped global",
        "description": "Routes that have a capped global annual net, highest first.",
        "sql": "SELECT route_id FROM v_rank_capped_global",
    },
    {
        "id": "v_rank_net_per_kg",
        "title": "Net $/kg",
        "description": "Routes that have a net value per kg of waste, highest first.",
        "sql": "SELECT route_id FROM v_rank_net_per_kg",
    },
    {
        "id": "v_rank_israel",
        "title": "Israel",
        "description": "Routes that have a capped Israel annual net, highest first.",
        "sql": "SELECT route_id FROM v_rank_israel",
    },
    {
        "id": "v_rank_sponsor_israel",
        "title": "Sponsor × Israel",
        "description": "Routes with a sponsor link, a sponsor mention, or israel_linked, and a positive net per kg. Sponsor-linked rows come first, then hackathon fit, then capped Israel (or capped global) annual net.",
        "sql": "SELECT route_id FROM v_rank_sponsor_israel",
    },
    {
        "id": "v_rank_hackathon_fit",
        "title": "Hackathon fit",
        "description": "Positive net per kg, novelty at least 3, and flags do not contain already_done. Ordered by hackathon fit, then capped global net at a 10% market share, then net per kg.",
        "sql": "SELECT route_id FROM v_rank_hackathon_fit",
    },
    {
        "id": "v_rank_capped_sanity",
        "title": "Sanity-capped",
        "description": "sanity_pass is 1, a product market figure is present, and capped global annual net is present. Ordered by that capped net.",
        "sql": "SELECT route_id FROM v_rank_capped_sanity",
    },
    {
        "id": "v_top_per_stream",
        "title": "Top per stream",
        "description": "One route per stream: the row with the highest capped global annual net, breaking ties with net per kg.",
        "sql": "SELECT route_id FROM v_top_per_stream",
    },
]

# (label, group, description). Keyed by column name when the meaning is shared,
# and by "table.column" when it is not.
LEGEND: dict[str, tuple[str, str, str]] = {
    "route_id": (
        "Route",
        "Identity",
        "Unique id of one matrix cell (one waste stream → one product), shaped like R01-0001.",
    ),
    "batch": ("Batch", "Identity", "Worker batch that wrote the route, as stored."),
    "stream_id": ("Stream", "Identity", "Waste-stream id, shaped like FOODAG-0001."),
    "id": ("Stream", "Identity", "Waste-stream id."),
    "stream_name": ("Stream name", "Identity", "Specific waste stream name."),
    "source_industry": ("Industry", "Identity", "Industry that produces the stream."),
    "sector": (
        "Sector",
        "Identity",
        "FOODAG food and agriculture, CHEMBIO chemicals and bioprocess, MATMIN materials and mining, URBANX urban and residual, or SPONSOR.",
    ),
    "description": ("Description", "Identity", "Short description as stored."),
    "main_components": ("Components", "Identity", "Main chemical or material components, as stored."),
    "product_id": ("Product id", "Identity", "Catalogue id (P0001, or PNEW-… for a product added with a route)."),
    "canonical_product_id": (
        "Canonical id",
        "Identity",
        "Canonical product id this catalogue row was grouped under.",
    ),
    "canonical_id": ("Canonical id", "Identity", "Id of a canonical product group."),
    "product_name": ("Product", "Identity", "Product name used on the route."),
    "product_name_as_entered": (
        "Product as entered",
        "Identity",
        "Product name as the route author wrote it, before canonical naming.",
    ),
    "name": ("Name", "Identity", "Product name."),
    "canonical_name": ("Canonical name", "Identity", "Name of the canonical product group."),
    "product_family": ("Family", "Identity", "Product family."),
    "new_product_family": ("New family", "Identity", "Family, filled only when product_id was NEW at authoring time."),
    "new_product_name": ("New product", "Identity", "Name, filled only when product_id was NEW at authoring time."),
    "route_origin": (
        "Origin",
        "Identity",
        "candidate (from the suggestion list), creative (a non-obvious idea), or symbiosis (uses a second stream).",
    ),
    "partner_stream_id": ("Partner stream", "Identity", "Second stream id. Required when route_origin is symbiosis."),
    "parent_stream_id": ("Parent stream", "Identity", "Parent stream id when this row is a child or a regional split."),
    "is_rollup": ("Rollup", "Identity", "1 when this stream is a rollup parent. Totals should not add it to its children."),
    "merged_from": ("Merged from", "Identity", "Ids absorbed into this stream during dedupe."),
    "shard": ("Shard", "Identity", "Source shard the stream was loaded from."),
    "match_key": ("Match key", "Identity", "Key used to group catalogue products into a canonical product."),
    "n_member_products": ("Members", "Identity", "How many catalogue products sit in this canonical group."),
    "member_product_ids": ("Member ids", "Identity", "Catalogue ids in this canonical group."),
    "member_names": ("Member names", "Identity", "Catalogue names in this canonical group."),
    "origin": ("Origin", "Identity", "Where the product row came from (catalog or a batch)."),
    "sponsor": ("Sponsor", "Sponsors", "Hackathon sponsor name."),
    "sponsor_site": ("Site", "Sponsors", "Sponsor site this stream was linked to."),
    "stream_id_raw": ("Raw stream id", "Sponsors", "Stream id before matching, as stored."),
    "match_type": ("Match", "Sponsors", "How the sponsor stream was matched to a database stream."),
    "likelihood_of_challenge_1to5": (
        "Challenge likelihood",
        "Sponsors",
        "1–5 likelihood this stream becomes a sponsor challenge, as stored.",
    ),
    "rationale": ("Rationale", "Sponsors", "Why this stream was linked to the sponsor."),
    "already_done_warning": (
        "Already done",
        "Sponsors",
        "What this sponsor already does commercially with the stream, when known.",
    ),
    "evidence_urls": ("Evidence", "Sponsors", "URLs supporting the sponsor link."),
    "pretreatment_steps": ("Pretreatment", "Process", "Short pretreatment chain, as written."),
    "key_process": ("Key process", "Process", "Core unit operation."),
    "byproducts": ("Byproducts", "Process", "Co-products or residues."),
    "mechanism": ("Mechanism", "Process", "One or two sentences on why the route works."),
    "moisture_pct": ("Moisture %", "Stream context", "Moisture percent, as stored. A number only."),
    "physical_form": ("Form", "Stream context", "Physical form of the stream."),
    "availability_basis": (
        "Availability basis",
        "Stream context",
        "sourced or estimate. Estimates explain their basis in notes.",
    ),
    "availability_unit": ("Availability unit", "Stream context", "Unit note for the availability figures, often t/yr."),
    "geographic_concentration": (
        "Geography",
        "Stream context",
        "point_source_large, clustered, many_small, or diffuse.",
    ),
    "typical_site_output_t_per_yr": (
        "Site output t/yr",
        "Stream context",
        "Typical output of one site, tonnes per year.",
    ),
    "seasonality": ("Seasonality", "Stream context", "Seasonal pattern, as stored."),
    "current_fate": ("Current fate", "Stream context", "What happens to the stream today."),
    "regulatory_notes": ("Regulatory notes", "Stream context", "Permits, classifications, or discharge notes."),
    "source_urls": ("Sources", "Quality", "Source URLs, separated as stored."),
    "notes": ("Notes", "Quality", "Assumptions, ranges, scale caveats, and ALREADY DONE flags. Blank means no note."),
    "references": ("References", "Quality", "Space-separated URLs or DOIs. Blank means none was recorded."),
    "hazard_class": ("Hazard", "Stream context", "Hazard note as stored. Free text, not a closed list."),
    "logistics_difficulty_1to5": (
        "Logistics",
        "Stream context",
        "1–5 logistics difficulty as stored. 5 is harder.",
    ),
    "global_availability_t_per_yr": (
        "Global t/yr",
        "Scale",
        "Global availability, tonnes per year. Blank means unknown, not zero.",
    ),
    "israel_availability_t_per_yr": (
        "Israel t/yr",
        "Scale",
        "Israel availability, tonnes per year. Blank means unknown, not zero.",
    ),
    "current_disposal_cost_usd_per_t": (
        "Disposal $/t",
        "Economics",
        "What a generator pays to get rid of the stream today, USD per tonne. Blank means unknown.",
    ),
    "current_sale_value_usd_per_t": (
        "Sale $/t",
        "Economics",
        "What the stream sells for today, USD per tonne. Blank means unknown.",
    ),
    "price_usd_per_kg": (
        "Price $/kg",
        "Economics",
        "USD per kg of product. On route_matrix this is the price used for ranking. On route_value and products it is the catalogue price. They differ on harmonised rows.",
    ),
    "price_entered_usd_per_kg": (
        "Entered price $/kg",
        "Economics",
        "Price as entered before harmonisation, USD per kg of product.",
    ),
    "canonical_price_usd_per_kg": (
        "Canonical price $/kg",
        "Economics",
        "Representative USD per kg for the canonical product.",
    ),
    "new_product_price_usd_per_kg": (
        "New price $/kg",
        "Economics",
        "USD per kg, filled only when product_id was NEW at authoring time.",
    ),
    "price_min": ("Price min $/kg", "Economics", "Lowest member price in the canonical group, USD per kg."),
    "price_max": ("Price max $/kg", "Economics", "Highest member price in the canonical group, USD per kg."),
    "price_spread_ratio": ("Price spread", "Economics", "price_max / price_min as stored."),
    "price_basis": ("Price basis", "Quality", "sourced or estimate."),
    "new_price_basis": ("New price basis", "Quality", "sourced or estimate, for a NEW product."),
    "price_source": ("Price source", "Quality", "URL or note for the product price."),
    "new_price_source": ("New price source", "Quality", "URL for a NEW product price."),
    "price_sources": ("Price sources", "Quality", "Sources for the canonical price."),
    "price_scale": (
        "Price scale",
        "Quality",
        "bulk, specialty, or research_quantity. A research_quantity price is a lab-scale price and is a poor bulk value.",
    ),
    "price_scale_reason": ("Scale reason", "Quality", "Why the price was tagged with that scale."),
    "price_grade": ("Price grade", "Quality", "Price grade note as stored."),
    "yield_kg_per_kg_waste": (
        "Yield kg/kg",
        "Economics",
        "kg of product per kg of waste as received (wet basis).",
    ),
    "process_cost_usd_per_kg_waste": (
        "Process $/kg",
        "Economics",
        "Operating cost, USD per kg of waste as received. Blank means unknown, not zero.",
    ),
    "gross_usd_per_kg_waste": (
        "Gross $/kg",
        "Economics",
        "price_usd_per_kg × yield_kg_per_kg_waste. USD of product per kg of waste.",
    ),
    "net_usd_per_kg_waste": (
        "Net $/kg",
        "Economics",
        "gross_usd_per_kg_waste − process_cost_usd_per_kg_waste. Blank when an input is blank.",
    ),
    "product_output_t_per_yr": (
        "Product t/yr",
        "Scale",
        "yield_kg_per_kg_waste × global_availability_t_per_yr. Tonnes of product per year if the whole global stream were converted.",
    ),
    "uncapped_net_usd_per_yr_global": (
        "Uncapped $/yr global",
        "Scale",
        "net_usd_per_kg_waste × global_availability_t_per_yr × 1000. No market limit.",
    ),
    "net_usd_per_yr_israel": (
        "Israel $/yr",
        "Scale",
        "net_usd_per_kg_waste × israel_availability_t_per_yr × 1000 when Israel tonnage is present and not zero. Blank when Israel tonnage is blank or zero.",
    ),
    "net_usd_per_yr_global_potential": (
        "Global potential $/yr",
        "Scale",
        "Annual net using the route_value (catalogue) price and global tonnage. Can differ from route_matrix when the ranking price was harmonised.",
    ),
    "net_usd_per_yr_israel_potential": (
        "Israel potential $/yr",
        "Scale",
        "Annual net using the route_value (catalogue) price and Israel tonnage.",
    ),
    "product_market_usd_per_yr": (
        "Product market $/yr",
        "Market",
        "Market size for the product, USD per year, as joined onto the route. Blank means unknown.",
    ),
    "market_usd_per_yr": ("Market $/yr", "Market", "Market size, USD per year."),
    "market_size_usd_per_yr": ("Market $/yr", "Market", "Market size on the product row, USD per year."),
    "market_t_per_yr": ("Market t/yr", "Market", "Market volume, tonnes per year."),
    "market_growth_pct": ("Market growth %", "Market", "Market growth percent, as stored."),
    "market_basis": ("Market basis", "Market", "How the market figure was set, as stored."),
    "basis": ("Basis", "Market", "Basis note for this market row."),
    "working": ("Working", "Market", "Arithmetic or source note behind the market figure."),
    "market_source_urls": ("Market sources", "Market", "URLs for the market figure."),
    "market_confidence_1to5": ("Market confidence", "Market", "1–5 confidence in the market figure."),
    "confidence_1to5": (
        "Confidence",
        "Quality",
        "1–5 confidence. On a stream, confidence in the stream numbers. On a route, confidence in the route numbers. 5 is sourced, 1 is an order-of-magnitude guess.",
    ),
    "market_share_needed": (
        "Market share ×",
        "Market",
        "Ratio of priced global product output to the product market. 1 means the route would fill the whole market. The flag market_share_gt_30pct is set exactly when this ratio is above 0.3.",
    ),
    "capped_net_usd_per_yr_global": (
        "Capped $/yr global",
        "Scale",
        "Uncapped global annual net scaled down when priced output would exceed the product market. Equals the uncapped figure when there is no market to cap against.",
    ),
    "capped_net_usd_per_yr_global_10pct_share": (
        "Capped $/yr at 10% share",
        "Scale",
        "Same cap as capped global annual net, but limited to 10% of the product market instead of 100%.",
    ),
    "capped_net_usd_per_yr_israel": (
        "Capped $/yr Israel",
        "Scale",
        "Precomputed Israel annual net after the stored market cap. Exported unchanged.",
    ),
    "product_oversubscription_all_routes": (
        "Oversubscription",
        "Market",
        "Precomputed figure stored on the route. Exported unchanged.",
    ),
    "capex_class": (
        "Capex",
        "Scores",
        "A under $1M, B $1–10M, C $10–100M, D over $100M, for a first plant at a typical Israeli site.",
    ),
    "trl_1to9": (
        "TRL",
        "Scores",
        "Technology readiness of this stream → product route, 1–9. 9 is widespread commercial practice.",
    ),
    "trl_fit_1to5": (
        "TRL fit",
        "Scores",
        "Stored map from TRL: 2→3, 3–5→5, 6→4, 7→2, 8–9→1. Higher means a lab-to-pilot TRL, which fits a hackathon better than a fully commercial plant.",
    ),
    "novelty_1to5": (
        "Novelty",
        "Scores",
        "1 textbook or already commercial, 2 niche commercial, 3 published and piloted but rare, 4 papers or patents only, 5 little precedent. Already-done sponsor routes are 1.",
    ),
    "demo_feasibility_1to5": (
        "Demo",
        "Scores",
        "Can a student team show it in 48 hours or a few weeks at Technion? 1 needs a plant, 5 is a benchtop in hours.",
    ),
    "israel_fit_1to5": (
        "Israel fit",
        "Scores",
        "1 negligible in Israel, 5 a top Israeli stream with a sponsor or a strategic local need.",
    ),
    "route_confidence_1to5": (
        "Route confidence",
        "Quality",
        "1–5 confidence in the route numbers. 5 is published techno-economics for this route, 1 is a guess.",
    ),
    "route_confidence": (
        "Route confidence",
        "Quality",
        "Route confidence_1to5 as exposed by the route_value view.",
    ),
    "stream_confidence_1to5": (
        "Stream confidence",
        "Quality",
        "1–5 confidence in the stream numbers, copied onto the route.",
    ),
    "stream_confidence": (
        "Stream confidence",
        "Quality",
        "Stream confidence_1to5 as exposed by the route_value view.",
    ),
    "hackathon_fit_score": (
        "Hackathon fit",
        "Scores",
        "novelty_1to5 + demo_feasibility_1to5 + israel_fit_1to5 + trl_fit_1to5. Present on every route.",
    ),
    "co2_avoided_kg_per_kg": (
        "CO2 avoided kg/kg",
        "Economics",
        "kg CO2e avoided per kg waste versus the current fate. Blank means no defensible basis was recorded.",
    ),
    "faculty_fit": (
        "Faculty",
        "Identity",
        "Technion faculty tags: biotech_food, chemeng, materials. Semicolon-separated when more than one.",
    ),
    "sponsor_stream_link": (
        "Sponsor link",
        "Sponsors",
        "Sponsors whose stream table links this waste stream. Semicolon-separated.",
    ),
    "sponsor_mentioned": (
        "Sponsor mentioned",
        "Sponsors",
        "Sponsors named on the route. Semicolon-separated. Shorter names than sponsor_stream_link.",
    ),
    "sponsor_fit": ("Sponsor fit", "Sponsors", "Which sponsor would care, and why."),
    "israel_linked": (
        "Israel-linked",
        "Sponsors",
        "1 when the route is tied to Israel by the stored flag (tonnage, sponsor, or local context).",
    ),
    "sanity_pass": (
        "Sanity",
        "Quality",
        "1 when the route is in the stricter sanity subset used by the sanity-capped ranking. It is not a claim that every number is measured.",
    ),
    "flags": (
        "Flags",
        "Quality",
        "Semicolon-separated quality flags. See the flag glossary in meta.json. Blank means no flag was set.",
    ),
    "n_flags": ("Flag count", "Quality", "How many semicolon-separated flags are set."),
    "typical_purity_required": ("Purity", "Process", "Typical purity the product market expects, as stored."),
    "column": ("Column", "Quality", "Which field a reference audit removed text from."),
    "removed": ("Removed text", "Quality", "Text removed from the route during reference audit."),
    "reason": ("Reason", "Quality", "Why the reference audit removed the text."),
}


FLAG_GLOSS = {
    "no_reference": "No reference URL or DOI on the route.",
    "price_estimate": "The product price is an estimate.",
    "global_avail_missing": "Global availability is blank.",
    "net_nonpositive": "Net value per kg is zero or negative.",
    "price_specialty_scale": "Price is tagged specialty rather than bulk.",
    "market_size_unknown": "No product market size is recorded.",
    "market_share_gt_30pct": "Priced global output is more than 30% of the product market (market_share_needed > 0.3).",
    "capped_by_market": "Annual value was limited by the product market.",
    "price_harmonised": "Ranking price differs from the price as entered.",
    "gas_stream_per_kg_gas": "Availability is a gas mass, so per-kg figures are per kg of gas.",
    "partner_mass_in_yield": "Yield counts mass from a partner stream.",
    "child_stream": "Stream is a child of a parent stream.",
    "value_shared_with_partner": "Value is shared with a partner stream.",
    "rollup_parent_stream": "Stream is a rollup parent.",
    "yield_gt_1": "Yield is above 1 kg product per kg waste.",
    "cost_missing": "Process cost is blank.",
    "price_inconsistent_across_workers": "Workers entered inconsistent prices.",
    "israel_named_row_with_global_tonnage": "An Israel-named row is carrying a global tonnage.",
    "price_research_scale": "Price is a research or lab-scale price.",
    "heat_stream": "Stream is heat rather than a material.",
    "already_done": "Marked as already commercial practice.",
    "yield_missing": "Yield is blank.",
}


TABLES = [
    ("streams", "streams", "id"),
    ("products", "products", "product_id"),
    ("routes", "routes", "route_id"),
    ("route_matrix", "route_matrix", "route_id"),
    ("product_markets", "product_markets", None),
    ("product_canonical", "product_canonical", "canonical_id"),
    ("sponsor_streams", "sponsor_streams", None),
    ("reference_audit", "reference_audit", None),
]


def quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def fetch_table(cur: sqlite3.Cursor, table: str) -> tuple[list[str], list[list]]:
    cols = [row[1] for row in cur.execute(f"PRAGMA table_info({quote(table)})")]
    listed = ", ".join(quote(c) for c in cols)
    rows = [list(r) for r in cur.execute(f"SELECT {listed} FROM {quote(table)}")]
    return cols, rows


def check_identities(cur: sqlite3.Cursor) -> list[str]:
    def n(sql: str) -> int:
        return int(cur.execute(sql).fetchone()[0])

    checks = {
        "gross": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE price_usd_per_kg IS NOT NULL AND yield_kg_per_kg_waste IS NOT NULL
              AND (gross_usd_per_kg_waste IS NULL
                   OR ABS(gross_usd_per_kg_waste - price_usd_per_kg * yield_kg_per_kg_waste) > 1e-6)
            """
        ),
        "net": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE gross_usd_per_kg_waste IS NOT NULL AND process_cost_usd_per_kg_waste IS NOT NULL
              AND (net_usd_per_kg_waste IS NULL
                   OR ABS(net_usd_per_kg_waste - (gross_usd_per_kg_waste - process_cost_usd_per_kg_waste)) > 1e-4)
            """
        ),
        "uncapped_global": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE net_usd_per_kg_waste IS NOT NULL AND global_availability_t_per_yr IS NOT NULL
              AND (uncapped_net_usd_per_yr_global IS NULL
                   OR ABS(uncapped_net_usd_per_yr_global - net_usd_per_kg_waste * global_availability_t_per_yr * 1000) > 1)
            """
        ),
        "israel_year": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE net_usd_per_kg_waste IS NOT NULL
              AND israel_availability_t_per_yr IS NOT NULL
              AND israel_availability_t_per_yr != 0
              AND (net_usd_per_yr_israel IS NULL
                   OR ABS(net_usd_per_yr_israel - net_usd_per_kg_waste * israel_availability_t_per_yr * 1000) > 1)
            """
        ),
        "israel_year_zero": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE (israel_availability_t_per_yr IS NULL OR israel_availability_t_per_yr = 0)
              AND net_usd_per_yr_israel IS NOT NULL
            """
        ),
        "output": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE yield_kg_per_kg_waste IS NOT NULL AND global_availability_t_per_yr IS NOT NULL
              AND (product_output_t_per_yr IS NULL
                   OR ABS(product_output_t_per_yr - yield_kg_per_kg_waste * global_availability_t_per_yr) > 0.01)
            """
        ),
        "hack": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE hackathon_fit_score IS NULL
               OR ABS(hackathon_fit_score - (
                    IFNULL(novelty_1to5,0) + IFNULL(demo_feasibility_1to5,0)
                    + IFNULL(israel_fit_1to5,0) + IFNULL(trl_fit_1to5,0)
               )) > 1e-6
            """
        ),
        "trl_fit": n(
            """
            SELECT COUNT(*) FROM route_matrix
            WHERE trl_fit_1to5 IS NULL OR trl_1to9 IS NULL OR trl_fit_1to5 != (
              CASE trl_1to9 WHEN 2 THEN 3 WHEN 3 THEN 5 WHEN 4 THEN 5 WHEN 5 THEN 5
                            WHEN 6 THEN 4 WHEN 7 THEN 2 WHEN 8 THEN 1 WHEN 9 THEN 1 END
            )
            """
        ),
    }
    bad = {k: v for k, v in checks.items() if v}
    if bad:
        raise SystemExit(f"identity checks failed: {bad}")

    share_bad = 0
    cap_bad = 0
    c10_bad = 0
    share_n = 0
    for price, out_t, market, unc, cap, c10, share in cur.execute(
        """
        SELECT price_usd_per_kg, product_output_t_per_yr, product_market_usd_per_yr,
               uncapped_net_usd_per_yr_global, capped_net_usd_per_yr_global,
               capped_net_usd_per_yr_global_10pct_share, market_share_needed
        FROM route_matrix
        WHERE price_usd_per_kg IS NOT NULL AND product_output_t_per_yr IS NOT NULL
          AND product_market_usd_per_yr IS NOT NULL AND product_market_usd_per_yr != 0
        """
    ):
        share_n += 1
        revenue = price * out_t * 1000
        pred_share = revenue / market
        if share is None or abs(pred_share - share) > 1e-4 * max(1.0, abs(pred_share)):
            share_bad += 1
        if unc is None:
            cap_bad += 1
            c10_bad += 1
            continue
        scale = min(1.0, market / revenue)
        scale10 = min(1.0, (0.1 * market) / revenue)
        if cap is None or abs(unc * scale - cap) > 1:
            cap_bad += 1
        if c10 is None or abs(unc * scale10 - c10) > 1:
            c10_bad += 1
    if share_bad or cap_bad or c10_bad:
        raise SystemExit(f"market cap checks failed: share={share_bad} cap={cap_bad} c10={c10_bad}")

    flag_mismatch = n(
        """
        SELECT COUNT(*) FROM route_matrix
        WHERE (CASE WHEN flags LIKE '%market_share_gt_30pct%' THEN 1 ELSE 0 END)
           != (CASE WHEN market_share_needed > 0.3 THEN 1 ELSE 0 END)
        """
    )
    if flag_mismatch:
        raise SystemExit(f"market_share flag mismatches: {flag_mismatch}")

    return [
        "Blank cells are unknown. They were not filled with zero.",
        "gross_usd_per_kg_waste = price_usd_per_kg × yield_kg_per_kg_waste wherever both inputs are present.",
        "net_usd_per_kg_waste = gross_usd_per_kg_waste − process_cost_usd_per_kg_waste wherever both inputs are present.",
        "uncapped_net_usd_per_yr_global = net_usd_per_kg_waste × global_availability_t_per_yr × 1000 wherever both inputs are present.",
        "net_usd_per_yr_israel = net_usd_per_kg_waste × israel_availability_t_per_yr × 1000 when Israel tonnage is present and not zero. When Israel tonnage is blank or zero, this annual column is blank.",
        "product_output_t_per_yr = yield_kg_per_kg_waste × global_availability_t_per_yr.",
        f"market_share_needed = price_usd_per_kg × product_output_t_per_yr × 1000 / product_market_usd_per_yr on the {share_n} routes where price, output, and market are present. 1 means priced global output equals the whole product market. market_share_gt_30pct is set exactly when the ratio is above 0.3.",
        "Where price, output, and market are present, capped_net_usd_per_yr_global = uncapped_net × min(1, market / revenue), and capped_net_usd_per_yr_global_10pct_share uses 10% of the market in that same cap. revenue = price × product tonnes × 1000.",
        "hackathon_fit_score = novelty_1to5 + demo_feasibility_1to5 + israel_fit_1to5 + trl_fit_1to5 on every route.",
        "trl_fit_1to5 follows TRL exactly: 2→3, 3–5→5, 6→4, 7→2, 8–9→1.",
        "route_matrix.price_usd_per_kg is the ranking price. route_value and the products table keep the catalogue price. They differ where the price_harmonised flag is set.",
        "Ranked views are the database view order, exported as route id lists. Filtering in the site keeps that order until you sort a column.",
    ]


def legend_for(table: str, columns: list[str]) -> dict:
    out = {}
    for col in columns:
        label, group, text = LEGEND.get(
            f"{table}.{col}",
            LEGEND.get(col, (col.replace("_", " "), "Other", f"Column {col} on {table}, exported as stored.")),
        )
        out[col] = {"label": label, "group": group, "text": text}
    return out


def json_safe(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def write_json(path: Path, payload) -> None:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(raw, encoding="utf-8")
    json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    db_path = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "sidestream.db")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / "data")
    if not db_path.exists():
        raise SystemExit(f"database not found: {db_path}")
    out_dir.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(db_path)
    cur = con.cursor()
    notes = check_identities(cur)

    counts = {}
    legend = {}
    for filename, table, _id in TABLES:
        cols, rows = fetch_table(cur, table)
        safe_rows = [[json_safe(v) for v in row] for row in rows]
        write_json(out_dir / f"{filename}.json", {"columns": cols, "rows": safe_rows})
        counts[filename] = len(safe_rows)
        legend[filename] = legend_for(table, cols)
        print(f"{filename}: {len(safe_rows)} rows, {len(cols)} columns")

    rv_cols, rv_rows = fetch_table(cur, "route_value")
    # route_value is a view; PRAGMA table_info works for views in SQLite.
    write_json(
        out_dir / "route_value.json",
        {"columns": rv_cols, "rows": [[json_safe(v) for v in row] for row in rv_rows]},
    )
    counts["route_value"] = len(rv_rows)
    legend["route_value"] = legend_for("route_value", rv_cols)
    print(f"route_value: {len(rv_rows)} rows, {len(rv_cols)} columns")

    view_order = {}
    view_meta = []
    for view in VIEWS:
        ids = [r[0] for r in cur.execute(view["sql"])]
        view_order[view["id"]] = ids
        view_meta.append(
            {
                "id": view["id"],
                "title": view["title"],
                "description": view["description"],
                "count": len(ids),
            }
        )
        print(f"{view['id']}: {len(ids)}")
    write_json(out_dir / "view_order.json", view_order)

    meta = {
        "title": "SideStream Hack 2026",
        "event": "Technion, 26–27 November 2026",
        "place": "Carasso Center, Technion. Faculties: Biotech & Food Engineering, Chemical Engineering, Materials Science & Engineering.",
        "format": "Each table file is {columns, rows}. rows are arrays in columns order. JSON null is a database NULL. Numbers are unchanged SQLite values (integral floats are written as integers). Nothing is imputed.",
        "counts": counts,
        "views": view_meta,
        "legend": legend,
        "flags": FLAG_GLOSS,
        "notes": notes,
        "sponsors": ["Tnuva", "NVIDIA", "Strauss", "Magnum (TMICC Israel)", "CBC Israel", "Tosaf"],
    }
    write_json(out_dir / "meta.json", meta)
    print("wrote", out_dir)


if __name__ == "__main__":
    main()
