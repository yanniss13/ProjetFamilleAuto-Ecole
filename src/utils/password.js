// Hachage et vérification des mots de passe via bcrypt.
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

function hash(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function compare(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

module.exports = { hash, compare };
