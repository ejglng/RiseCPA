// NOTES
// The only file that knows Supabase exists. Screens import these functions.
// A SharePoint version can replace this file without changing a screen.
// Use this from Client Components ('use client'): the login session lives in the browser.

import 'client-only';
import { createClient } from '@supabase/supabase-js';

let sb = null;
let meCache = null;

// SETUP
export function initDataLayer({ url, anonKey, options } = {}) {
  url = url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  anonKey = anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new DataError('Need NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local or vercel', 'config');
  }
  sb = createClient(url, anonKey, options);
  meCache = null;
  sb.auth.onAuthStateChange(() => { meCache = null; });
  return true;
}

export class DataError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.cause = cause;
  }
}

function client() {
  if (!sb) initDataLayer();
  return sb;
}
function unwrap({ data, error }) {
  if (error) throw new DataError(error.message || 'Something went wrong', error.code, error);
  return data;
}
async function me() {
  if (!meCache) meCache = await getMyProfile();
  if (!meCache) throw new DataError('Log in and join a firm first', 'no_profile');
  return meCache;
}
function safeFileName(name) {
  return String(name || 'file').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120);
}
async function invokeFunction(name, body) {
  const { data, error } = await client().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try { message = (await error.context.json()).error ?? message; } catch { /* not JSON */ }
    throw new DataError(message, 'function', error);
  }
  return data;
}

// LOG IN/SIGN UP/NEW FIRM
export async function signIn(email, password) {
  unwrap(await client().auth.signInWithPassword({ email, password }));
  meCache = null;
  return getMyProfile();
}

export async function signUp({ email, password, fullName }) {
  const data = unwrap(await client().auth.signUp({
    email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: globalThis.location?.origin },
  }));
  return { needsEmailConfirmation: !data.session, userId: data.user?.id };
}

export async function joinFirm(inviteCode, fullName) {
  const data = unwrap(await client().rpc('join_firm', { p_invite_code: inviteCode, p_full_name: fullName }));
  meCache = null;
  return data;
}

export async function createFirm({ firmName, fullName, role = 'partner', theme = 'product' }) {
  const data = unwrap(await client().rpc('create_firm', {
    p_firm_name: firmName, p_full_name: fullName, p_role: role, p_theme: theme,
  }));
  meCache = null;
  return data;
}

