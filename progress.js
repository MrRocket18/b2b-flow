import { mlog, test } from './vendor/logs.js';
import { format } from 'date-fns';
var appDir = path.dirname(import.meta.url);
appDir = appDir.split('///');
appDir = appDir[1];
console.log(appDir);

process.on('uncaughtException', (err) => {
    mlog("Глобальный косяк приложения!!", err.stack);
});

import express from 'express';
import exphbs from 'express-handlebars';
import fileUpload from 'express-fileupload';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs-extra';
import 'dotenv/config';
import * as db from './vendor/db.mjs';
import bcrypt from 'bcryptjs';

import handlebarsHelpers from 'handlebars-helpers';
const allHelpers = handlebarsHelpers(); 

import { type } from 'os';
import { request } from 'http';

const app = express();
const hbs = exphbs.create({
  defaultLayout: 'main',
  extname: 'hbs',
  helpers: {
    ...allHelpers,
    isEqual: (a, b) => a == b,
    lookupStatusLabel: (status) => {
      switch (status) {
        case 'active': return 'Активен';
        case 'inactive': return 'Неактивен';
        case 'pending': return 'На проверке';
        default: return status;
      }
    },
    pluralize: (n, one, few, many) => {
      const mod10 = n % 10, mod100 = n % 100;
      if (mod10 == 1 && mod100 !== 11) return one;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
      return many;
    },
    json: function(context) {
      return JSON.stringify(context);
    },
    formatDate: function(dateString, format = 'DD.MM.YYYY') {
      if (!dateString) return '—';
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); 
      const year = date.getFullYear();

      if (format == 'DD.MM.YYYY') {
        return `${day}.${month}.${year}`;
      } else if (format === 'YYYY-MM-DD') {
        return `${year}-${month}-${day}`;
      } else {
        return date.toLocaleDateString();
      }
    }
  }
});

const TEMP_FOLDER = path.join(appDir, 'public/temp');



app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', 'views');

if (test) {
    app.use(express.static(path.join(appDir, 'public')));
    app.set('views', 'views');
} else {
    app.use(express.static(path.join('/', appDir, 'public')));
    app.set('views', path.join('/', appDir, 'views'));
}

console.log(path.join(appDir, 'public'));

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
// app.use(fileUpload());
app.set('trust proxy', 1);

app.use(session({
    resave: true,
    saveUninitialized: false,
    secret: 'keyboard cat',
    cookie: {
        secure: false, // TODO: change to true for HTTPS!
        httpOnly: true
    }
}));

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: TEMP_FOLDER,
    defCharset: 'utf8',
    defParamCharset: 'utf8'
}));

app.use(express.json()); // long application/json


app.use(async function (req, res, next) {
  const page = req._parsedOriginalUrl.pathname;
  if (req.session.uid==undefined) { 
        if (page!='/' ) {
            res.redirect("/")
        } else next();
    } else {
        if (page=='/') {
          if (req.session.role=="User"){
            res.redirect("/applications")
          }
          else {
            res.redirect("/manager")}
        } else next();
    } 
});


app.get('/', (req, res) => {
  res.render('authorization', {
    title: 'Authorization'
  });
});

app.post('/', async(req, res) => {
  console.log(req.body);

  // const {email, password} = req.body;
  let email = req.body.email;
  let password = req.body.password;

  if (!email) {
    return res.status(400).send("Email required");
  }
  if (!password){
    return res.status(400).send("Password required");
  }
  try{
    const user = await db.auth_user({email});
    console.log(user)

    if (!user){
      return res.status(401).send("Invalid credentials");
    }
    const isPassword = await bcrypt.compare(password, user.password);

    if (isPassword) {
      req.session.uid = user.ID;
      req.session.name = user.name;
      const {role} = await db.get_roles(req.session.uid);
      req.session.role = role;
      mlog(req.session.role);
      res.send('ok')
    }
    else{
      res.send('not ok')
      return res.status(401).send("Invalid credentails");
    }
  } catch(error){
    console.error("Ошибка аунтефикации:", error);
    res.status(500).send('Internal Server Error');
  }
})

