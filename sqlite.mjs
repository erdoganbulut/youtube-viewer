import sqlite3 from 'sqlite3';

// Veritabanını bağla
const db = new sqlite3.Database('kullanici.db', (err) => {
  if (err) {
    console.error('Veritabanı bağlantı hatası:', err.message);
  } else {
    console.log('SQLite veritabanına başarıyla bağlandı.');
  }
});

// İşlemleri sıralı bir şekilde yürüt
db.serialize(() => {
  // Tablo oluştur
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mail TEXT NOT NULL,
    mailpassword TEXT NOT NULL,
    user_data TEXT NOT NULL,
    proxy TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Tablo oluşturma hatası:', err.message);
      return;
    }
    console.log('Tablo başarıyla oluşturuldu veya zaten mevcut.');

    // Veri ekleme
    const query = `INSERT INTO users (mail, mailpassword, user_data, proxy) VALUES (?, ?, ?, ?)`;
    db.run(query, ['erdogan@mail.com', 'erdogan123', '{"name":"tonguc"}', '192.168.1.1:8080'], function (err) {
      if (err) {
        console.error('Veri ekleme hatası:', err.message);
        return;
      }
      console.log(`Yeni kayıt eklendi. ID: ${this.lastID}`);

      // Verileri okuma
      db.all(`SELECT * FROM users`, [], (err, rows) => {
        if (err) {
          console.error('Veri okuma hatası:', err.message);
          return;
        }
        console.log('Kayıtlar:');
        rows.forEach((row) => {
          console.log(row);
        });

        // Bağlantıyı kapatma
        db.close((closeErr) => {
          if (closeErr) {
            console.error('Bağlantı kapatma hatası:', closeErr.message);
          } else {
            console.log('Veritabanı bağlantısı kapatıldı.');
          }
        });
      });
    });
  });
});
