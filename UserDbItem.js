const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    username: String,
    password: String
});

const UserDbItem = mongoose.model('Users', userSchema);

module.exports = UserDbItem;