app.get('/applications', async (req, res) => {
  if (req.session.role != 0) {
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`);
    return res.redirect('/manager');
  }


  try {
    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);
    const requests = await db.GetUserRequests(req.session.uid);
    res.render('applications', {
      session: req.session,
      role: req.session.role,
      title: 'Мои заявки',
      requests: requests,
      todayDate: todayDate
    });
  } catch (error) {
    console.error("Ошибка при получении заявок:", error);
    res.status(500).send("Ошибка сервера при получении заявок.");
  }
});
app.get('/get-order/:id', async (req,res)=> {
  const id = req.params.id
  const request = await db.GetRequestById(id)
  
  res.json(request) 
})
app.get('/manager', async (req, res) => {
  if (req.session.role != 1) {
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/applications');
  }

  try {
    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);

    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;

    const requests = await db.GetAllRequest(); // Все заявки
    const summary = await db.GetAllStatuses(dateFrom, dateTo); // С учётом фильтра

    // Если это AJAX-запрос
    if (req.xhr || req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ summary });
    }

    // Обычный запрос — рендерим страницу
    res.render('all_applic', {
      session: req.session,
      role: req.session.role,
      title: 'Все заказы',
      summary: summary,
      requests: requests,
      todayDate: todayDate
    });

  } catch (error) {
    console.error("Ошибка при получении заявок:", error);
    res.status(500).send("Ошибка сервера при получении заявок.");
  }
});

app.post('/edit-admin/:ID', async (req, res) => {
    const id = req.params.ID;
    console.log('ID:', id); 
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'Неверный ID' });
    }

    try {
        const updatedData = {
            item_name: req.body.item_name,
            count: Number(req.body.count),
            status: Number(req.body.status),
            delivery_date: req.body.delivery_date,
            comment: req.body.comment
        };
        console.log(updatedData)
        const success = await db.updateAdmRequestById(Number(id), updatedData);

        if (success) {
            return res.redirect('/manager')
        } else {
            return res.status(500).json({ error: 'Не удалось обновить заявку' });
        }
    } catch (error) {
        console.error('Ошибка при обновлении заявки:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


app.get('/arch', async (req, res) => {
  if(req.session.role != 1){
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/applications')
  } 
  const arch = await db.GetArchived();
  
  res.render('archive', {
    session: req.session,
    role: req.session.role,
    title: 'Archive',
    arch:arch
  });
});

app.get('/base', async (req, res) => {
  if(req.session.role != 1){
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/applications')
  } 
  const base = await db.getAllUsersWithStats();
  res.render('base', {
    session: req.session,
    role: req.session.role,
    title: 'Base of users',
    base: base
  });
});

app.post('/create', async (req, res) => {
  try {
    const user_id = req.session.uid;
    const { item_name, count, price, link, desired_date, comment } = req.body;

    const result = await db.createRequest({user_id, item_name, count, price, link, desired_date, comment});

    if (result.success) {
      return res.redirect("/applications")
    } else {
      return res.status(500).json({ success: false, message: result.message });
    }

  } catch (error) {
    console.error("Полная ошибка:", error);
    return res.status(500).send("Произошла внутренняя ошибка сервера");
  }
});

app.post('/order-cancel/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }

  try {
    const success = await db.updateStatusById(orderId, { status: 5 });
    if (success) {
      return res.json({ success: true, message: 'Заказ отменён' });
    } else {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
  } catch (err) {
    console.error('Ошибка при отмене заказа:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.get('/edit', async (req, res) => {
  if(req.session.role != 0)
  {
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/manager')
  }
  const { id } = req.query;
  try {
    const request = await db.GetRequestById(id);

    if (!request) {
      return res.status(404).send('Заявка не найдена');
    }

    res.render('editing', {
      session: req.session,
      role: req.session.role,
      title: 'Редактирование заявки',
      request: request,
      id: id
    });

  } catch (error) {
    console.error('Ошибка при загрузке заявки:', error);
    res.status(500).send('Ошибка сервера');
  }
});

app.post('/edit/:ID', async (req, res) => {
    const id = req.params.ID;
    console.log('ID:', id); 
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'Неверный ID' });
    }

    try {
        const updatedData = {
            item_name: req.body.item_name,
            count: Number(req.body.count),
            price: Number(req.body.price),
            desired_date: req.body.desired_date,
            comment: req.body.comment
        };
        console.log(updatedData)
        const success = await db.updateRequestById(Number(id), updatedData);

        if (success) {
            return res.redirect('/applications')
        } else {
            return res.status(500).json({ error: 'Не удалось обновить заявку' });
        }
    } catch (error) {
        console.error('Ошибка при обновлении заявки:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/delete-user', async (req, res) => {
    const id = req.body.id;

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ success: false, error: 'Неверный ID' });
    }

    try {
        const success = await db.deleteUsers(Number(id));

        if (success) {
            return res.json({ success: true, message: 'Пользователь удален' });
        } else {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }
    } catch (error) {
        console.error('Ошибка при удалении пользователя:', error);
        return res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/admin-update/:id', async (req, res) => {
    const orderId = parseInt(req.params.id);
    const { delivery_date, status, comment } = req.body;

    if (!orderId || isNaN(orderId)) {
        return res.status(400).json({ success: false, message: 'Неверный ID' });
    }

    try {
        const updatedOrder = await db.updateOrderById(orderId, {
            delivery_date,
            status: parseInt(status),
            comment
        });

        if (updatedOrder) {
            return res.json({ success: true, message: 'Данные заказа обновлены' });
        } else {
            return res.status(404).json({ success: false, message: 'Заказ не найден' });
        }
    } catch (error) {
        console.error('Ошибка:', error);
        return res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

app.post('/archive-update/:id', async (req, res) => {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    // Проверка ID
    if (!orderId || isNaN(orderId)) {
        return res.status(400).json({ success: false, error: 'Неверный ID' });
    }

    // Проверка статуса
    const parsedStatus = parseInt(status);
    if (isNaN(parsedStatus)) {
        return res.status(400).json({ success: false, error: 'Неверный статус' });
    }

    try {
        // Вызываем метод из db.mjs
        const updatedOrder = await db.updateStatusById(orderId, {
            status: parsedStatus
        });

        if (updatedOrder) {
            return res.json({ success: true, message: 'Статус успешно изменён' });
        } else {
            return res.status(404).json({ success: false, error: 'Заказ не найден' });
        }
    } catch (error) {
        console.error('Ошибка при обновлении заказа:', error);
        return res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/logout',(req,res)=> {
  req.session.role = "";
  req.session.uid = undefined;
  req.session.name = "";
  res.redirect('/');
})
async function start() {
    try {
        app.listen(process.env.PORT, () => {
            mlog('Сервер прогресс репорта - запущен')
            mlog('Порт:', process.env.PORT);
        });
    } catch (e) {
        mlog('Ошибка запуска сервера:', e);
    }
}

await start();