# Demo Script (Target 2:45)

Use only fictional cases. Record in English. Keep the final video under three
minutes; show what actually works rather than slides promising future integrations.

| Time | Scene | Narration / Action |
| --- | --- | --- |
| 0:00-0:15 | Maya's power-chair case | "MobilityRelay is a simulated Alexa+ repair assistant with a real MCP server. The supplier reports sending an estimate; the insurer reports not locating it." Show the two dated reports together, labelled fictional. |
| 0:15-0:35 | Next-step question | "MobilityRelay does not decide who's at fault. It asks the actionable question: was the estimate received?" Show dates and source links. |
| 0:35-1:00 | Voice/text request | Ask "Prepare a request to the supplier." Show the actual MCP trace and source-backed draft. If voice recognition is unavailable, openly use text. |
| 1:00-1:25 | Approval | Show the disabled send button before approval. Review recipient and wording. In local mode say "This is a local capture, not an email delivery." Show that unanswered questions remain open. Use real SMTP only after a controlled live test. |
| 1:25-1:45 | Follow-up | Ask "Remind me tomorrow." Show the saved due item, then reload to demonstrate persistence. No autonomous message is promised. |
| 1:45-2:10 | Difficult case | Switch to coverage refusal or unavailable technicians. Show a request for a written reason or professional arrangements, not a diagnosis or promised approval. |
| 2:10-2:30 | Case packet | Export the unanswered-request history with redaction. Open the HTML file; show source dates and unresolved questions. |
| 2:30-2:45 | Technical evidence and close | Show six MCP tools and a protocol trace/test. "A study of 301 wheelchair users found vendor noncompletion after contact was the most common reason for incomplete repairs. We target clearer coordination, not proven faster repairs." Put the study citation on the video. |

Do not present fictional messages as actual supplier records, capture as delivery,
an optional Bedrock path as a tested cloud integration, or synthetic testing as
user validation. Use a separate test case for approval-failure demonstrations.

Evidence for the closing line: Worobey et al., published March 2025 in
Archives of Physical Medicine and Rehabilitation,
[study abstract](https://pubmed.ncbi.nlm.nih.gov/39427781/). The sample was
wheelchair users with spinal cord injury at nine SCI Model Systems Centers;
do not describe it as a survey of all users or evidence of this app's impact.

Public hosting is optional under the
[hackathon FAQ](https://amazonappdev2026.devpost.com/details/faqs). A live AWS or
test-inbox segment belongs in the video only after the integration has actually
passed a controlled test. Retain capture/local labels if it has not.