export function onAuthChange(callback) {
  const { data } = client().auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

// STRUCTURE BUILDER, SETUP (ADMIN ONLY)
export async function getDepartments() {
  return unwrap(await client().from('departments')
    .select('id, code, name, lead_partner_id, default_publisher_id').order('name'));
}

export async function getFirmSetup() {
  const [departments, folders, accessRules, publishingRules, people] = await Promise.all([
    getDepartments(),
    client().from('folders').select('id, department_id, name, kind').order('name').then(unwrap),
    client().from('access_rules').select('*').then(unwrap),
    client().from('publishing_rules').select('*').order('category').then(unwrap),
    client().from('profiles').select('user_id, full_name, email, role, department_id, is_admin, is_away').order('full_name').then(unwrap),
  ]);

  const byDept = Object.fromEntries(departments.map((d) => [d.id, folders.filter((f) => f.department_id === d.id)]));
  const workingNames = (id) => byDept[id].filter((f) => f.kind === 'working').map((f) => f.name);
  const common = departments.length
    ? workingNames(departments[0].id).filter((n) => departments.every((d) => workingNames(d.id).includes(n)))
    : [];
  const overrides = Object.fromEntries(departments.map((d) => [d.id, {
    add: workingNames(d.id).filter((n) => !common.includes(n)), remove: [],
  }]));
  const publishedName = folders.find((f) => f.kind === 'published')?.name ?? 'Published Documents';
  return {
    firm: (await me()).firm, departments, folders, accessRules, publishingRules, people,
    folderTemplate: { names: common, publishedName, overrides },
  };
}

export async function saveDepartments(upserts = [], deleteIds = []) {
  const withId = upserts.filter((d) => d.id);
  const withoutId = upserts.filter((d) => !d.id);
  if (withId.length) unwrap(await client().from('departments').upsert(withId, { onConflict: 'id' }));
  if (withoutId.length) unwrap(await client().from('departments').insert(withoutId));
  if (deleteIds.length) unwrap(await client().from('departments').delete().in('id', deleteIds));
  return getDepartments();
}

export async function saveFolderTemplate({ names, publishedName, overrides = {} }) {
  const departments = await getDepartments();
  const existing = unwrap(await client().from('folders').select('id, department_id, name, kind'));
  const warnings = [];
  for (const d of departments) {
    const o = overrides[d.id] ?? { add: [], remove: [] };
    const wanted = [...new Set([...names, ...(o.add ?? [])])].filter((n) => !(o.remove ?? []).includes(n));
    const mine = existing.filter((f) => f.department_id === d.id);

    const pub = mine.find((f) => f.kind === 'published');
    if (pub && pub.name !== publishedName) {
      unwrap(await client().from('folders').update({ name: publishedName }).eq('id', pub.id));
    } else if (!pub) {
      unwrap(await client().from('folders').insert({ department_id: d.id, name: publishedName, kind: 'published' }));
    }
    const toAdd = wanted.filter((n) => !mine.some((f) => f.name === n));
    if (toAdd.length) {
      unwrap(await client().from('folders').insert(toAdd.map((name) => ({ department_id: d.id, name, kind: 'working' }))));
    }
    for (const f of mine.filter((f) => f.kind === 'working' && !wanted.includes(f.name))) {
      const { error } = await client().from('folders').delete().eq('id', f.id);
      if (error) warnings.push(`${d.name} › ${f.name} still holds documents, so it was kept.`);
    }
  }
  return { warnings };
}

export async function saveAccessRules(upserts = [], deleteIds = []) {
  const withId = upserts.filter((r) => r.id);
  const withoutId = upserts.filter((r) => !r.id);
  if (withId.length) unwrap(await client().from('access_rules').upsert(withId, { onConflict: 'id' }));
  if (withoutId.length) unwrap(await client().from('access_rules').insert(withoutId));
  if (deleteIds.length) unwrap(await client().from('access_rules').delete().in('id', deleteIds));
  return unwrap(await client().from('access_rules').select('*'));
}

export async function savePublishingRules(rules = [], deleteCategories = []) {
  if (rules.length) {
    unwrap(await client().from('publishing_rules')
      .upsert(rules.map(({ id, firm_id, ...r }) => r), { onConflict: 'firm_id,category', defaultToNull: false }));
  }
  if (deleteCategories.length) unwrap(await client().from('publishing_rules').delete().in('category', deleteCategories));
  return unwrap(await client().from('publishing_rules').select('*').order('category'));
}

export async function updatePerson(userId, { role, department_id, is_admin }) {
  const patch = Object.fromEntries(Object.entries({ role, department_id, is_admin }).filter(([, v]) => v !== undefined));
  return unwrap(await client().from('profiles').update(patch).eq('user_id', userId).select().single());
}

export function previewTemplate(template, sample = {}) {
  const part = (s) => String(s ?? '').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/[^A-Za-z0-9.-]/g, '');
  const s = { department: 'HR', category: 'Process Doc', title: 'Employee Handbook', version: 'v8', period: '2027-01', ...sample };
  return template
    .replaceAll('{department}', String(s.department).replace(/[^A-Za-z0-9-]/g, ''))
    .replaceAll('{category}', part(s.category)).replaceAll('{title}', part(s.title))
    .replaceAll('{version}', s.version).replaceAll('{period}', String(s.period).replace(/[^A-Za-z0-9-]/g, ''))
    .replace(/\{[^}]*\}/g, '').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
}

// LOAD SESSION, PARTNER ACCOUNT SETUP, ONBOARDING
export async function getSession() {
  return unwrap(await client().auth.getSession()).session;
}

export async function getMyProfile() {
  const session = await getSession();
  if (!session) return null;
  meCache = unwrap(await client().rpc('get_my_session'));
  return meCache;
}

