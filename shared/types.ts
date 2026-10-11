export const stages = ['paperwork_requested', 'paperwork_sent', 'authorization_pending', 'authorization_approved', 'coverage_refused', 'part_ordered', 'parts_delayed', 'technician_unavailable', 'assessment_needed', 'appointment_scheduled', 'provider_silent', 'loaner_needed', 'repair_completed', 'other'] as const;
export type Stage = typeof stages[number];
export type Party = 'supplier' | 'insurer' | 'user' | 'caregiver' | 'advocate';
export const stageLabels: Record<Stage, string> = {
  paperwork_requested: 'Paperwork requested', paperwork_sent: 'Paperwork reportedly sent',
  authorization_pending: 'Authorization pending', authorization_approved: 'Authorization reportedly approved',
  part_ordered: 'Part reportedly ordered', parts_delayed: 'Parts delayed',
  appointment_scheduled: 'Appointment reported', provider_silent: 'No response reported',
  loaner_needed: 'Temporary equipment requested', repair_completed: 'Repair reported complete', other: 'Other update',
  coverage_refused: 'Coverage reportedly refused', technician_unavailable: 'Technician unavailable', assessment_needed: 'Professional assessment needed',
};
export interface RepairCase { id: string; title: string; person: string; equipment: string; reference: string; category: string; fictional: boolean; version: number; createdAt: string; updatedAt: string }
export interface Contact { id: string; caseId: string; name: string; role: Party; email: string; verified: boolean }
export interface RepairEvent { id: string; caseId: string; party: Party; source: string; channel: string; occurredAt: string; recordedAt: string; text: string; stage: Stage; reference: string; supersedesId: string | null }
export interface Question { id: string; caseId: string; kind: string; title: string; explanation: string; sourceIds: string[]; resolved: boolean; answer: string; createdAt: string; active?: boolean }
export interface Draft { id: string; caseId: string; caseVersion: number; recipientId: string; recipient: string; subject: string; body: string; sourceIds: string[]; questionIds: string[]; hash: string; status: 'draft' | 'sending' | 'sent' | 'captured' | 'unknown' | 'failed'; createdAt: string; deliveryId: string | null }
export interface Followup { id: string; caseId: string; questionId: string | null; title: string; dueAt: string; timezone: string; status: 'scheduled' | 'completed' | 'cancelled'; createdAt: string }
export interface Brief { repairCase: RepairCase; contacts: Contact[]; events: RepairEvent[]; questions: Question[]; drafts: Draft[]; followups: Followup[]; nextStep: string; reportedStage: string }
export interface ToolTrace { tool: string; durationMs: number; ok: boolean }
export interface ChatMessage { id: string; caseId: string; role: 'user' | 'assistant'; text: string; createdAt: string; traces: ToolTrace[] }
export interface Settings { mailMode: 'capture' | 'smtp'; agentMode: 'local' | 'bedrock'; protocol: string; tools: string[]; protected: boolean }
export interface UpdateProposal { text: string; party?: Party; source?: string; channel?: 'Email' | 'Phone' | 'Letter' | 'Voice note' | 'Web portal' | 'Personal note'; stage?: Stage }
export interface AgentReply { reply: string; traces: ToolTrace[]; draftId?: string; action?: 'record' | 'prepare'; prefill?: string; update?: UpdateProposal; packet?: { filename: string; mime: string; content: string } }
