export const collections = ['dogs','litters','healthRecords','customers','tasks','training','equipment','kennels','puppies','puppyMedicalRecords','breedingRecords','documents','contracts','payments','groomingRecords','feedingPlans','supplementRecords','semenRecords','scanFolders','scannedReports','clients','boardingRecords','calendarEvents','employeeActivity','staffTimeEntries','kennelCareSessions','expenses','dailyDutyShifts','dailyDutyTemplates','dailyDutyRecords','smartTags','inventoryLocations','inventoryItems','travelManifests','inventoryScans','inventoryReports','smartPlacements','maintenanceRecords','ofaXrays','clinics','vetServices','employeeProfiles','messages','locations','pedigreeAncestors','pedigreeScans'];
export const employeeRead = ['dogs','healthRecords','tasks','training','kennels','groomingRecords','feedingPlans','supplementRecords','calendarEvents','employeeActivity','staffTimeEntries','kennelCareSessions','dailyDutyShifts','dailyDutyTemplates','dailyDutyRecords'];
export const employeeWrite = ['tasks','training','groomingRecords','kennelCareSessions','dailyDutyRecords'];
export const managedRoles = ['admin','staff','viewer'];
export function canRead(role, collection) { return collections.includes(collection) && (['owner','admin'].includes(role) || (['staff','viewer'].includes(role) && employeeRead.includes(collection))); }
export function canWrite(role, collection) { return collections.includes(collection) && (['owner','admin'].includes(role) || (role === 'staff' && employeeWrite.includes(collection))); }
export function canManage(actor, targetRole, desiredRole = 'staff') { return managedRoles.includes(desiredRole) && targetRole !== 'owner' && (actor === 'owner' || (actor === 'admin' && ['staff','viewer'].includes(targetRole) && ['staff','viewer'].includes(desiredRole))); }
export function validEmail(email) { return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export function validPassword(password) { return typeof password === 'string' && password.length >= 16 && password.length <= 256; }
export function validUUID(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function validateRecord(input, id) {
 if (!input || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !collections.includes(input.type)) return false;
 const data = input.data;
 if (!data || data.platform !== 'ios' || data.collection !== input.type || typeof data.record !== 'object' || data.record === null || Array.isArray(data.record) || String(data.record.id).toLowerCase() !== id.toLowerCase()) return false;
 return input.deletedAt == null || (typeof input.deletedAt === 'string' && Number.isFinite(Date.parse(input.deletedAt)));
}

