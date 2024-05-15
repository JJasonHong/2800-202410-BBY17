require("./utils.js");

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

const expireTime = 24 * 60 * 60 * 1000; //expires after 1 day  (hours * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var { database } = require("./databaseConnection");

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true,
  })
);

// Middleware to pass name to response locals
app.use((req, res, next) => {
  res.locals.name = req.session.name;
  next();
});

function isValidSession(req) {
  if (req.session.authenticated) {
    return true;
  }
  return false;
}

function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    next();
  } else {
    res.redirect("/login");
  }
}

function isAdmin(req) {
  if (req.session.user_type == "admin") {
    return true;
  }
  return false;
}

function adminAuthorization(req, res, next) {
  if (!isAdmin(req)) {
    res.status(403);
    res.render("errorMessage", { error: "Account not Authorized", navLinks: navLinks, currentURL: null });
  } else {
    next();
  }
}

database.connect((err, client) => {
  if (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
  console.log('Connected to MongoDB');
  
  const db = client.db('timeCapsule');
  const imageCollection = db.collection('images');

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  });

  const upload = multer({ storage: storage });

  // Ensure the uploads directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
  }

  // Image upload route
  app.post('/upload', upload.array('images', 12), (req, res) => {
    const { title, date } = req.body;
    const imageFiles = req.files.map(file => ({
      title,
      date: new Date(date),
      filename: file.filename,
      path: file.path
    }));

    imageCollection.insertMany(imageFiles)
      .then(result => {
        res.json({
          message: 'Files uploaded successfully',
          files: imageFiles
        });
      })
      .catch(err => {
        res.status(500).json({
          message: 'Failed to upload files',
          error: err
        });
      });
  });

  // Serve the upload form
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'createCapsule.ejs'));
  });

  app.listen(port, () => {
    console.log("Node application listening on port " + port);
  });
});
