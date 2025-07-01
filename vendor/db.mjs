import mysql from 'mysql2'
import { mlog, test } from './logs.js';
let sets = {
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPASS,
  database: process.env.DBNAME,
  port: process.env.DBPORT,
  charset: 'utf8mb4_general_ci',
  waitForConnections: true,
  connectionLimit: 100,
  maxIdle: 100, // max idle connections, the default value is the same as connectionLimit
  idleTimeout: 200, // idle connections timeout, in milliseconds, the default value is 60000
  queueLimit: 0,
  enableKeepAlive: false,
  keepAliveInitialDelay: 0
}

const pool = mysql.createPool(sets).promise()
async function start() {
    try {
        const connection = await pool.getConnection();
        console.log('Успешное подключение к БД');
        connection.release();
    } catch (e) {
        console.log('Ошибка подключения к БД:', e)
    }

}
await start()
export async function auth_user(userData) {
    try {

        // Извлечение email из объекта
        const email = userData.email;

        // Очистка email от пробелов и невидимых символов
        const cleanedEmail = email.trim().replace(/\s+/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        
        const [idAndPasswordRows] = await pool.query('SELECT ID, password FROM Users WHERE email = ?', [cleanedEmail]);
        const [userDetailsRows] = await pool.query('SELECT first_name, last_name, midle_name FROM Users WHERE email = ?', [cleanedEmail]);

        if (idAndPasswordRows.length === 0 || userDetailsRows.length === 0) {
            return null;
        }

        const { ID, password,  } = idAndPasswordRows[0];
        const { first_name, last_name, midle_name } = userDetailsRows[0];
        const name = `${last_name} ${first_name} ${midle_name}`;

        return { ID, password, name };
    } catch (error) {
        console.error('Ошибка при получении id и пароля по email:', error);
        throw error; 
    }
}
export async function get_roles(ID) {
    try {
    const [rows] = await pool.query('SELECT role FROM Users WHERE ID = ?', [ID]);

    return rows[0]; 
  } catch (error) {
    console.error('Ошибка при получении роли по id:', error);
    throw error; 
  }
}

export async function createRequest(orderData) {

    try {
        const { user_id, item_name, count, price, link, desired_date, comment } = orderData;
        // const formattedDate = formatDate(desired_date);
        const parsedCount = parseInt(count, 10);
        const parsedPrice = parseFloat(price);

        const [result] = await pool.query(
            'INSERT INTO Request (user_id, item_name, count, price, link, desired_date, comment) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user_id, item_name, parsedCount, parsedPrice, link, desired_date, comment || '']
        );

        return { success: true, insertId: result.insertId };
    } catch (error) {
        console.error('Произошла ошибка при отправке заявки', error)
        throw error;
    }
}

function formatDate(ruDate) {
  const [day, month, year] = ruDate.split('.');
  return `${year}-${month}-${day}`;
}

export async function GetUserRequests(user_id) {
  try {
    const [rows] = await pool.query(`SELECT ID, 
      item_name, 
      count, 
      price, 
      link, 
      DATE_FORMAT(desired_date, '%d.%m.%Y') AS desired_date,
      DATE_FORMAT(delivery_date, '%d.%m.%Y') AS delivery_date,
      status,
      comment
      FROM Request 
      WHERE user_id = ?`, [user_id]);

      return rows;
      
  } catch (error) {
    console.error('Ошибка при получении заявок пользователя:', error);
    throw error;
  }
}

export async function GetRequestById(id) {
  try {
    const [rows] = await pool.query(
      `SELECT item_name, 
      count, 
      price, 
      link, 
      DATE_FORMAT(desired_date, '%d.%m.%Y') AS desired_date, 
      comment 
      FROM Request WHERE id = ?`, 
      [id] 
    );
    return rows[0];
  } catch (error) {
    console.error('Ошибка при получении данных о товаре по ID:', error);
    throw error; 
  }
}
export async function updateRequestById(id, updatedData) {
    try {
        const count = Number(updatedData.count);
        const price = Number(updatedData.price);

        //const desiredDate = formatDate(updatedData.desired_date);
        
        const query = `UPDATE Request SET item_name = ?, count = ?, price = ?, desired_date = ?, comment = ? WHERE id = ?`;

        const values = [updatedData.item_name, count, price, updatedData.desired_date, updatedData.comment, id]; 

        const [result] = await pool.execute(query, values);

        return result.affectedRows > 0;
    } catch (error) {
        console.error('Ошибка при обновлении заявки:', error);
        throw error;
    }
}

export async function GetArchived() {
  try {
    const [rows] = await pool.query(
      `SELECT 
        r.ID,
        DATE_FORMAT(r.delivery_date, '%d.%m.%Y') AS delivery_date,
        r.comment,
        CONCAT(u.last_name, ' ', u.first_name, ' ', IFNULL(u.midle_name, '')) AS user_fullname,
        r.price * r.count AS total,
        r.item_name,
        r.link, 
        r.status
      FROM Request r
      JOIN Users u ON r.user_id = u.ID
      WHERE r.status = 4
      ORDER BY r.delivery_date DESC`
    );
    return rows;
  } catch (error) {
    console.error("Ошибка при получении архивных заказов:", error);
    throw error;
  }
}

export async function getAllUsersWithStats() {
  try {
    const [users] = await pool.query(
      `SELECT 
        u.ID,
        CONCAT(u.last_name, ' ', u.first_name, ' ', IFNULL(u.midle_name, '')) AS user_fullname,
        u.email,
        u.telphone,
        COUNT(r.ID) as order_count, 
        u.role
      FROM Users u
      LEFT JOIN Request r ON u.ID = r.user_id
      GROUP BY u.ID`
    );
    return users
  } catch (error) {
    console.error('Ошибка при получении пользователей:', error);
    throw error;
  }
}

export async function deleteUsers(id) {
  try {
    const [result] = await pool.query('DELETE FROM Users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Ошибка при удалении пользователя:', error.message);
    throw error;
  }
}

export async function GetAllRequest() {
  try {
    const [rows] = await pool.query(
      `SELECT 
        r.ID,
        r.user_id,
        CONCAT(u.last_name, ' ', u.first_name, ' ', IFNULL(u.midle_name, '')) AS user_fullname,
        r.item_name,
        r.count,
        r.price,
        r.link,
        r.status,
        DATE_FORMAT(r.desired_date, '%d.%m.%Y') AS desired_date,
        DATE_FORMAT(r.delivery_date, '%d.%m.%Y') AS delivery_date,
        r.comment
      FROM Request r
      JOIN Users u ON r.user_id = u.ID`
    );
    return rows;
  } catch (error) {
    console.error('Ошибка при получении данных о товаре по ID:', error);
    throw error; 
  }
}

export async function updateOrderById(id, { delivery_date, status, comment }) {
  let updateQuery=''
  let values = []
  if (delivery_date !=""){  
    updateQuery = `
          UPDATE Request SET 
            delivery_date = ?,
            status = ?,
            comment = ?
          WHERE id = ?
      `;
      values = [delivery_date, status, comment, id];
  }else{
    updateQuery = `
          UPDATE Request SET
            status = ?,
            comment = ?
          WHERE id = ?
      `;
      values = [status, comment, id];
  }
    const selectQuery = `SELECT * FROM Request WHERE id = ?`;

    try {
        // Сначала обновляем
        await pool.query(updateQuery, values);

        // Затем получаем обновлённую запись
        const [rows] = await pool.query(selectQuery, [id]);

        return rows[0] || null;
    } catch (err) {
        throw err;
    }
}

export async function updateStatusById(id, {status}) {
    const updateQuery = `
        UPDATE Request SET 
          status = ?
        WHERE id = ?
    `;
    const selectQuery = `SELECT * FROM Request WHERE id = ?`;

    const values = [status, id];

    try {
        // Сначала обновляем
        await pool.query(updateQuery, values);

        // Затем получаем обновлённую запись
        const [rows] = await pool.query(selectQuery, [id]);

        return rows[0] || null;
    } catch (err) {
        throw err;
    }
}

export async function GetAllStatuses() {
  try {
    const [rows] = await pool.query(
      `SELECT
    COUNT(IF(status = 0, 1, NULL)) AS new,
    COUNT(IF(status BETWEEN 1 AND 3, 1, NULL)) AS processing,
    COUNT(IF(status = 4, 1, NULL)) AS completed,
    COUNT(IF(status = 5, 1, NULL)) AS cancelled,
    COUNT(*) AS total
    FROM Request`
    );
    return rows;
  } catch (error) {
    console.error('Ошибка при получении данных о товаре по ID:', error);
    throw error; 
  }
}