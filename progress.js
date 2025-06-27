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
  extname: '.hbs',        
  helpers: {
   ...allHelpers,
   isEqual: (a, b) => a == b,
  }
}); // используем хелперы для определение статуса в navbar

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
      return res.status(401).send("Invalid credentails");
    }
  } catch(error){
    console.error("Ошибка аунтефикации:", error);
    res.status(500).send('Internal Server Error');
  }
})
// app.get('/user', (req, res) => {
//   res.render('applications', {
//     title: 'My requests'
//   });
// });

app.get('/applications', async (req, res) => {
  if (req.session.role !== "User") {
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`);
    return res.redirect('/manager');
  }


  try {
    const requests = await db.GetUserRequests(req.session.uid);

    res.render('applications', {
      session: req.session,
      role: req.session.role,
      title: 'Мои заявки',
      requests
    });
  } catch (error) {
    console.error("Ошибка при получении заявок:", error);
    res.status(500).send("Ошибка сервера при получении заявок.");
  }
});

app.get('/manager', (req, res) => {
  if(req.session.role!="Admin"){
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/applications');
  } 

  try { 
    //const requests = await db.GetRequests();

    res.render('all_applic', {
      session: req.session,
      role: req.session.role,
      title: 'My requests',
      //requests
    });
  } catch (error) { 
    console.error("Ошибка при получении заявок:", error);
    res.status(500).send("Ошибка сервера при получении заявок."); 
  }
});

app.get('/arch', (req, res) => {
  if(req.session.role!="Admin"){
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/applications')
  } 
  res.render('archive', {
    title: 'Archive'
  });
});

app.get('/base', (req, res) => {
  if(req.session.role!="Admin"){
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/applications')
  } 
  res.render('base', {
    title: 'Base of users'
  });
});

app.get('/create', (req, res) => {
  if(req.session.role!="User")
  {
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`)
    return res.redirect('/manager')
  }
  res.render('creating', {
    title: 'Create request'
  });
});

app.post('/create', async (req, res) => {
  try {
    console.log("req.body:", req.body);

    const user_id = req.session.uid;
    const { item_name, count, price, link, desired_date, comment } = req.body;

    //console.log("Вызываю createRequest с:", {user_id, item_name, count, price, link, desired_date, comment});

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

app.get('/edit', async (req, res) => {
  const { id } = req.query;

  if (!id || isNaN(Number(id))) {
    return res.status(400).send('Некорректный ID');
  }

  try {
    const request = await db.getRequestById(Number(id));

    if (!request) {
      return res.status(404).send('Заявка не найдена');
    }

    res.render('editing', {
      title: 'Редактирование заявки',
      request: request,
      id: id
    });

  } catch (error) {
    console.error('Ошибка при загрузке заявки:', error);
    res.status(500).send('Ошибка сервера');
  }
});

app.post('/edit', async (req, res) => {
    console.log('req.body:', req.body); 
    const id = req.body.id;
    console.log('ID:', id); 
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'Неверный ID' });
    }

    try {
        const updatedData = {
            item_name: req.body.item_name,
            count: Number(req.body.count),
            price: Number(req.body.price),
            link: req.body.link,
            desired_date: req.body.desired_date,
            comment: req.body.comment
        };

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



app.get('/repeat', async (req, res) => { 
  if (req.session.role !== "User") {
    console.log(`Попытка доступа к странице ${req._parsedOriginalUrl.pathname} пользователем с ролью ${req.session.role}`);
    return res.redirect('/manager');
  }

  const requestId = req.query.id;

  try {
    const originalRequest = await db.GetRequestById(requestId); 
    console.log(originalRequest)
    res.render('repeat', {
      title: 'Повторная заявка',
      originalRequest: originalRequest,
    });
  } catch (error) {
    console.error('Ошибка при получении данных заявки:', error);
    res.status(500).send('Ошибка сервера');
  }
});
app.post('/repeat',  async (req, res) => {

  const user_id = req.session.uid; 
  const {item_name, price, count, link, desired_date, comment} = req.body;
  console.log(item_name, price, count, link, desired_date, comment)
  try{
     const result = await db.createRequest({user_id, item_name, count, price, link, desired_date, comment});

     if (result.success) {
      return res.redirect("/applications")
    } else {
      return res.status(500).json({ success: false, message: result.message });
    }
  }
  catch(error) {
    console.error('Ошибка при отпраки повторной заявки:', error);
    res.status(500).send('Ошибка сервера');
  }
});
app.get('/logout',(req,res)=> {
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