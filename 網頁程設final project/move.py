import sqlite3

def move_favorites_manual(product_db='product.db', favorites_db='favorites.db'):
    print("🚀 開始搬移資料")

    try:
        # 連接來源資料庫 product.db
        conn_src = sqlite3.connect(product_db)
        cur_src = conn_src.cursor()
        print("✅ 已連接 product.db")

        # 連接目標資料庫 favorites.db
        conn_dest = sqlite3.connect(favorites_db)
        cur_dest = conn_dest.cursor()
        print("✅ 已連接 favorites.db")

        # 建立 favorites 表（如果尚未存在，且無外鍵）
        print("🛠 建立 favorites 表（如尚未存在）")
        cur_dest.execute('''
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                product_id INTEGER NOT NULL
            )
        ''')
        conn_dest.commit()

        # 檢查來源資料表是否存在
        cur_src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'")
        if not cur_src.fetchone():
            print("⚠️ 來源資料庫中沒有 favorites 資料表，搬移中止")
            return

        # 從 product.db 讀取資料
        print("📥 從 product.db 讀取資料")
        cur_src.execute('SELECT username, product_id FROM favorites')
        rows = cur_src.fetchall()
        print(f"📦 總共讀取到 {len(rows)} 筆資料")

        # 寫入到 favorites.db（不插入 id）
        print("📤 寫入到 favorites.db")
        cur_dest.executemany(
            'INSERT INTO favorites (username, product_id) VALUES (?, ?)',
            rows
        )
        conn_dest.commit()

        print(f"✅ 成功搬移 {len(rows)} 筆資料")

    except Exception as e:
        print("❌ 發生錯誤:", e)

    finally:
        cur_src.close()
        conn_src.close()
        cur_dest.close()
        conn_dest.close()
        print("🔚 所有連線已關閉")

if __name__ == "__main__":
    move_favorites_manual()
