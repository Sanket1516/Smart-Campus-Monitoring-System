/**
 * One PIN per student, identical on every terminal: Student.zktUserID.
 * New PINs come from an atomic counter seeded from the highest existing zktUserID.
 */
const Student = require('../../models/Student');
const Counter = require('../../models/Counter');

const COUNTER_ID = 'studentPin';
const MAX_PIN = 999999999;
let seeded = false;

const seedCounter = async () => {
  if (seeded) return;
  const top = await Student.findOne({ zktUserID: { $ne: null } }).sort({ zktUserID: -1 }).select('zktUserID').lean();
  await Counter.updateOne({ _id: COUNTER_ID }, { $max: { value: Number(top?.zktUserID || 0) } }, { upsert: true });
  seeded = true;
};

const ensureStudentPin = async (student) => {
  if (student.zktUserID) return String(student.zktUserID);
  await seedCounter();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { _id: COUNTER_ID },
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    ).lean();
    const pin = Number(counter.value);
    if (pin > MAX_PIN) throw new Error('PIN space exhausted');
    try {
      const result = await Student.updateOne(
        { _id: student._id, $or: [{ zktUserID: null }, { zktUserID: { $exists: false } }] },
        { $set: { zktUserID: pin } }
      );
      if (result.modifiedCount === 1) {
        student.zktUserID = pin;
        return String(pin);
      }
      const fresh = await Student.findById(student._id).select('zktUserID').lean();
      if (fresh?.zktUserID) {
        student.zktUserID = fresh.zktUserID;
        return String(fresh.zktUserID);
      }
    } catch (error) {
      if (Number(error?.code) !== 11000) throw error;
      // PIN taken by a manually assigned zktUserID — try the next one.
    }
  }
  throw new Error('Could not allocate a PIN');
};

const resetPinAllocatorForTests = () => {
  seeded = false;
};

module.exports = { ensureStudentPin, resetPinAllocatorForTests };
