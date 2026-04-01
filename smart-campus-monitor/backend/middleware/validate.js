const { validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    message: result
      .array()
      .map((error) => error.msg)
      .join(', '),
  });
};

module.exports = handleValidation;
