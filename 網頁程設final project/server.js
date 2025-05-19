const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');

const app = express();
const port = 8000;

// ===== session middleware 要最早放 =====
app.use(session({
  secret: 'my-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));

// ===== 使用者資料庫連線 =====
const userDB = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error("無法連接 users.db:", err.message);
  } else {
    console.log("成功連接 users.db");
  }
});

// 建立 users 表格（如尚未存在）
userDB.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// 註冊 API
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

// ✅ 登入 API，並寫入 session
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  userDB.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) return res.json({ success: false, message: '資料庫錯誤' });
    if (row) {
      req.session.username = username; // ✅ 記住使用者
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '無效的使用者名稱或密碼！' });
    }
  });
});

// ===== 商品資料庫 =====
const productDB = new sqlite3.Database('C:/Users/user/Desktop/網頁程設final project/product.db', (err) => {
  if (err) {
    console.error("無法連接 product.db:", err.message);
  } else {
    console.log("成功連接 product.db");
  }
});

// 取得全部商品
app.get('/api/products', (req, res) => {
  productDB.all("SELECT * FROM products", [], (err, rows) => {
    if (err) {
      console.error("查詢商品失敗:", err.message);
      return res.status(500).json({ error: '商品資料庫錯誤' });
    }
    res.json(rows);
  });
});

// 搜尋商品
app.get('/api/products/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    return res.status(400).json({ error: '缺少搜尋關鍵字' });
  }

  const sql = `SELECT * FROM products WHERE name LIKE ?`;
  const params = [`%${keyword}%`];

  productDB.all(sql, params, (err, rows) => {
    if (err) {
      console.error("搜尋商品失敗:", err.message);
      return res.status(500).json({ error: '商品資料庫錯誤' });
    }
    res.json(rows);
  });
});

// ===== 搜尋紀錄資料庫 =====
const searchDB = new sqlite3.Database('./search.db', (err) => {
  if (err) {
    console.error("無法連接 search.db:", err.message);
  } else {
    console.log("成功連接 search.db");
  }
});

searchDB.run(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    keyword TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ✅ 搜尋紀錄 API（用 session.username）
app.post('/api/search', (req, res) => {
  const sessionUsername = req.session.username || 'guest';
  const { keyword } = req.body;

  if (!keyword) return res.json({ success: false, message: '關鍵字為空' });

  searchDB.run(
    'INSERT INTO searches (username, keyword) VALUES (?, ?)',
    [sessionUsername, keyword],
    (err) => {
      if (err) {
        console.error('新增搜尋紀錄失敗:', err.message);
        return res.json({ success: false, message: '資料庫錯誤' });
      }
      res.json({ success: true });
    }
  );
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

// ===== 啟動伺服器 =====
app.listen(port, () => {
  console.log(`伺服器運行中：http://localhost:${port}`);
});

// 建立 favorites 表格（如果尚未存在）
productDB.run(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// API：取得目前使用者的收藏清單（加 id 和 image 欄位）
app.get('/api/favorites', (req, res) => {
  const username = req.session.username;
  if (!username) {
    return res.status(401).json({ error: '請先登入' });
  }

  const sql = `
    SELECT p.id, p.name, p.price, p.image
    FROM favorites f
    JOIN products p ON f.product_id = p.id
    WHERE f.username = ?
  `;

  productDB.all(sql, [username], (err, rows) => {
    if (err) {
      console.error("取得收藏失敗:", err.message);
      return res.status(500).json({ error: '資料庫錯誤' });
    }
    res.json(rows);
  });
});

// ✅ API：加入收藏（避免重複收藏）
app.post('/api/favorites', (req, res) => {
  const username = req.session.username;
  const { product_id } = req.body;

  if (!username) return res.status(401).json({ error: '請先登入' });
  if (!product_id) return res.status(400).json({ error: '缺少商品 ID' });

  const checkSql = `SELECT * FROM favorites WHERE username = ? AND product_id = ?`;
  productDB.get(checkSql, [username, product_id], (err, row) => {
    if (err) {
      console.error('查詢收藏失敗:', err.message);
      return res.status(500).json({ error: '資料庫錯誤' });
    }

    if (row) {
      return res.json({ success: false, message: '已經收藏過這個商品' });
    }

    const insertSql = `INSERT INTO favorites (username, product_id) VALUES (?, ?)`;
    productDB.run(insertSql, [username, product_id], (err) => {
      if (err) {
        console.error('加入收藏失敗:', err.message);
        return res.status(500).json({ error: '資料庫錯誤' });
      }
      res.json({ success: true });
    });
  });
});
