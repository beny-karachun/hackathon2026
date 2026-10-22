# ROUTE_SPEC — SideStream Hack 2026, Phase 2 (use-case cells)

You are a batch worker. Input: `/workspace/sidestream/routes/batches/batch_XX.json` (≈47 streams).
Output: **`/workspace/sidestream/routes/out/routes_batch_XX.csv`** (same XX). `db/build.py` ingests every
`routes_batch_*.csv` on each run, so the file must be valid UTF-8 CSV with the exact header below.

## 1. What is in a batch file
For each stream:
- `stream`: the full DB record (ids, availability, disposal cost, hazard, notes, `parent_stream_id`, `is_rollup`, `availability_unit`).
- `components`: controlled-vocabulary components (`generic=1` means a weak signal such as protein, carbon, water, or salts).
- `sponsor_links` and `already_done_warnings`: hackathon sponsors (CBC, Strauss, Tnuva, Tosaf, Magnum/TMICC, NVIDIA) linked to the stream.
- `candidate_products`: up to 40 catalogue products that share ≥1 component, ranked by `match_score × ln(1+price)`.
  Treat them as **suggestions only**. They come from keyword overlap and include false positives, so judge each one chemically.
  `price_scale = research_quantity` means a gram- or lab-scale price (for example ZIF-8 at $47/g or silk fibroin). Never use such a price as a bulk value. If you
  use the product, either choose a bulk-equivalent product or state the scale in `notes`.

## 2. Output columns (header, in this order)
```
route_id,stream_id,product_id,new_product_name,new_product_family,new_product_price_usd_per_kg,new_price_basis,new_price_source,route_origin,partner_stream_id,pretreatment_steps,key_process,byproducts,mechanism,yield_kg_per_kg_waste,process_cost_usd_per_kg_waste,capex_class,trl_1to9,novelty_1to5,demo_feasibility_1to5,israel_fit_1to5,co2_avoided_kg_per_kg,sponsor_fit,references,confidence_1to5,notes
```
| column | rule |
|---|---|
| route_id | `RXX-0001`, `RXX-0002`… (XX = batch number). Unique within the file. |
| stream_id | Must be an id from your batch. |
| product_id | An existing catalogue id (`P0123`), or `NEW` for a product not in the catalogue. |
| new_product_* / new_price_basis / new_price_source | Fill these **only** when product_id=NEW. Price is in USD/kg of product. Basis is `sourced` or `estimate`; for an estimate, show the working. Source is a URL. |
| route_origin | `candidate` (taken from candidate_products), `creative` (your own non-obvious idea), or `symbiosis` (combines this stream with another DB stream). |
| partner_stream_id | Required when route_origin=symbiosis. Use any DB stream id (it does not have to be in your batch; see `db/streams.csv`). |
| pretreatment_steps | Short chain, e.g. `dewater → dry 60 °C → mill <500 µm`. |
| key_process | The core unit operation(s), e.g. `alkaline deacetylation 50% NaOH 100 °C`. |
| byproducts | Co-products or residues (they are candidates for further routes). |
| mechanism | 1–2 sentences of chemistry/biology explaining why this works. |
| yield_kg_per_kg_waste | kg product per kg of waste **as received** (wet basis). Account for moisture_pct. |
| process_cost_usd_per_kg_waste | Opex per kg waste as received. Leave blank rather than guess. |
| capex_class | `A` <$1M (bench/pilot, container scale); `B` $1–10M; `C` $10–100M; `D` >$100M. |
| trl_1to9, novelty_1to5, demo_feasibility_1to5, israel_fit_1to5, confidence_1to5 | Integers; see the rubrics in §4. |
| co2_avoided_kg_per_kg | kg CO2e avoided per kg waste versus the current fate. Leave blank if there is no defensible basis. |
| sponsor_fit | Free text: which sponsor would care and why (or blank). |
| references | Space-separated URLs or DOIs (paper, patent, company). |
| notes | Assumptions, unit caveats, scale caveats, and "already commercial" flags. |

`build.py` computes `gross_usd_per_kg_waste = price × yield` and `net = gross − process_cost` in the view `route_value`,
so every route needs a yield and a price before it can be ranked.

## 3. How many routes per stream and what kind
- Give each stream **4–8 routes**. Include at least **2 creative or symbiosis routes**, and at most 2 textbook routes (compost, feed, biogas, fuel, landfill cover, generic filler).
  A textbook route earns its place only when it is the realistic baseline, and then it gets novelty 1.
- Child streams (`parent_stream_id` set) may reuse the parent's routes. Add only the routes that are specific to the child (site, sponsor, or purity).
- Gas streams (`availability_unit` = `t/yr (gas mass)`) need gas-appropriate routes: CO2 mineralisation, gas fermentation, e-fuels, and so on.

### Creativity rules (from SPEC.md, Beny)
Use cases must go well beyond the obvious (compost, animal feed, biogas, incineration, landfill cover, generic "filler").
For every stream, deliberately generate non-obvious, high-value routes by thinking in terms of:
- the stream's specific molecules and structures (e.g. chitin, lignin, pectin, keratin, silica, rare earths, polyphenols, collagen, cellulose nanofibers, specific ions)
- cross-domain applications: biomedical/scaffolds, electronics (battery anodes, supercapacitor carbons, dielectrics), catalysts/sorbents, precision fermentation feedstock, cosmetics/nutraceutical actives, advanced materials (aerogels, bioplastics, mycelium composites, geopolymers), sensors, pigments/dyes, 3D-printing feedstocks, water treatment, agri-biostimulants, carbon capture/mineralization
- combining two streams (industrial symbiosis), and using the stream as a process utility (heat, solvent, reagent, microbial inoculum)

