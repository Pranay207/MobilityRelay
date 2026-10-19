import type { Brief, Party, Stage, UpdateProposal } from '../shared/types.js';

export function commandText(input: string) {
  return input.trim().replace(/^(?:alexa|relay)\s*[,.:]?\s+/i, '').replace(/^(?:(?:please|can you|could you|would you)\s+){1,3}/i, '').trim();
}

export function directCaseCommand(input: string): 'read' | 'export' | null {
  const text = commandText(input).replace(/[.!?]+$/, '').trim().replace(/\s+/g, ' ');
  if ([
    /^(?:(?:show|tell me|what is|what's) (?:my |the |this )?(?:case|repair) (?:status|summary|brief)|(?:case |repair )?(?:status|summary|brief))$/i,
    /^(?:(?:show|tell me|what is|what's) (?:my |the )?next step|next step)$/i,
    /^(?:(?:show|list) (?:my |the )?(?:reminders?|follow[- ]?ups?)|(?:what is|what's) (?:my |the )?next follow[- ]?up)$/i,
    /^(?:help me understand )?(?:what is|what's) holding up (?:this|my) repair$/i,
  ].some(pattern => pattern.test(text))) return 'read';
  if (/^(?:(?:export|download) (?:my |the |a )?(?:case |repair )?(?:history|packet)|(?:make|prepare) (?:my |the |a )?case (?:history|packet))(?: as html)?$/i.test(text)) return 'export';
  return null;
}

export function localIntent(input: string): 'blocked' | 'read' | 'record' | 'send' | 'export' | 'reminder' | 'draft' | 'unknown' {
  const text = commandText(input);
  if (/^(?:don't|do not|not|no|never|stop|cancel)\b/i.test(text)) return 'blocked';
  if (/^(?:what|who|why|when|where|how|is|are|did|does|do|has|have|show|tell me|status|summary|next step)\b/i.test(text)) return 'read';
  if (/^(?:record|log|note that|add (?:an? )?update|(?:the |my )?(?:supplier|insurer) (?:said|says|told me))\b/i.test(text)) return 'record';
  if (/^(?:send|email it|approve)\b/i.test(text)) return 'send';
  if (/^(?:export|download|(?:make|prepare) (?:a |the |my )?case (?:packet|history))\b/i.test(text)) return 'export';
  if (/^(?:remind me|schedule (?:a )?follow[- ]?up|set (?:a )?reminder|follow[- ]?up)\b/i.test(text)) return 'reminder';
  if (/^(?:draft|prepare|write|ask (?:the|my)|request clarification)\b/i.test(text)) return 'draft';
  return 'unknown';
}

export function proposesTomorrow(input: string) {
  return /^(?:remind me|schedule (?:a )?follow[- ]?up|set (?:a )?reminder|follow[- ]?up)(?: for| on)? (?:tomorrow|(?:the )?next day)[.!?]*$/i.test(commandText(input));
}

export function requestQuestionKinds(input: string): string[] | null {
  const patterns: [string[], RegExp][] = [
    [['parts'], /\b(parts?|arrival)\b/i], [['loaner'], /\b(loaner|temporary)\b/i],
    [['coverage'], /\b(coverage|refusal)\b/i], [['receipt', 'paperwork'], /\b(estimate|receipt|submission|paperwork)\b/i],
  ];
  const kinds = patterns.flatMap(([values, pattern]) => pattern.test(commandText(input)) ? values : []);
  return kinds.length ? [...new Set(kinds)] : null;
}

export function proposeUpdate(input: string, brief: Brief): UpdateProposal {
  const text = commandText(input).replace(/^(?:record|log|note that|add (?:an? )?update)\s*[:,-]?\s*/i, '');
  const proposal: UpdateProposal = { text };
  const parties = (['supplier', 'insurer', 'caregiver', 'advocate'] as Party[]).filter(role => new RegExp(`\\b${role}\\b`, 'i').test(text));
  const named = brief.contacts.filter(contact => {
    const escaped = contact.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, 'i').test(text);
  });
  if (named.length === 1 && parties.every(role => role === named[0].role)) { proposal.source = named[0].name; proposal.party = named[0].role; }
  else if (parties.length === 1) proposal.party = parties[0];
  const channels = ([['Email', /\be-?mail\b/i], ['Phone', /\b(?:phone|voicemail)\b|\bcalled me\b/i], ['Letter', /\bletter\b/i]] as const).filter(([, pattern]) => pattern.test(text));
  if (channels.length === 1) proposal.channel = channels[0][0];
  // Hints are intentionally conservative. The source date and interpretation still need review.
  if (!/\b(?:not|no|never|isn't|wasn't|hasn't|haven't|didn't)\b/i.test(text)) {
    const hints: [Stage, RegExp][] = [
      ['parts_delayed', /\b(?:part|parts)\b.{0,45}\b(?:delayed|unavailable|backordered|on back order)\b/i],
      ['coverage_refused', /\b(?:coverage|repair request|funding)\b.{0,45}\b(?:refused|declined|denied)\b/i],
      ['technician_unavailable', /\btechnician\b.{0,35}\b(?:unavailable|absent)\b/i],
      ['assessment_needed', /\b(?:need|needs|require|requires)\b.{0,25}\b(?:professional |qualified )?assessment\b/i],
      ['loaner_needed', /\b(?:need|needs|request|requested)\b.{0,25}\b(?:loaner|temporary equipment|temporary chair)\b/i],
    ];
    const matched = hints.filter(([, pattern]) => pattern.test(text));
    if (matched.length === 1) proposal.stage = matched[0][0];
  }
  return proposal;
}
