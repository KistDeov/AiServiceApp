import mysql from 'mysql2';

// Adatbázis kapcsolat beállításai
const connection = mysql.createConnection({
  host: 'rendszer.okosmail.hu',
  user: 'aimail',
  password: 'kfawdwagfaw!378',
  database: 'aimail',
});

// Kapcsolódás az adatbázishoz
connection.connect((err) => {
  if (err) {
    console.error('Nem sikerült csatlakozni az adatbázishoz:', err.message);
    return;
  }
  console.log('Sikeres csatlakozás az adatbázishoz!');

  // Egyszerű lekérdezés
  connection.query('SELECT 1 + 1 AS solution', (err, results) => {
    if (err) {
      console.error('Lekérdezési hiba:', err.message);
    } else {
      console.log('Lekérdezés eredménye:', results[0].solution);
    }

    // Kapcsolat lezárása
    connection.end((err) => {
      if (err) {
        console.error('Hiba a kapcsolat lezárásakor:', err.message);
      } else {
        console.log('Kapcsolat lezárva.');
      }
    });
  });
});