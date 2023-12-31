const express = require('express')
const sqlite3 = require('sqlite3')
const session = require('express-session')
const { authenticator } = require('otplib')
const QRCode = require('qrcode')
 const { expressjwt: expressjwt } = require("express-jwt");
const jwt = require('jsonwebtoken');

const bodyParser = require('body-parser')
const app = express()
const port = 3000

app.set('view engine', 'ejs')

app.use(session({
    secret: 'supersecret',
    
}))

app.use(bodyParser.urlencoded({ extended: false }))

const db = new sqlite3.Database('db.sqlite')
db.serialize(() => {
    //db.run('DROP TABLE IF EXISTS `users`')
    db.run('CREATE TABLE IF NOT EXISTS `users` (`user_id` INTEGER PRIMARY KEY AUTOINCREMENT, `email` VARCHAR(255) NOT NULL, `secret` varchar(255) NOT NULL)')
})
db.close()

app.listen(port, () => {
    console.log(`2FA Node app listening at http://localhost:${port}`)
})

app.get('/', (req, res) => {
    res.render('signup.ejs')
})

app.post('/sign-up', (req, res) => {
    const email = req.body.email,
        secret = authenticator.generateSecret()

        
    const db = new sqlite3.Database('db.sqlite')
    db.serialize(() => {
        db.run('INSERT INTO `users`(`email`, `secret`) VALUES (?, ?)',
            [email, secret],
            (err) => {
                if (err) {
                    throw err
                }

                //generate qr and put it in session
                QRCode.toDataURL(authenticator.keyuri(email, '2FA Node App', secret), (err, url) => {
                    if (err) {
                        throw err
                    }
                
                    req.session.qr = url
                    req.session.email = email
                    res.redirect('/sign-up-2fa')
                })
            })
    })

    app.get('/sign-up-2fa', (req, res) => {
        if (!req.session.qr) {
            return res.redirect('/')

        }

        return res.render('signup-2fa.ejs', { qr: req.session.qr })

    })



})

app.post('/sign-up-2fa',(req,res) => {
    if (!req.session.email) {
        return res.redirect('/')
    }

    const email = req.session.email, code = req.body.code

    return verifyLogin(email, code , req, res, '/sign-up-2fa')


})


function verifyLogin (email, code, req, res, failUrl) {
    //load user by email
    const db = new sqlite3.Database('db.sqlite')
    db.serialize(() => {
      db.get('SELECT secret FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          throw err
        }
  
        if (!row) {
          return res.redirect('/')
        }
        console.log(row.secret)
        if (!authenticator.check(code, row.secret)) {
          //redirect back

      
          return res.redirect(failUrl)
        }
  
        //correct, add jwt to session
        req.session.qr = null
        req.session.email = null
        req.session.token = jwt.sign(email, 'supersecret')
  
        //redirect to "private" page
        return res.redirect('/private/?user='+email)
      })
    })
  }

  app.get('/login', (req, res) => {
    return res.render('login.ejs')

  })

  app.post('/login', (req, res) => {
    //verify login
    const email = req.body.email,
      code = req.body.code
  
    return verifyLogin(email, code, req, res, '/login')
  })

  const jwtMiddleware = expressjwt({
    secret: 'supersecret',
    algorithms: ['HS256'],
    getToken: (req) => {
   
      return req.session.token
    }
  })

  app.get('/private', jwtMiddleware, (req, res) => {
    console.log(req)
    return res.render('private.ejs', { email: req.query.user})
  })

  app.get('/logout', jwtMiddleware, (req, res) => {
    req.session.destroy()
    return res.redirect('/')

  })