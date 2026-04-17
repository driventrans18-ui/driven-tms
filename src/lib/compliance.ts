import { supabase } from './supabase'

export type ComplianceEntity = 'driver' | 'truck' | 'company'

export type ComplianceKind =
  | 'cdl'
  | 'medical_card'
  | 'hazmat_endorsement'
  | 'twic'
  | 'tsa_precheck'
  | 'annual_dot_inspection'
  | 'registration'
  | 'irp_apportioned_plate'
  | 'liability_insurance'
  | 'cargo_insurance'
  | 'ucr'
  | 'ifta_decal'
  | 'drug_alcohol_consortium'

export interface ComplianceItem {
  id: string
  entity_type: ComplianceEntity
  entity_id: string | null
  kind: ComplianceKind
  issued_at: string | null
  expires_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export const KIND_LABEL: Record<ComplianceKind, string> = {
  cdl: 'CDL',
  medical_card: 'DOT Medical Card',
  hazmat_endorsement: 'HazMat Endorsement',
  twic: 'TWIC',
  tsa_precheck: 'TSA PreCheck',
  annual_dot_inspection: 'Annual DOT Inspection',
  registration: 'Registration',
  irp_apportioned_plate: 'IRP / Apportioned Plate',
  liability_insurance: 'Liability Insurance',
  cargo_insurance: 'Cargo Insurance',
  ucr: 'UCR',
  ifta_decal: 'IFTA Decal',
  drug_alcohol_consortium: 'Drug & Alcohol Consortium',
}

export const DRIVER_KINDS: ComplianceKind[] = [
  'cdl', 'medical_card', 'hazmat_endorsement', 'twic', 'tsa_precheck',
]
export const TRUCK_KINDS: ComplianceKind[] = [
  'annual_dot_inspection', 'registration', 'irp_apportioned_plate',
]
export const COMPANY_KINDS: ComplianceKind[] = [
  'liability_insurance', 'cargo_insurance', 'ucr', 'ifta_decal', 'drug_alcohol_consortium',
]

export function daysLeft(expires_at: string): number {
  const today = new Date()
  const exp = new Date(expires_at + 'T00:00:00')
  const ms = Date.UTC(exp.getFullYear(), exp.getMonth(), exp.getDate())
         - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round(ms / 86_400_000)
}

export type Severity = 'expired' | 'critical' | 'warning' | 'ok'

export function severity(expires_at: string): Severity {
  const d = daysLeft(expires_at)
  if (d < 0) return 'expired'
  if (d <= 30) return 'critical'
  if (d <= 90) return 'warning'
  return 'ok'
}

export async function listItems(filter?: {
  entityType?: ComplianceEntity
  entityId?: string | null
}): Promise<ComplianceItem[]> {
  let q = supabase.from('compliance_items').select('*').order('expires_at')
  if (filter?.entityType) q = q.eq('entity_type', filter.entityType)
  if (filter?.entityId !== undefined) {
    q = filter.entityId === null ? q.is('entity_id', null) : q.eq('entity_id', filter.entityId)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as ComplianceItem[]
}

export async function upsertItem(input: Partial<ComplianceItem> & {
  entity_type: ComplianceEntity
  kind: ComplianceKind
  expires_at: string
}): Promise<void> {
  const payload = {
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    kind: input.kind,
    issued_at: input.issued_at || null,
    expires_at: input.expires_at,
    notes: input.notes || null,
  }
  const { error } = input.id
    ? await supabase.from('compliance_items').update(payload).eq('id', input.id)
    : await supabase.from('compliance_items').insert(payload)
  if (error) throw error
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('compliance_items').delete().eq('id', id)
  if (error) throw error
}