Every cell carries novelty_1to5 so obvious and creative routes can be filtered separately. **Creative does not mean fictional.** Each route needs a
plausible mechanism and, ideally, a paper, patent, or startup reference. Never invent numbers or sources. Leave a field blank instead and explain why in `notes`.

### Sponsor "already done" rule (hackathon requirement: ideas must not already be on the market)
If a route is **already commercialised by the linked sponsor**, set **novelty_1to5 = 1** and start `notes` with
`ALREADY DONE BY <sponsor>: …`. This applies to anything listed in `already_done_warnings`, and to any other commercial practice you find. Known examples:
- CBC (Coca-Cola Israel): spent-grain cartons/packaging
- Tosaf: coffee-ground and eggshell filled polymer compounds
- Strauss: coffee-residue boilers and biogas
- Tnuva: COW-water reuse as process water, and whey exosomes (with EXOSOMM)
- Also check whether the route is already commercial elsewhere. If it is, novelty is ≤2.

For sponsor-linked streams, aim for at least 2 routes that go *beyond* what the sponsor already does, and fill in `sponsor_fit`.

## 4. Scoring rubrics (use these exactly so batches are comparable)

**trl_1to9** (for this stream → product, not the product in general)
1 basic principle observed · 2 concept formulated · 3 lab proof of concept on this or a very similar waste · 4 lab validation on the real stream ·
5 validated in a relevant environment (bench or pilot on real waste) · 6 pilot demonstrated · 7 demo plant · 8 first commercial plant · 9 widespread commercial practice.

**novelty_1to5**
1 textbook or commercial practice (including sponsor "already done") · 2 commercial niche or several companies · 3 published and piloted but rare in industry ·
4 a few papers or patents only, no commercial precedent · 5 little or no precedent (a new combination or mechanism) that still has a plausible mechanism.

**demo_feasibility_1to5** (can a student team show a convincing proof at a 48 h hackathon or in a Technion lab within weeks?)
1 needs a plant, hazardous permits, or months · 2 needs specialised equipment (autoclave >10 bar, a glovebox, MOCVD) · 3 standard lab with some special gear (furnace, HPLC, bioreactor) ·
4 standard wet lab, done in days · 5 benchtop in hours (e.g. extraction + colour/precipitate test, simple film casting).

**israel_fit_1to5**
1 the stream is negligible in Israel, or the product market is irrelevant · 2 small Israeli volume or import-dependent inputs · 3 a moderate stream exists, or there is a clear local market ·
4 a significant Israeli stream plus a local buyer or industry (Dead Sea, desal, dairy, citrus, ICL, Bazan, pharma) · 5 a top Israeli stream with a sponsor or industrial partner and a strategic need (water, energy, food security, defence/hi-tech supply).

**confidence_1to5** (in the numbers you entered)
1 order-of-magnitude guess, no source · 2 analogous-stream estimate with working · 3 one source for the key numbers (yield or price) · 4 sources for both yield and price on this stream type ·
5 published techno-economics or plant data for this exact route.

**capex_class**: A <$1M · B $1–10M · C $10–100M · D >$100M (for a first plant at typical Israeli site scale).

### Calibration examples (qualitative anchors; the scores are the point, not the numbers)
1. **Spent coffee grounds (Strauss) → steam/boiler fuel or biogas.** route_origin=candidate, TRL 9, novelty 1, notes `ALREADY DONE BY Strauss: coffee residue fired in boilers/biogas`,
   demo 5, israel_fit 4, capex B. This is a baseline row, not a pitch.
2. **Shrimp/crab shells → chitosan → chitosan-nanofibre hemostatic or antibacterial film.** route_origin=candidate (chitosan) or creative (film application),
   TRL 9 for bulk chitosan and 4–5 for the nanofibre film, novelty 2 and 3–4 respectively, demo 4 (deacetylation plus film casting in a few days), israel_fit 2 (small Israeli shellfish volume),
   confidence 3 if the chitosan yield and price are sourced.
3. **Phosphogypsum (ICL Rotem) + SWRO desalination brine → symbiosis.** Brine Mg/alkalinity plus PG sulfate → REE leach and CO2-mineralised carbonate/ammonium sulfate.
   route_origin=symbiosis, partner_stream_id=URBANX-0001, TRL 3–4, novelty 4, demo 3, israel_fit 5, capex C, confidence 2 if only lab papers exist. Leave yields blank
   unless a paper gives REE recovery per t PG.
4. **COW water (Tnuva) → process-water reuse.** Novelty 1 (`ALREADY DONE BY Tnuva`). A new route such as lactose/mineral polishing to a defined-media feed for precision fermentation
   → novelty 3–4, TRL 4, demo 4, israel_fit 5, sponsor_fit "Tnuva + Carasso fermentation facility".

## 5. Checklist before writing the file
- The header matches §2 exactly. Numeric columns hold numbers only, with no units, ranges, or "~"; use a range midpoint and put the range in notes.
- Price and yield units are kg product per kg waste as received, and USD/kg product.
- No research_quantity price is used as a bulk price without a note.
- Every NEW product has a price and either a source or an estimate with its working.
- Sponsor "already done" routes have novelty 1 and the `ALREADY DONE BY` note.
