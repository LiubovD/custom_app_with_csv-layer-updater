                                                                                                            
export function parseCSV (text        )                                          {
  text = text.replace(/^\uFEFF/, '')
  const records             = []; let row           = []; let cell = ''; let quoted = false; let closed = false
  const push = () => { row.push(cell); cell = ''; closed = false }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } }
      else cell += ch
    } else if (ch === ',') push()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      push(); if (row.some(v => v !== '')) records.push(row); row = []
    } else if (ch === '"') {
      if (cell || closed) throw new Error('Invalid quote in CSV.')
      quoted = true
    } else { if (closed) throw new Error('Unexpected characters after closing CSV quote.'); cell += ch }
  }
  if (quoted) throw new Error('Unclosed CSV quote.')
  push(); if (row.some(v => v !== '')) records.push(row)
  if (records.length < 2) throw new Error('CSV must have a header and at least one data row.')
  const headers = records.shift() .map(v => v.trim())
  if (headers.some(v => !v) || new Set(headers).size !== headers.length) throw new Error('CSV headers must be nonempty and unique.')
  records.forEach((r, i) => { if (r.length !== headers.length) throw new Error(`Data row ${i + 1}: wrong number of columns.`) })
  if (records.length > 500) throw new Error('Maximum 500 data rows per upload.')
  return { headers, rows: records }
}
export function convert (raw        , f           )                  {
  if (raw.trim() === '') throw new Error(`${f.name}: empty value.`)
  let value                 
  if (f.type === 'string') {
    value = raw
    if (f.length && value.length > f.length) throw new Error(`${f.name}: exceeds ${f.length} characters.`)
  } else if (['integer', 'small-integer', 'double', 'single'].includes(f.type)) {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim())) throw new Error(`${f.name}: invalid number.`)
    value = Number(raw)
    if (!Number.isFinite(value)) throw new Error(`${f.name}: invalid number.`)
    if (['integer', 'small-integer'].includes(f.type)) {
      const bound = f.type === 'integer' ? 2147483648 : 32768
      if (!Number.isInteger(value) || value < -bound || value >= bound) throw new Error(`${f.name}: integer out of range.`)
    }
  } else throw new Error(`${f.name}: unsupported field type ${f.type}.`)
  if (f.domain?.type === 'coded-value' && !f.domain.codedValues.some((d     ) => d.code === value)) throw new Error(`${f.name}: use an allowed domain code.`)
  if (f.domain?.type === 'range' && (value < f.domain.minValue || value > f.domain.maxValue)) throw new Error(`${f.name}: outside domain range.`)
  return value
}
export function coordinates (x        , y        )                   {
  const lon = Number(convert(x, { name: 'Longitude', type: 'double' }))
  const lat = Number(convert(y, { name: 'Latitude', type: 'double' }))
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error('Coordinates must be decimal degrees: longitude -180..180, latitude -90..90.')
  return [lon, lat]
}
export function uniqueKey (raw        , f           )         {
  const value = convert(raw.trim(), f)
  return String(value)
}

