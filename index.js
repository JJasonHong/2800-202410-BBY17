
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

app.use(express.static(__dirname + '/public'));


const Joi = require("joi");

const expireTime = 60 * 60 * 1000; 

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.MONGODB_SESSION_SECRET;

/* END secret section */

const MongoClient = require("mongodb").MongoClient;
const atlasURI = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`;
var database = new MongoClient(atlasURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
app.use(express.urlencoded({ extended: false }));

const mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.set('view engine', 'ejs');

const userCollection = database.db(mongodb_database).collection("users");

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true,
  })
);

function isValidSession(req) {
  if (req.session.authenticated) {
      return true;
  }
  return false;
}
function sessionValidation(req,res,next) {
  if (isValidSession(req)) {
      next();
  }
  else {
      res.redirect('/');
  }
}

// Inside the adminAuthorization middleware
function adminAuthorization(req, res, next) {
  console.log("User type in session:", req.session.user_type); // Check if user_type is present in the session
  if (req.session.user_type === 'admin') {
    console.log("User is authorized as admin."); // Log when user is authorized
    next(); // Allow access to the admin page
  } else {
    console.log("User is not authorized as admin."); // Log when user is not authorized
    res.status(403);
    res.render("errorMessage", { error: "Not Authorized" });
  }
};

app.get("/", (req, res) => {
 res.render("index");
});

app.get("/nosql-injection", async (req, res) => {
  var username = req.query.user;

  if (!username) {
    res.send(
      `<h3>no user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`
    );
    return;
  }
  console.log("user: " + username);

  const schema = Joi.string().max(20).required();
  const validationResult = schema.validate(username);

  //If we didn't use Joi to validate and check for a valid URL parameter below
  // we could run our userCollection.find and it would be possible to attack.
  // A URL parameter of user[$ne]=name would get executed as a MongoDB command
  // and may result in revealing information about all users or a successful
  // login without knowing the correct password.
  if (validationResult.error != null) {
    console.log(validationResult.error);
    res.send(
      "<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>"
    );
    return;
  }

  const result = await userCollection
    .find({ username: username })
    .project({ username: 1, password: 1, _id: 1 })
    .toArray();

  console.log(result);

  res.send(`<h1>Hello ${username}</h1>`);
});

app.post("/submitUser", async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    console.log(name);
    return res.send("Name, email, and password are required. <a href='/'>Try again</a>");
  }

  const schema = Joi.object({
    name: Joi.string().max(30).required(),
    email: Joi.string().email({ minDomainSegments: 2, tlds: { allow: ["com", "net"] } }).required(),
    password: Joi.string().min(3).max(50).required(),
  });

  const { error } = schema.validate({ name, email, password });

  if (error) {
    return resres.render("index", { error: error.details[0].message });
  }

  const hashedPassword = await bcrypt.hash(password, saltRounds);

  await userCollection.insertOne({ name, email, password: hashedPassword });

  req.session.authenticated = true;
  req.session.email = email;
  req.session.name = name;
  req.session.cookie.maxAge = expireTime;

  return res.redirect("/members");
});

app.get("/loginSignUp", (req, res) => {
  res.render("loginSignUp");
 })

app.post("/loggingin", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  const schema = Joi.string().email().required();
  const validationResult = schema.validate(email);
  if (validationResult.error != null) {
    var html = `Invalid email/password combination.
                <a href="/">Try again</a>
    `;
    res.send(html);
    return;
  }

  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, username: 1, password: 1, _id: 1 })
    .toArray();

  console.log(result);
  if (result.length != 1) {
    console.log("user not found");
    var html = `Invalid email/password combination.
                <a href="/">Try again</a>
    `;
    res.send(html);
    // res.redirect("/login");
    return;
  }
  if (await bcrypt.compare(password, result[0].password)) {
    console.log("correct password");
    req.session.authenticated = true;
    req.session.email = result[0].email;
    req.session.cookie.maxAge = expireTime;

    res.redirect("/loggedin");
    return;
  } else {
    console.log("incorrect password");

    var html = `Invalid email/password combination.
                <a href="/">Try again</a>
    `;
    res.send(html);
    // res.redirect("/login");
    return;
  }
});

app.get("/loginsignup", (req, res) => {
  res.render("loginsignup");
 });

app.get("/loggedin", async (req, res) => {
  if (!req.session.authenticated) {
    res.redirect("/");
  }

  console.log(req.session.email);
  const result = await userCollection.findOne({ email: req.session.email });
  res.redirect("/members");
});

app.use(express.static(__dirname + "/public"));

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/forgotPassword", (req, res) => {
  res.render("forgotPassword");
 }); 

app.get("*", (req, res) => {
  res.status(404);
  res.send("Page not found - 404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});
