// Utility to generate bcrypt hashes for APP_USERS env var
// Usage: bun run scripts/hash-password.ts <password>
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: bun run scripts/hash-password.ts <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log(`\nPassword: ${password}`);
console.log(`Hash: ${hash}`);
console.log(`\nAdd to APP_USERS env var like: username:${hash}`);
