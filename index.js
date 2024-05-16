require("./utils.js");

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const saltRounds = 12;
const path = require('path');
const favicon = require('serve-favicon');
const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

const expireTime = 24 * 60 * 60 * 1000; //expires after 1 day  (hours * minutes * seconds * millis)
app.set("view engine", "ejs");




/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var { database } = include("databaseConnection");

const userCollection = database.db(mongodb_database).collection("users");

const url = require('url');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

app.use(express.urlencoded({ extended: false }));

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
  
  // app.use('/', sessionValidation);
  app.get("/", (req, res) => {
    res.render("index");
   
  });

  
  
  app.use(express.static(__dirname + "/public"));

  app.listen(port, () => {
    console.log("Node application listening on port" + port);
  });