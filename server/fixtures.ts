import type { Store } from './store.js';
import type { Party, Stage } from '../shared/types.js';
import { randomUUID } from 'node:crypto';

type Sample = { party: Party; stage: Stage; text: string; days: number; source: string };
export function seedExamples(store: Store) {
  if (store.cases().length) return;
  const scenarios: { title: string; person: string; equipment: string; reference: string; category: string; events: Sample[] }[] = [
    { title: 'Power chair repair', person: 'Maya', equipment: 'Power wheelchair', reference: 'DEMO-1042', category: 'Paperwork clarification', events: [
      { party: 'user', stage: 'other', text: 'My power chair stopped working. I opened a repair request and am using my backup chair.', days: 12, source: 'Maya - personal note' },
      { party: 'supplier', stage: 'paperwork_sent', text: 'We submitted the repair estimate to your insurer. We are waiting for authorization.', days: 7, source: 'Northbridge Mobility - email' },
      { party: 'supplier', stage: 'authorization_pending', text: 'The repair is waiting for insurer authorization. We do not have a receipt reference to share yet.', days: 4, source: 'Northbridge Mobility - phone note' },
      { party: 'insurer', stage: 'paperwork_requested', text: 'We cannot locate the repair estimate under this reference. Please ask the supplier for the submission reference and recipient.', days: 2, source: 'Harbor Health - email' },
    ] },
    { title: 'Replacement caster delay', person: 'Alex', equipment: 'Manual wheelchair', reference: 'DEMO-2081', category: 'Parts delay', events: [
      { party: 'insurer', stage: 'authorization_approved', text: 'The quoted replacement caster has been approved for this repair request.', days: 16, source: 'Harbor Health - letter' },
      { party: 'supplier', stage: 'part_ordered', text: 'We have ordered the replacement caster. We have not provided an order number yet.', days: 13, source: 'Northbridge Mobility - email' },
      { party: 'supplier', stage: 'parts_delayed', text: 'The part is delayed. We do not have a confirmed arrival date.', days: 3, source: 'Northbridge Mobility - phone note' },
      { party: 'user', stage: 'loaner_needed', text: 'Please ask whether there is suitable temporary equipment while my chair is waiting for parts.', days: 1, source: 'Alex - personal note' },
    ] },
    { title: 'Repair request unanswered', person: 'Sam', equipment: 'Power wheelchair', reference: 'DEMO-3098', category: 'Unanswered request', events: [
      { party: 'user', stage: 'other', text: 'I requested an assessment and asked who will coordinate my repair.', days: 10, source: 'Sam - sent email' },
      { party: 'user', stage: 'provider_silent', text: 'I followed up twice and left a voicemail. I have not received an answer. I would like a dated history for my advocate.', days: 2, source: 'Sam - personal note' },
    ] },
    { title: 'Coverage clarification', person: 'Jordan', equipment: 'Manual wheelchair', reference: 'DEMO-4015', category: 'Coverage refusal', events: [
      { party: 'insurer', stage: 'coverage_refused', text: 'This repair request was not approved. We have not yet provided the written reason or review instructions.', days: 3, source: 'Harbor Health - phone note' },
    ] },
    { title: 'Assessment arrangements', person: 'Ravi', equipment: 'Power wheelchair', reference: 'DEMO-5082', category: 'Professional assessment', events: [
      { party: 'user', stage: 'assessment_needed', text: 'My chair is not working normally. I need a qualified professional to assess it, not repair instructions.', days: 6, source: 'Ravi - personal note' },
      { party: 'supplier', stage: 'technician_unavailable', text: 'Our technician is currently unavailable. We have not offered another assessment arrangement yet.', days: 3, source: 'Northbridge Mobility - email' },
    ] },
  ];
  for (const scenario of scenarios) {
    const { events, ...data } = scenario;
    const c = store.createCase({ ...data, fictional: true });
    store.saveContact({ caseId: c.id, name: 'Northbridge Mobility', role: 'supplier', email: 'repairs@northbridge.example', verified: false });
    store.saveContact({ caseId: c.id, name: 'Harbor Health', role: 'insurer', email: 'support@harbor.example', verified: false });
    for (const e of events) {
      const date = new Date(); date.setDate(date.getDate() - e.days);
      store.recordEvent({ caseId: c.id, party: e.party, stage: e.stage, text: e.text, source: e.source, channel: e.source.includes('phone') ? 'Phone' : e.party === 'user' ? 'Personal note' : 'Email', occurredAt: date.toISOString(), reference: c.reference, supersedesId: null, requestId: randomUUID() });
    }
  }
}
