// Gives a clinical profile to any patient account that never got one.
//
// Public sign-up created the account row and not the profile, so anyone who
// registered themselves could sign in and then use nothing: the dashboard,
// appointments, intake and reports all resolve through the profile. The bug is
// fixed at the source, but accounts created while it was live are still short a
// row and cannot fix themselves.
//
// Safe to re-run - it only creates what is missing, and never touches an
// account that already has a profile.
//
//   node scripts/repair-missing-profiles.js          # report only
//   node scripts/repair-missing-profiles.js --apply  # create them
require('dotenv').config();

const { connectMySQL, sequelize } = require('../src/config/mysql');
const { User, Patient } = require('../src/models/mysql');

const apply = process.argv.includes('--apply');

(async () => {
  await connectMySQL();

  const patients = await User.findAll({
    where: { role: 'patient' },
    include: [{ model: Patient, required: false }],
    order: [['id', 'ASC']],
  });

  const orphaned = patients.filter((user) => !user.Patient);

  console.log(`${patients.length} patient accounts, ${orphaned.length} without a profile\n`);

  if (orphaned.length === 0) {
    console.log('nothing to repair');
    await sequelize.close();
    return;
  }

  for (const user of orphaned) {
    console.log(`  ${user.id}  ${user.name} <${user.email}>`);
  }

  if (!apply) {
    console.log('\nre-run with --apply to create the missing profiles');
    await sequelize.close();
    return;
  }

  let created = 0;
  for (const user of orphaned) {
    // Individually rather than in one transaction: one account failing should
    // not cost the others their repair.
    try {
      await Patient.create({ userId: user.id });
      created += 1;
    } catch (err) {
      console.error(`  failed for ${user.email}: ${err.message}`);
    }
  }

  console.log(`\ncreated ${created} profile(s)`);
  await sequelize.close();
})();
