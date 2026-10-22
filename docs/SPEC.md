# SideStream Hack 2026 waste-stream matrix (Technion, Carasso Center; faculties: Biotech & Food Eng, Chemical Eng, Materials Sci & Eng)

## Phase 1: waste streams (target 1,000 unique, specific streams)
One CSV per sector shard in /workspace/sidestream/shards/streams_<SECTOR>.csv, UTF-8, header exactly:
id,stream_name,source_industry,sector,description,main_components,moisture_pct,physical_form,global_availability_t_per_yr,israel_availability_t_per_yr,availability_basis,geographic_concentration,typical_site_output_t_per_yr,seasonality,current_fate,current_disposal_cost_usd_per_t,current_sale_value_usd_per_t,hazard_class,logistics_difficulty_1to5,regulatory_notes,source_urls,confidence_1to5,notes

Rules:
- id = <SECTOR>-0001 etc.
- Streams must be specific (e.g. "olive mill wastewater (alpechin)", "spent brewer's grain", "red mud from Bayer alumina"), not generic ("food waste").
- Numbers: use sourced figures where found (put URLs in source_urls, ';'-separated). If estimated, set availability_basis to "estimate" and explain basis in notes. Leave blank rather than invent. Never fabricate a source.
- geographic_concentration: one of point_source_large | clustered | many_small | diffuse.
- confidence_1to5: 5 = solid sourced numbers, 1 = rough guess.
- Numeric columns contain only numbers (no units, no ranges: use midpoint and put range in notes).
- Dedupe within your shard; avoid streams clearly belonging to another sector's shard.

Sectors:
- FOODAG: food & beverage processing, agriculture, livestock, fisheries/aquaculture
- CHEMBIO: chemicals, petrochem/refining, pharma, fermentation/biotech, cosmetics, pulp & paper, forestry, wood
- MATMIN: mining, metals, smelting, cement/construction & demolition, glass, ceramics, energy (ash, slag, gypsum), batteries
- URBANX: municipal solid waste fractions, wastewater/sludge, textiles, plastics, rubber/tyres, e-waste, packaging, desalination brine, hospitality/retail

## Phase 2 (later): use-case cells, each cell keeps separate parameters for later weighting.

### Creativity requirement (from Beny)
Use cases must go well beyond the obvious (compost, animal feed, biogas, incineration, landfill cover, generic "filler").
For every stream, deliberately generate non-obvious, high-value routes by thinking in terms of:
- the stream's specific molecules/structures (e.g. chitin, lignin, pectin, keratin, silica, rare earths, polyphenols, collagen, cellulose nanofibers, specific ions)
- cross-domain applications: biomedical/scaffolds, electronics (battery anodes, supercapacitor carbons, dielectrics), catalysts/sorbents, precision fermentation feedstock, cosmetics/nutraceutical actives, advanced materials (aerogels, bioplastics, mycelium composites, geopolymers), sensors, pigments/dyes, 3D-printing feedstocks, water treatment, agri-biostimulants, carbon capture/mineralization
- combining two streams (industrial symbiosis), and using the stream as a process utility (heat, solvent, reagent, microbial inoculum)
Each cell carries novelty_1to5 (1 = textbook/common, 5 = little or no commercial precedent) alongside the value parameters, so obvious and creative routes can be filtered separately. Creative does not mean fictional: each needs a plausible mechanism and, ideally, a paper/patent/startup reference.
