const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('users.db');

// 第一次建立用戶資料表
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
});

module.exports = db;
