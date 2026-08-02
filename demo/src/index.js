import { createToken, verifyToken } from "./auth.js";

const token = createToken({ sub: "cat", role: "admin" });
const result = verifyToken(token);
console.log(JSON.stringify({ token, result }, null, 2));
