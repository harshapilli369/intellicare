// Marks text as AI-generated so a clinician is never in doubt about which content
// came from the model and which was written by a human.
const AiBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand">
    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
    AI-generated
  </span>
);

export default AiBadge;
