// A small reference list of what may be prescribed. Real practice would draw on
// a national formulary; this is a fixed list so that a typed medication name is
// checked against something rather than accepted as free text.
//
// Every medication the seed issues appears here, so seeded data is valid under
// the same rules as anything entered later.
const MEDICATIONS = [
  { name: 'Amlodipine', routes: ['oral'] },
  { name: 'Amoxicillin', routes: ['oral'] },
  { name: 'Atorvastatin', routes: ['oral'] },
  { name: 'Azithromycin', routes: ['oral'] },
  { name: 'Cetirizine', routes: ['oral'] },
  { name: 'Desloratadine', routes: ['oral'] },
  { name: 'Ibuprofen', routes: ['oral'] },
  { name: 'Levothyroxine', routes: ['oral'] },
  { name: 'Lisinopril', routes: ['oral'] },
  { name: 'Metformin', routes: ['oral'] },
  { name: 'Metoprolol', routes: ['oral'] },
  { name: 'Omeprazole', routes: ['oral'] },
  { name: 'Paracetamol', routes: ['oral'] },
  { name: 'Prednisone', routes: ['oral'] },
  { name: 'Salbutamol', routes: ['inhaled'] },
  { name: 'Sertraline', routes: ['oral'] },
  { name: 'Topical Corticosteroids', routes: ['topical'] },
  { name: 'Insulin Glargine', routes: ['subcutaneous'] },
  { name: 'Warfarin', routes: ['oral'] },
];

// Matched without regard to case or surrounding space, and the stored name is
// the reference spelling rather than whatever was typed.
const findMedication = (name) => {
  if (typeof name !== 'string') return null;
  const wanted = name.trim().toLowerCase();
  return MEDICATIONS.find((medication) => medication.name.toLowerCase() === wanted) || null;
};

// A course runs for a written duration such as "30 days", so it ends on the day
// it was issued plus that many days. Anything the duration cannot be read from
// has no end date rather than a guessed one.
const runsOutOn = (prescription) => {
  const match = /(\d+)\s*(day|week|month)/i.exec(prescription.duration || '');
  if (!match) return null;

  const amount = Number(match[1]);
  const perUnit = { day: 1, week: 7, month: 30 }[match[2].toLowerCase()];

  const ends = new Date(prescription.createdAt);
  ends.setDate(ends.getDate() + amount * perUnit);
  return ends;
};

// A prescription whose course has not finished is still being taken. One whose
// duration cannot be read is treated as ongoing, since nothing says it stopped.
const isCurrent = (prescription, now = new Date()) => {
  const ends = runsOutOn(prescription);
  return !ends || ends > now;
};

module.exports = { MEDICATIONS, findMedication, runsOutOn, isCurrent };
