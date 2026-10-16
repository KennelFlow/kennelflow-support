import {models, collections} from './schema.mjs';
export {models, collections};
export const employeeRead = ['dogs','healthRecords','tasks','training','kennels','groomingRecords','feedingPlans','supplementRecords','calendarEvents','employeeActivity','staffTimeEntries','kennelCareSessions','dailyDutyShifts','dailyDutyTemplates','dailyDutyRecords'];
export const employeeWrite = ['tasks','training','groomingRecords','kennelCareSessions','dailyDutyRecords'];
export const canRead = (role,type) => Object.hasOwn(collections,type) && (['owner','admin'].includes(role) || ['staff','viewer'].includes(role) && employeeRead.includes(type));
export const canWrite = (role,type) => Object.hasOwn(collections,type) && (['owner','admin'].includes(role) || role === 'staff' && employeeWrite.includes(type));
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isoDate = date => new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z');
export function newRecord(model, makeUUID = () => crypto.randomUUID()) {
  const record = {};
  for (const field of models[model] || []) {
    if (field.optional) continue;
    const value = field.default;
    record[field.key] = value === '$uuid' ? makeUUID() : value === '$now' ? isoDate(Date.now()) : value !== undefined ? structuredClone(value) : field.options ? field.options[0] : field.type === 'String' ? '' : field.type === 'Bool' ? false : field.type === 'Date' ? isoDate(Date.now()) : field.type === 'UUID' ? '' : field.type.startsWith('[') ? [] : 0;
  }
  return record;
}
export function validateModel(model, record, path = '') {
  if (!models[model]) return 'Unknown record type';
  if (!record || typeof record !== 'object' || Array.isArray(record)) return path + ' must be a record';
  for (const field of models[model]) {
    const value = record[field.key], key = path + field.key;
    if (value == null) { if (!field.optional) return key + ' is required'; continue; }
    const error = validateValue(field, value, key);
    if (error) return error;
  }
  return null;
}
export function validateValue(field, value, key = field.key) {
  if (field.options) return field.options.includes(value) ? null : key + ' has an invalid selection';
  if (models[field.type]) return validateModel(field.type, value, key + '.');
  if (field.type.startsWith('[') && !field.type.includes(':')) {
    if (!Array.isArray(value) || value.length > 10000) return key + ' must be a list';
    for (let i = 0; i < value.length; i++) {
      const error = validateValue({type:field.type.slice(1,-1)}, value[i], key+'['+i+']');
      if (error) return error;
    }
    return null;
  }
  const valid = field.type === 'String' ? typeof value === 'string' && value.length <= 250000 : field.type === 'UUID' ? uuid(value) : field.type === 'Bool' ? typeof value === 'boolean' : field.type === 'Date' ? typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value)) : ['Int','Int64'].includes(field.type) ? Number.isSafeInteger(value) : field.type === 'Double' ? typeof value === 'number' && Number.isFinite(value) : false;
  return valid ? null : key + ' has an invalid value';
}
const numericNameSorter = new Intl.Collator(undefined, {numeric:true,sensitivity:'base'});
const directoryTypes = new Set(['dogs','puppies','litters','kennels','equipment','clients','customers',
 'scanFolders','inventoryLocations','inventoryItems','smartPlacements','smartTags','clinics',
 'employeeProfiles','dailyDutyTemplates','dailyDutyShifts','feedingPlans','supplementRecords']);
export function compareDisplayRecords(a,b,type) {
 // Directory-style lists sort naturally (Run 2 before Run 10) without changing
 // the underlying IDs, cloud revisions, or date-based activity ledgers.
 if(directoryTypes.has(type)) {
   const first=recordName(a.record),second=recordName(b.record);
   const byName=numericNameSorter.compare(first,second);
   if(byName!==0)return byName;
 }
 const byDate=String(b.updated_at||'').localeCompare(String(a.updated_at||''));
 return byDate!==0?byDate:String(a.id||'').localeCompare(String(b.id||''));
}
export function recordName(record) {
  return record?.name || record?.callName || record?.title || record?.taskTitle || record?.petName || record?.subjectName || record?.dogName || record?.customerName || record?.staffName || record?.expenseDescription || record?.litterName || 'Untitled record';
}
export function normalizedRow(row) {
  const type = ['dog','android.Dogs'].includes(row.type) ? 'dogs' : row.type;
  let record = row.data?.record || row.data?.dog;
  if (type === 'dogs' && row.data?.platform === 'android' && record) {
    record = {...newRecord('Dog'), id:row.id, name:record.title || '', breed:record.breed || '', sex:record.sex || '', dateOfBirth:isoDate(Number(record.dateMillis) || 0), registeredName:record.registeredName || '', color:record.coatColor || '', registrationNumber:record.registration1 || '', sire:record.sire || '', dam:record.dam || '', notes:record.detail || '', ...(record.coatLength ? {coat:record.coatLength} : {}), ...(record.registry1 ? {registrationOrganization:record.registry1} : {})};
  }
  return {...row, id:typeof row.id==='string'?row.id.toLowerCase():row.id, type, revision:Number(row.revision), record};
}
