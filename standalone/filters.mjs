export function filterSQL(base,categoryField,category,moshupField,onlyMoshup){
 const field=n=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n||''))throw Error('Filter field is missing or invalid.');return n;};
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const clauses=base?[`(${base})`]:[];
 if(category)clauses.push(`${field(categoryField)} = ${quote(category)}`);
 if(onlyMoshup)clauses.push(`${field(moshupField)} = 'yes'`);
 return clauses.join(' AND ');
}
