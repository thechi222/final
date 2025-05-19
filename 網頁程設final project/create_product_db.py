import sqlite3

# 建立資料庫連線（檔案不存在會自動建立）
conn = sqlite3.connect('product.db')
c = conn.cursor()

# 建立 products 資料表
c.execute('''
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price TEXT NOT NULL,
        image TEXT NOT NULL
    )
''')

# 插入一些商品資料
products = [
    ('Jacket 1', '$10,500', 'jacket1.jpg'),
    ('Jacket 2', '$20,800', 'jacket2.jpg'),
    ('Jacket 3', '$13,000', 'jacket3.jpg'),
    ('Glove 1', '$1,850', 'glove1.jpg'),
    ('Glove 2', '$1,900', 'glove2.jpg'),
    ('Functional Backpack 1', '$3,200', 'bag1.jpg'),
    ('Functional Backpack 2', '$3,500', 'bag2.jpg'),
    ('Functional Backpack 3', '$3,800', 'bag3.jpg'),
    ('Tee 1', '$500', 'tee1.jpg'),
    ('Tee 2', '$600', 'tee2.jpg'),
    ('Tee 3', '$550', 'tee3.jpg')
]

c.executemany('INSERT INTO products (name, price, image) VALUES (?, ?, ?)', products)

# 儲存變更並關閉連線
conn.commit()
conn.close()
