const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');

const app = express();
const port = 8000;

app.use(session({
  secret: 'my-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60
  }
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));

// ===== 使用者資料庫 =====
const userDB = new sqlite3.Database('./users.db', (err) => {
  if (err) console.error("無法連接 users.db:", err.message);
  else console.log("成功連接 users.db");
});
userDB.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// ===== 商品資料庫 =====
const productDB = new sqlite3.Database('./product.db', (err) => {
  if (err) console.error("無法連接 product.db:", err.message);
  else console.log("成功連接 product.db");
});

// ===== 收藏資料庫 =====
const favoritesDB = new sqlite3.Database('./favorites.db', (err) => {
  if (err) console.error("無法連接 favorites.db:", err.message);
  else console.log("成功連接 favorites.db");
});
favoritesDB.run(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// ===== 搜尋紀錄資料庫 =====
const searchDB = new sqlite3.Database('./search.db', (err) => {
  if (err) console.error("無法連接 search.db:", err.message);
  else console.log("成功連接 search.db");
});
searchDB.run(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    keyword TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ===== API =====

app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  userDB.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return res.json({ success: false, message: '資料庫錯誤' });
    if (row) return res.json({ success: false, message: '使用者名稱已存在！' });

    userDB.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], (err) => {
      if (err) return res.json({ success: false, message: '註冊失敗' });
      res.json({ success: true });
    });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  userDB.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) return res.json({ success: false, message: '資料庫錯誤' });
    if (row) {
      req.session.username = username;
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '無效的使用者名稱或密碼！' });
    }
  });
});

app.get('/api/products', (req, res) => {
  productDB.all("SELECT * FROM products", [], (err, rows) => {
    if (err) return res.status(500).json({ error: '商品資料庫錯誤' });
    res.json(rows);
  });
});

app.get('/api/products/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) return res.status(400).json({ error: '缺少搜尋關鍵字' });

  const sql = `SELECT * FROM products WHERE name LIKE ?`;
  productDB.all(sql, [`%${keyword}%`], (err, rows) => {
    if (err) return res.status(500).json({ error: '商品資料庫錯誤' });
    res.json(rows);
  });
});

app.post('/api/search', (req, res) => {
  const sessionUsername = req.session.username || 'guest';
  const { keyword } = req.body;
  if (!keyword) return res.json({ success: false, message: '關鍵字為空' });

  searchDB.run(
    'INSERT INTO searches (username, keyword) VALUES (?, ?)',
    [sessionUsername, keyword],
    (err) => {
      if (err) return res.json({ success: false, message: '資料庫錯誤' });
      res.json({ success: true });
    }
  );
});

// 修正版：取得收藏清單（跨資料庫查詢）
app.get('/api/favorites', (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: '請先登入' });

  favoritesDB.all(`SELECT product_id FROM favorites WHERE username = ?`, [username], (err, favRows) => {
    if (err) return res.status(500).json({ error: '收藏資料庫錯誤' });
    if (!favRows.length) return res.json([]);

    const productIds = favRows.map(r => r.product_id);
    const placeholders = productIds.map(() => '?').join(',');

    const sql = `SELECT * FROM products WHERE id IN (${placeholders})`;
    productDB.all(sql, productIds, (err, productRows) => {
      if (err) return res.status(500).json({ error: '商品資料庫錯誤' });
      res.json(productRows);
    });
  });
});

app.post('/api/favorites', (req, res) => {
  const username = req.session.username;
  const { product_id } = req.body;
  if (!username) return res.status(401).json({ error: '請先登入' });
  if (!product_id) return res.status(400).json({ error: '缺少商品 ID' });

  const checkSql = `SELECT * FROM favorites WHERE username = ? AND product_id = ?`;
  favoritesDB.get(checkSql, [username, product_id], (err, row) => {
    if (err) return res.status(500).json({ error: '資料庫錯誤' });
    if (row) return res.json({ success: false, message: '已經收藏過這個商品' });

    const insertSql = `INSERT INTO favorites (username, product_id) VALUES (?, ?)`;
    favoritesDB.run(insertSql, [username, product_id], (err) => {
      if (err) return res.status(500).json({ error: '資料庫錯誤' });
      res.json({ success: true });
    });
  });
});

// ===== HTML 路由 =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'product.html'));
});
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, 'search.html'));
});
app.get('/favorites', (req, res) => {
  res.sendFile(path.join(__dirname, 'favorites.html'));
});

// ===== 啟動伺服器 =====
app.listen(port, () => {
  console.log(`伺服器運行中：http://localhost:${port}`);
});