export async function getAvailablePartners() {
  const { user_id } = await me();
  return unwrap(await client().from('profiles').select('user_id, full_name, department_id')
    .eq('role', 'partner').eq('is_away', false).neq('user_id', user_id).order('full_name'));
}

export async function setSecondaryPartner(partnerId) {
  const { user_id } = await me();
  unwrap(await client().from('profiles')
    .update({ secondary_partner_id: partnerId ?? null, partner_setup_at: new Date().toISOString() })
    .eq('user_id', user_id));
  meCache = null;
  return getMyProfile();
}

export async function markOnboarded() {
  const { user_id } = await me();
  unwrap(await client().from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', user_id));
  meCache = null;
}

// HOME, GLOBAL SEARCH, DOCUMENT UPDATE RECORDS
const DOC_COLUMNS = 'id, title, description, category, period, viewing_tag, department_tags, custom_tags, current_version, ' +
  'current_name, first_published_at, last_published_at, review_date, department:departments!documents_department_id_fkey(id, code, name)';

export async function searchDocuments({ query, departmentId, category, year, limit = 50 } = {}) {
  let q = client().from('documents').select(DOC_COLUMNS).eq('status', 'published');
  if (query?.trim()) q = q.textSearch('search', query.trim(), { type: 'websearch', config: 'english' });
  if (departmentId) q = q.contains('department_tags', [departmentId]);
  if (category) q = q.eq('category', category);
  if (year) q = q.like('period', `${year}%`);
  return unwrap(await q.order('last_published_at', { ascending: false }).limit(limit));
}

export async function getWhatsNew() {
  return unwrap(await client().from('announcements')
    .select('id, version, change_note, published_at, document:documents!announcements_document_id_fkey(id, title, current_name)')
    .order('published_at', { ascending: false }).limit(3));
}


export async function getNotifications({ unreadOnly = false } = {}) {
  let q = client().from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (unreadOnly) q = q.is('read_at', null);
  return unwrap(await q);
}

export async function markNotificationRead(id) {
  unwrap(await client().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id));
}

export async function getDocument(documentId) {
  const doc = unwrap(await client().from('documents')
    .select(`${DOC_COLUMNS}, status, filed_under:folders!documents_filed_under_folder_id_fkey(name), owner:profiles!documents_owner_id_fkey(full_name)`)
    .eq('id', documentId).maybeSingle());
  if (!doc) throw new DataError('Document not found', 'not_found');
  const current = unwrap(await client().from('document_versions')
    .select('id, version, file_name, storage_bucket, storage_path, change_note, approved_by, approved_at, group_note, published_at, publisher:profiles!document_versions_published_by_fkey(full_name)')
    .eq('document_id', documentId).eq('status', 'published').maybeSingle());
  let approvers = [];
  if (current?.approved_by?.length) {
    approvers = unwrap(await client().from('profiles').select('user_id, full_name').in('user_id', current.approved_by));
  }
  const reviewDue = doc.review_date ? new Date(doc.review_date) < new Date() : false;
  return { ...doc, current, approvers, reviewDue };
}

export async function getFileLink(version, { download = true } = {}) {
  const data = unwrap(await client().storage.from(version.storage_bucket ?? 'published')
    .createSignedUrl(version.storage_path, 60, download ? { download: version.file_name } : undefined));
  return data.signedUrl;
}

export async function getVersionHistory(documentId) {
  return unwrap(await client().from('document_versions')
    .select('id, version, status, file_name, storage_bucket, storage_path, change_type, change_note, published_at, superseded_at, publisher:profiles!document_versions_published_by_fkey(full_name)')
    .eq('document_id', documentId).neq('status', 'draft').order('published_at', { ascending: false }));
}

// WORKING FOLDERS
export async function getWorkingFolders() {
  return unwrap(await client().rpc('get_working_folders'));
}

export async function listWorkingFiles(folderId) {
  return unwrap(await client().from('documents')
    .select('id, title, description, status, created_at, versions:document_versions!document_versions_document_id_fkey(id, file_name, storage_bucket, storage_path, created_at)')
    .eq('folder_id', folderId).eq('status', 'draft').order('created_at', { ascending: false }));
}

