#!/bin/sh

# Check if admin users exist; if not, seed the database
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Admin = require('./models/Admin');

(async () => {
  await connectDB();
  const count = await Admin.countDocuments();
  if (count === 0) {
    console.log('No admin users found. Running seed...');
    mongoose.connection.close();
    require('./utils/seed');
  } else {
    console.log('Database already seeded. Skipping.');
    mongoose.connection.close();
  }
})();
" && sleep 2

# Start the server
exec node server.js
