const VisitorEntry = require('../models/VisitorEntry');

const todayStr = () => new Date().toISOString().split('T')[0];

exports.createVisitorEntry = async (req, res, next) => {
  try {
    const visitor = await VisitorEntry.create({
      visitorName: req.body.visitorName,
      phoneNumber: req.body.phoneNumber,
      personToMeet: req.body.personToMeet,
      meetingReason: req.body.meetingReason,
      organization: req.body.organization || '',
      idProof: req.body.idProof || '',
      remarks: req.body.remarks || '',
      date: todayStr(),
      checkInTime: new Date(),
      enteredBy: req.admin?.name || req.admin?.username || '',
    });

    res.status(201).json({
      message: 'Visitor entry recorded successfully',
      visitor,
    });
  } catch (err) {
    next(err);
  }
};

exports.getVisitorEntries = async (req, res, next) => {
  try {
    const { date = todayStr(), page = 1, limit = 20 } = req.query;
    const filter = {};

    if (date) filter.date = date;

    const visitors = await VisitorEntry.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await VisitorEntry.countDocuments(filter);

    res.json({
      visitors,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
};