export async function uploadWorkingFile(folderId, file, { title, description = '' } = {}) {
  const { firm } = await me();
  const folder = unwrap(await client().from('folders').select('id, department_id').eq('id', folderId).single());
  const path = `${firm.id}/${folderId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  unwrap(await client().storage.from('working').upload(path, file, { contentType: file.type || undefined }));
  try {
    const doc = unwrap(await client().from('documents')
      .insert({ folder_id: folderId, department_id: folder.department_id, title: title || file.name, description })
      .select('id').single());
    unwrap(await client().from('document_versions')
      .insert({ document_id: doc.id, file_name: file.name, storage_bucket: 'working', storage_path: path }));
    return { documentId: doc.id, storagePath: path };
  } catch (e) {
    await client().storage.from('working').remove([path]);   // don't leave an orphan file behind
    throw e;
  }
}

// SMART PUBLISH
export async function uploadDraftFile(file) {
  const { firm, user_id } = await me();
  const path = `${firm.id}/${user_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  unwrap(await client().storage.from('drafts').upload(path, file, { contentType: file.type || undefined }));
  return { storage_path: path, file_name: file.name };
}

export async function copyWorkingFileToDrafts(version) {
  const { firm, user_id } = await me();
  const path = `${firm.id}/${user_id}/${crypto.randomUUID()}-${safeFileName(version.file_name)}`;
  unwrap(await client().storage.from('working').copy(version.storage_path, path, { destinationBucket: 'drafts' }));
  return { storage_path: path, file_name: version.file_name };
}

// SMART PUBLISH (AI)
export async function suggestMetadata({ storage_path, file_name, description } = {}) {
  const { firm } = await me();
  if (!firm.ai_enabled) return null;
  return invokeFunction('smart-publish', { storage_path, file_name, description });
}

function toParams(fields, allowed) {
  return Object.fromEntries(allowed.filter((k) => fields[k] !== undefined).map((k) => [`p_${k}`, fields[k]]));
}
const PREVIEW_FIELDS = ['department_id', 'category', 'title', 'period', 'replaces_document_id', 'change_type',
  'starting_version', 'folder_id'];
const SUBMIT_FIELDS = ['title', 'department_id', 'category', 'folder_id', 'description', 'period',
  'replaces_document_id', 'change_type', 'change_note', 'starting_version', 'suggested_viewing_tag',
  'other_department_ids', 'owner_id', 'review_date', 'approver_note', 'custom_tags', 'storage_path', 'file_name',
  'chosen_partner_ids', 'ai_suggested', 'source_document_id', 'resubmit_of'];

export async function previewName(fields) {
  return unwrap(await client().rpc('preview_name', toParams(fields, PREVIEW_FIELDS)));
}

export async function getApprovalRoute(departmentId, category, changeType = 'new') {
  return unwrap(await client().rpc('get_approval_route', {
    p_department_id: departmentId, p_category: category, p_change_type: changeType,
  }));
}
export async function getFolders(departmentId) {
  let q = client().from('folders').select('id, department_id, name, kind').order('name');
  if (departmentId) q = q.eq('department_id', departmentId);
  return unwrap(await q);
}

export async function getPublishingRules() {
  return unwrap(await client().from('publishing_rules')
    .select('category, naming_template, required_fields, approvers_needed, named_approver_ids, default_viewing_tag').order('category'));
}

export async function submitDraft(fields, file) {
  let p = { ...fields };
  if (file) p = { ...p, ...(await uploadDraftFile(file)) };
  return unwrap(await client().rpc('submit_draft', toParams(p, SUBMIT_FIELDS)));
}

export async function resubmit(submissionId, fields, file) {
  return submitDraft({ ...fields, resubmit_of: submissionId }, file);
}

const SUBMISSION_COLUMNS = '*, department:departments!submissions_department_id_fkey(id, code, name), submitter:profiles!submissions_submitted_by_fkey(full_name), ' +
  'signoffs:review_signoffs!review_signoffs_submission_id_fkey(id, assigned_as, note, decision, signed_at, partner:profiles!review_signoffs_partner_id_fkey(full_name)), ' +
  'reviews!reviews_submission_id_fkey(id, decision, comment, edited_name, edited_version, group_note, created_at, partner:profiles!reviews_partner_id_fkey(full_name))';

export async function getMySubmissions() {
  const { user_id } = await me();
  return unwrap(await client().from('submissions').select(SUBMISSION_COLUMNS)
    .eq('submitted_by', user_id).order('updated_at', { ascending: false }));
}

// APPROVAL PROCESS
export async function chooseApprovers(submissionId, partnerIds) {
  return unwrap(await client().rpc('route_submission', { p_submission_id: submissionId, p_chosen_partner_ids: partnerIds }));
}

// PARTNER REVIEW
export async function getReviewQueue() {
  const { user_id } = await me();
  const rows = unwrap(await client().from('review_signoffs')
    .select(`id, assigned_as, note, created_at, covering_for:profiles!review_signoffs_covering_for_id_fkey(full_name),
             submission:submissions!review_signoffs_submission_id_fkey(id, title, category, status, proposed_name, proposed_version, change_type, created_at,
               department:departments!submissions_department_id_fkey(code, name), submitter:profiles!submissions_submitted_by_fkey(full_name))`)
    .eq('partner_id', user_id).is('signed_at', null).order('created_at'));
  return rows.filter((r) => r.submission?.status === 'under_review');
}


export async function getSubmission(submissionId) {
  const s = unwrap(await client().from('submissions').select(SUBMISSION_COLUMNS).eq('id', submissionId).maybeSingle());
  if (!s) throw new DataError('Submission not found', 'not_found');
  let replaces = null;
  if (s.replaces_document_id) {
    replaces = unwrap(await client().from('documents').select('id, title, current_version, current_name')
      .eq('id', s.replaces_document_id).maybeSingle());
  }
  const fileUrl = s.storage_path
    ? await getFileLink({ storage_bucket: 'drafts', storage_path: s.storage_path, file_name: s.file_name })
    : null;
  return { ...s, replaces, fileUrl };
}


export async function reviewSubmission(submissionId, { decision, comment, editedName, editedVersion, groupNote } = {}) {
  return unwrap(await client().rpc('review_submission', {
    p_submission_id: submissionId, p_decision: decision, p_comment: comment ?? null,
    p_edited_name: editedName ?? null, p_edited_version: editedVersion ?? null, p_group_note: groupNote ?? null,
  }));
}




// PUBLISH, UNPUBLISH, MINOR UPDATE SEND BACK
export async function getPublishQueue() {
  return unwrap(await client().from('submissions').select(SUBMISSION_COLUMNS)
    .eq('status', 'approved').order('updated_at'));
}

export async function publish(submissionId, { viewingTag, departmentIds, finalName } = {}) {
  return invokeFunction('publish', {
    submission_id: submissionId, viewing_tag: viewingTag, department_ids: departmentIds ?? null, final_name: finalName ?? null,
  });
}

export async function unpublish(documentId, mode = 'unpublished', reason = null) {
  return unwrap(await client().rpc('unpublish_document', { p_document_id: documentId, p_mode: mode, p_reason: reason }));
}

export async function sendBackForApproval(submissionId, reason) {
  return unwrap(await client().rpc('return_for_approval', { p_submission_id: submissionId, p_reason: reason }));
}


// SETTINGS, LOG OUT
export async function updateProfile({ fullName }) {
  const { user_id } = await me();
  unwrap(await client().from('profiles').update({ full_name: fullName }).eq('user_id', user_id));
  meCache = null;
  return getMyProfile();
}

export async function setAiEnabled(enabled) {
  const { firm } = await me();
  unwrap(await client().from('firms').update({ ai_enabled: enabled }).eq('id', firm.id));
  meCache = null;
}

export async function setAway(isAway) {
  const data = unwrap(await client().rpc('set_away', { p_is_away: isAway }));
  meCache = null;
  return data;
}

export async function signOut() {
  await client().rpc('log_sign_out');
  unwrap(await client().auth.signOut());
  meCache = null;
}
