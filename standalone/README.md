## Version 1.3 — fixed destination, compact importer

The destination is now fixed in app.mjs to wampanoag_places_agol_coordinates/FeatureServer/0 at services3.arcgis.com/zrjd7IdrONctjbYR. There is no visible URL or Connect button. After AGOL authentication, startup connects automatically and checks the required editable Text field moshup_site. No field is skipped or created automatically. Existing IDs remain unchanged.

The map uses this same layer for Category and Moshup features filters. If absent from the existing web map, the app adds it at runtime with its service defaults and hides the former configured import layer if present. This changes only the displayed app, not the saved web map. To customize new-layer symbols/popups permanently, configure it in your AGOL web map. Other map layers remain as configured.

Replace the entire standalone folder and push to GitHub. Versioned module URLs avoid mixing previous scripts. Configuration for OAuth and web map still comes from ../cdn/7/config.json. No live private-layer or OAuth test was possible here.

Earlier version notes below describe superseded behavior where they conflict with this section.

## Version 1.2: editable destination and cache refresh

Destination controls are enabled independently of map startup; Connect authenticates before loading the selected layer. HTML references versioned app, CSS and core module URLs to avoid mixing old cached code with the updated form. The importer heading displays v1.2. If an existing service worker still serves old HTML, use an InPrivate window or clear this site's stored data. The map and import destination remain separate.

## Update: selectable destination and required Moshup column

The importer now starts with an editable destination URL (prefilled from the existing configuration) and a Connect target layer button. Select a layer each session. Changing the URL clears the connection, mapping, report and preview so a stale preview cannot write to another destination. The selected CSV remains available. Both destination controls and import controls are locked during requests; collapse/reopen remains available.

moshup_site is required in the CSV and as an editable Text field in the selected destination. Nothing is silently skipped and no schema changes are performed by the app. Add a nullable Text field named moshup_site in AGOL if missing, then reconnect. Existing ID rows remain skipped, so this does not backfill existing records. Map filters still operate on the original web-map layer, independently of the import destination; importing to another layer does not add that layer to the map.

Replace the standalone folder in the GitHub checkout and commit/push. Existing config and OAuth Client ID remain unchanged. Live private service and browser testing remain outstanding.

# Standalone sacred sites app

A buildless ArcGIS Maps SDK for JavaScript 4.34 app. Serve this repository over HTTPS and open `standalone/`. The existing Experience Builder app at the repository root remains intact. No npm or Node installation is needed to host this app.

## Configuration and authentication

This app reads the existing `../cdn/7/config.json` for the portal URL, public OAuth Client ID, web map ID, target layer URL, and print service. Keep this exported configuration and its paths available. No client secret is used. Register the deployed `https://liubovd.github.io/custom_app_with_csv-layer-updater/standalone/` redirect URL with that AGOL application before testing sign-in. Authentication uses ArcGIS IdentityManager and the organization's sign-in page. AGOL sharing and edit permissions remain authoritative.

## Controls

Category and Moshup features are independent and combine with AND. All features removes only the Moshup restriction; existing web-map definition expressions are retained. Moshup only matches the actual `moshup_site` field against the literal text `yes`. If missing, that control is disabled with a message. No layer visibility control is included. Basemaps, Legend, Print and Import CSV open one panel at a time. Collapse/reopen retains importer state while the page stays open.

CSV headers: id,name,category,access,town,state,region,geocode_address,latitude,longitude,coord_basis,location_note,description,source_url,coord_status,coord_source_url,coord_review_note. Required additional column: moshup_site. Map it to an existing editable Text field; coded-value domains still apply. The app does not alter the layer schema or bypass domains. Longitude/latitude must be WGS84 decimal degrees. Points are projected to the target SR using projectOperator. Default equation-based datum transformation only; no survey-grade/grid transformation claim.

Importer supports 500 rows/5 MB and up to 50,000 visible target records. It queries a separate unfiltered FeatureLayer so the UI category/Moshup selection does not affect duplicate checks. It cannot see records hidden by server-side access controls or view definitions. Ensure editors can query every relevant ID; a unique ID constraint is recommended for concurrent users. Only addFeatures is used, never updates or deletes. Invalid rows are excluded; duplicate new IDs invalidate every occurrence. Preview expires after five minutes; a fresh snapshot check precedes save. A requested rollback does not guarantee atomicity on every service: inspect report/service after incomplete or uncertain outcomes before retrying.

## Review / deployment

Merge the feature branch to deploy via the existing GitHub Pages main-branch workflow. The old root app remains the default; test the new /standalone/ URL first. Sign in and verify private map access, category/Moshup intersection, basemap choice, collapse/reopen before any import, field mappings, and a preview of known existing IDs. Only test a real add with an intended new record. The existing root service worker may affect cached files; test in a fresh InPrivate window if necessary.

Validation performed: JavaScript syntax, filter SQL composition/escaping, Moshup attribute preservation, existing-ID skip, and reused import-core regression checks. Browser SDK rendering, OAuth redirect and real private-layer edits have not been tested in this environment.
