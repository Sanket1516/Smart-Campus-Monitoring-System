// Sends one real parent notification and reports whether the SMTP server accepted it.
//   npm run email:test -- <student SAP ID> [entry|exit]
// The email goes to that student's parentEmail, exactly as a gate scan would send it.
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { notifyParent } = require('../services/notification');
const { waitFor } = require('../services/emailQueue');

(async () => {
  const [sapId, action = 'entry'] = process.argv.slice(2);
  if (!sapId) throw new Error('Usage: npm run email:test -- <SAP ID> [entry|exit]');
  await mongoose.connect(process.env.MONGO_URI);
  const student = await Student.findOne({ sapId });
  if (!student) throw new Error(`No student with SAP ID ${sapId}`);
  if (!student.parentEmail) throw new Error(`${student.name} has no parent email`);
  const result = await notifyParent(student, action, new Date(), { source: 'email_test' });
  const done = await waitFor({ _id: result.email.jobId });
  console.log(JSON.stringify({ status: done?.status, messageId: done?.messageId, error: done?.lastError, attempts: done?.attempts }));
  console.log('If it is accepted but missing, check that inbox Spam and All Mail.');
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
