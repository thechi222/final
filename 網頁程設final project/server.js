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

// ===== 商品 + 收藏 + 購物車資料庫 =====
const productDB = new sqlite3.Database('./product.db', (err) => {
  if (err) console.error("無法連接 product.db:", err.message);
  else console.log("成功連接 product.db");
});

// 確保 products 表存在
productDB.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    description TEXT,
    image TEXT
  )
`);

// 收藏資料表
productDB.run(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// 購物車資料表
productDB.run(`
  CREATE TABLE IF NOT EXISTS carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
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

// 註冊
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

// 登入
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

// 取得所有商品
app.get('/api/products', (req, res) => {
  productDB.all("SELECT * FROM products", [], (err, rows) => {
    if (err) return res.status(500).json({ error: '商品資料庫錯誤' });
    res.json(rows);
  });
});

// 搜尋商品
app.get('/api/products/search', (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) return res.status(400).json({ error: '缺少搜尋關鍵字' });

  const sql = `SELECT * FROM products WHERE name LIKE ?`;
  productDB.all(sql, [`%${keyword}%`], (err, rows) => {
    if (err) return res.status(500).json({ error: '商品資料庫錯誤' });
    res.json(rows);
  });
});

// 搜尋紀錄
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

// 收藏 API
app.post('/api/favorites', (req, res) => {
  const username = req.session.username;
  const { product_id } = req.body;

  if (!username) {
    return res.status(401).json({ success: false, message: '請先登入' });
  }
  if (!product_id) {
    return res.status(400).json({ success: false, message: '缺少商品ID' });
  }

  const checkSql = `SELECT * FROM favorites WHERE username = ? AND product_id = ?`;
  productDB.get(checkSql, [username, product_id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: '資料庫錯誤' });
    }
    if (row) {
      return res.json({ success: false, message: '此商品已收藏' });
    }

    const insertSql = `INSERT INTO favorites (username, product_id) VALUES (?, ?)`;
    productDB.run(insertSql, [username, product_id], (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: '加入收藏失敗' });
      }
      res.json({ success: true });
    });
  });
});

// 取得目前使用者的收藏清單
app.get('/api/favorites', (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ success: false, message: '請先登入' });

  const sql = `
    SELECT products.*
    FROM favorites
    JOIN products ON favorites.product_id = products.id
    WHERE favorites.username = ?
  `;
  productDB.all(sql, [username], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: '資料庫錯誤' });
    res.json(rows);
  });
});

// 購物車 API

// 取得購物車
app.get('/api/cart', (req, res) => {
  const username = req.session.username;
  if (!username) return res.status(401).json({ error: '請先登入' });

  const sql = `
    SELECT 
      carts.id         AS cart_id,
      carts.product_id,
      carts.quantity,
      products.*
    FROM carts 
    JOIN products ON carts.product_id = products.id 
    WHERE carts.username = ?
  `;
  productDB.all(sql, [username], (err, rows) => {
    if (err) return res.status(500).json({ error: '讀取失敗' });
    res.json(rows);
  });
});

// 新增或更新購物車
app.post('/api/cart', (req, res) => {
  const username = req.session.username;
  const { product_id, quantity } = req.body;
  if (!username) return res.status(401).json({ error: '請先登入' });
  if (!product_id || quantity === undefined) return res.status(400).json({ error: '缺少商品 ID 或數量' });

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 0) {
    return res.status(400).json({ error: '數量格式錯誤' });
  }

  if (qty === 0) {
    // 數量為0時刪除該商品
    const deleteSql = `DELETE FROM carts WHERE username = ? AND product_id = ?`;
    productDB.run(deleteSql, [username, product_id], function(err) {
      if (err) return res.status(500).json({ error: '刪除失敗' });
      res.json({ success: true });
    });
  } else {
    const checkSql = `SELECT * FROM carts WHERE username = ? AND product_id = ?`;
    productDB.get(checkSql, [username, product_id], (err, row) => {
      if (err) return res.status(500).json({ error: '資料庫錯誤' });

      if (row) {
        // 更新數量為使用者輸入的數字
        const updateSql = `UPDATE carts SET quantity = ? WHERE username = ? AND product_id = ?`;
        productDB.run(updateSql, [qty, username, product_id], (err) => {
          if (err) return res.status(500).json({ error: '更新失敗' });
          res.json({ success: true });
        });
      } else {
        // 新增一筆
        const insertSql = `INSERT INTO carts (username, product_id, quantity) VALUES (?, ?, ?)`;
        productDB.run(insertSql, [username, product_id, qty], (err) => {
          if (err) return res.status(500).json({ error: '新增失敗' });
          res.json({ success: true });
        });
      }
    });
  }
});

// 刪除購物車中的某一項
app.delete('/api/cart/:id', (req, res) => {
  const username = req.session.username;
  const cartId = req.params.id;
  if (!username) return res.status(401).json({ error: '請先登入' });

  const deleteSql = `DELETE FROM carts WHERE id = ? AND username = ?`;
  productDB.run(deleteSql, [cartId, username], function (err) {
    if (err) return res.status(500).json({ error: '刪除失敗' });
    res.json({ success: true });
  });
});

// 取得購物車商品總數
app.get('/api/cart/count', (req, res) => {
  const username = req.session.username;
  if (!username) return res.json({ count: 0 });

  const sql = `SELECT SUM(quantity) AS total FROM carts WHERE username = ?`;
  productDB.get(sql, [username], (err, row) => {
    if (err) return res.status(500).json({ error: '資料庫錯誤' });

    const count = row.total || 0;
    res.json({ count });
  });
});

// ===== HTML 路由 =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
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
app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'cart.html'));
});

// ===== 啟動伺服器 =====
app.listen(port, () => {
  console.log(`伺服器運行中：http://localhost:${port}`);
});