export const REQUIRED_CSV_FIELDS = ['id','name','latitude','longitude']
export const CSV_FIELDS = ['id', 'name', 'category', 'access', 'town', 'state', 'region', 'geocode_address', 'latitude', 'longitude', 'coord_basis', 'location_note', 'description', 'source_url', 'coord_status', 'coord_source_url', 'coord_review_note']
                                                                                                         
                                                                                      
export function suggestMapping (fields               )                         {
  const result                         = {}
  for (const name of [...CSV_FIELDS, "moshup_site"]) {
    const exact = fields.filter(f => f.name.toLowerCase() === name)
    const aliases = fields.filter(f => f.alias?.toLowerCase() === name)
    const short = fields.filter(f => f.name.toLowerCase() === name.slice(0, 10))
    const matches = exact.length ? exact : aliases.length ? aliases : short
    if (matches.length === 1) result[name] = matches[0].name
  }
  // A target cannot receive two CSV columns, even when truncations collide.
  for (const name of Object.keys(result)) {
    if (Object.values(result).filter(v => v === result[name]).length > 1) {
      const target = result[name]
      for (const key of Object.keys(result)) if (result[key] === target) delete result[key]
    }
  }
  return result
}
export function schemaMapping (fields               , headers           , overrides                         = {})                              {
  const mapping                              = {}
  const choices = { ...suggestMapping(fields), ...overrides }
  const used = new Set        ()
  for (const name of [...CSV_FIELDS, ...(headers?.includes("moshup_site") ? ["moshup_site"] : [])].filter(n => !headers || headers.includes(n) || REQUIRED_CSV_FIELDS.includes(n))) {
    const matches = fields.filter(f => f.name === choices[name])
    if (matches.length !== 1) throw new Error(`Select a destination field for ${name} under Field mapping.`)
    const field = matches[0]
    if (field.editable === false || !['string', 'integer', 'small-integer', 'double', 'single'].includes(field.type)) throw new Error(`${field.name}: field must be editable text or a supported number type.`)
    if (name === 'id' && !['string', 'integer', 'small-integer'].includes(field.type)) throw new Error('The id field must be text or integer, not ObjectID or a floating-point field.')
    if (used.has(field.name)) throw new Error(`${field.name}: destination field is mapped more than once.`)
    used.add(field.name)
    mapping[name] = field
    if (headers && !headers.includes(name)) throw new Error(`CSV is missing the ${name} column.`)
  }
  return mapping
}
export function planAdditions (table                             , fields               , existingIds       , webMercator         , overrides                         = {}) {
  const mapping = schemaMapping(fields, table.headers, overrides)
  const existing = new Set        ()
  for (const id of existingIds) {
    if (id !== null && id !== undefined && String(id).trim() !== '') existing.add(uniqueKey(String(id), mapping.id))
  }
  const index = Object.fromEntries(Object.keys(mapping).map(name => [name, table.headers.indexOf(name)]))
  const seen = new Set        (); const report              = []
  const additions                                                                                                      = []
  table.rows.forEach((row, i) => {
    let id = row[index.id]?.trim() || ''
    try {
      id = uniqueKey(id, mapping.id)
      // Existing records are skipped before validating their CSV coordinates/attributes.
      if (existing.has(id)) { report.push({ row: i + 1, id, action: 'Skipped', reason: 'ID already exists in layer' }); return }
      if (seen.has(id)) throw new Error('Duplicate new ID in CSV; remove duplicate rows before importing.')
      seen.add(id)
      const [longitude, latitude] = coordinates(row[index.longitude], row[index.latitude])
      if (webMercator && Math.abs(latitude) > 85.05112878) throw new Error('Latitude outside Web Mercator limits.')
      const attributes                      = {}
      for (const name of Object.keys(mapping)) {
        const field = mapping[name]; const raw = name === 'id' ? row[index[name]].trim() : row[index[name]]
        if (raw.trim() === '') {
          if (field.type === 'string') attributes[field.name] = ''
          else if (field.nullable !== false) attributes[field.name] = null
          else throw new Error(`${field.name}: cannot be empty.`)
        } else attributes[field.name] = convert(raw, field)
      }
      for (const f of fields) {
        if (f.editable && f.nullable === false && !['oid', 'global-id'].includes(f.type) && f.defaultValue == null && attributes[f.name] === undefined) throw new Error(`New record requires additional field ${f.name}.`)
      }
      additions.push({ attributes, longitude, latitude, row: i + 1, id })
      report.push({ row: i + 1, id, action: 'Add', reason: 'New ID' })
    } catch (e) { report.push({ row: i + 1, id, action: 'Invalid', reason: e instanceof Error ? e.message : String(e) }) }
  })
  // Duplicate new IDs are ambiguous: invalidate every occurrence, including first.
  const duplicates = new Set(report.filter(r => r.reason.startsWith('Duplicate new ID')).map(r => r.id))
  for (const r of report) if (duplicates.has(r.id)) { r.action = 'Invalid'; r.reason = 'Duplicate new ID in CSV; remove duplicate rows before importing.' }
  return { additions: additions.filter(a => !duplicates.has(a.id)), report }
}

// Keep problems visible. Never collapse on file selection, preview, failed or uncertain saves.
export function shouldCollapse(enabled         , expected        , results                   , rows             )          {
  return enabled && expected > 0 && results.length === expected && results.every(r => !r.error) && rows.every(r => r.action !== 'Invalid')
}

export function validateProjectedPoint(point     , targetSR     )       {
  if (!point || point.type !== 'point' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Coordinate conversion failed; no points were saved.')
  if (!point.spatialReference || !point.spatialReference.equals(targetSR)) throw new Error('Coordinate conversion returned the wrong spatial reference; no points were saved.')
}
